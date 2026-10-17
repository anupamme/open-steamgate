import {createGoTestDir} from "./go-test-module.mjs";
import {test} from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdtempSync, rmSync, writeFileSync, cpSync, readFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {basename, dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import {compileProgram} from "./frontend.mjs";
import {emitGo} from "./emit-go.mjs";
import {libraryPath} from "../osd-lib-path.mjs";
import {home} from "./home.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const core = libraryPath(home, "open-abap-core");

test("KERNEL_LOCK hooks receive SAP-shaped requests and map results", {timeout: 120000}, () => {
  const {dir: goDir, goRoot} = createGoTestDir(`gogen-enqseam-test-${process.pid}-`);
  try {
    const program = compileProgram({folders: [core, join(here, "testdata-enq-seam")], objects: ["ZCL_GOGEN_ENQ_SEAM"]});
    writeFileSync(join(goDir, "zz_generated.go"), emitGo(program));
    writeFileSync(join(goDir, "seam_test.go"), String.raw`
package main

import (
 "errors"
 "fmt"
 "testing"
 "time"

 "osg/gogen/abap"
 "osg/gogen/enq"
 "osg/gogen/enqseam"
 "osg/gogen/hostclass"
)

func TestKernelLockSeam(t *testing.T) {
 s := &abap.Session{}
 h := &hostclass.KERNEL_LOCK
 defer func() { h.Enqueue, h.Dequeue, h.DequeueAll = nil, nil, nil }()
 ZCL_GOGEN_ENQ_SEAM_ALL_KEYS(s)
 req := requests[len(requests)-1]
 want := enq.Request{Client: "100", Table: "ZGOGEN_ENQ_TAB", Object: "EZGOGEN_ENQ", Mode: "X", Scope: 3,
 Fields: []enq.Field{{Value: "OBJ", Length: 10}, {Value: "0017", Length: 4}}}
 if fmt.Sprint(req) != fmt.Sprint(want) || waits != 1 { t.Fatalf("all keys: %#v waits %d", req, waits) }
 ZCL_GOGEN_ENQ_SEAM_GENERIC_KEYS(s)
 req = requests[len(requests)-1]
 want = enq.Request{Client: "123", Table: "ZGOGEN_ENQ_TAB", Object: "EZGOGEN_ENQ", Mode: "E", Scope: 2,
  Fields: []enq.Field{{Generic: true, Length: 10}, {Value: "0000", Generic: true, Length: 4}}}
 if fmt.Sprint(req) != fmt.Sprint(want) { t.Fatalf("generic: %#v", req) }
 if nilSleeps != 1 { t.Fatalf("sleep is not nil without _WAIT: %d", nilSleeps) }
 ZCL_GOGEN_ENQ_SEAM_LITERAL_AND_NUMC_ZERO(s)
 req = requests[len(requests)-1]
 if req.Fields[0].Generic || req.Fields[0].Value != "" || !req.Fields[1].Generic || req.Fields[1].Value != "0000" { t.Fatalf("literal/zero: %#v", req) }
 ZCL_GOGEN_ENQ_SEAM_DEFAULTS(s)
 req = requests[len(requests)-1]
 if req.Mode != "E" || req.Scope != 2 || !req.Fields[1].Generic || req.Fields[1].Value != "" { t.Fatalf("defaults: %#v", req) }

 // Invalid scope values follow the Node server's effective default.
 for _, tc := range []struct{ text string; scope int }{{"4",2},{"A",2},{"1",1},{"3",3},{"",2}} {
  st := enq.New("scope"); sid := st.Open("A")
  r := enqseam.Request(s, enqseam.Table{Name:"T", Key:[]enqseam.Field{{Name:"NAME",Kind:'C',Length:10}}}, "ET", enqseam.Args{"NAME":"OBJ", "_SCOPE":tc.text})
  if r.Scope != tc.scope { t.Errorf("scope %q = %d, want %d",tc.text,r.Scope,tc.scope) }
  if got := st.Enqueue(sid,r,false); got.Subrc != 0 { t.Fatal(got) }
  st.Dequeue(sid,r)
  if len(st.Read(enq.Filter{})) != 0 { t.Errorf("scope %q left an unreleasable row",tc.text) }
  st.Close()
 }

 // the step is the caller's own Session, before and after a yield sleep
 var before, after any
 h.Enqueue = func(step any, r enq.Request, sleep func(time.Duration)) (enq.Result, error) {
  before = step
  if sleep != nil { sleep(time.Millisecond) }
  after = step
  return enq.Result{}, nil
 }
 ZCL_GOGEN_ENQ_SEAM_ALL_KEYS(s)
 if before != any(s) || after != any(s) { t.Fatal("the lock hook did not get the calling step's Session") }
 h.Enqueue = func(any, enq.Request, func(time.Duration)) (enq.Result, error) { return enq.Result{Subrc: 1, Msgno: "601", Holder: "OTHER"}, nil }
 ZCL_GOGEN_ENQ_SEAM_FOREIGN_LOCK(s)
 if s.Sy.Subrc != 1 || s.Sy.Msgid != "MC" || s.Sy.Msgty != "E" || s.Sy.Msgno != "601" || s.Sy.Msgv1 != "OTHER" { t.Fatalf("foreign: %#v", s.Sy) }
 h.Enqueue = func(any, enq.Request, func(time.Duration)) (enq.Result, error) { return enq.Result{Subrc: 9}, nil }
 ZCL_GOGEN_ENQ_SEAM_SYSTEM_FAILURE(s)
 if s.Sy.Subrc != 2 { t.Fatalf("system failure: %d", s.Sy.Subrc) }
 h.Enqueue = func(any, enq.Request, func(time.Duration)) (enq.Result, error) { return enq.Result{}, errors.New("host down") }
 var dumped any
 func() { defer func() { dumped = recover() }(); ZCL_GOGEN_ENQ_SEAM_DEFAULTS(s) }()
 if dumped == nil { t.Fatal("error was swallowed") }
 hookCalls = 0
 h.Enqueue = func(any, enq.Request, func(time.Duration)) (enq.Result, error) { hookCalls++; return enq.Result{}, nil }
 ZCL_GOGEN_ENQ_SEAM_COLLECT(s)
 if s.Sy.Subrc != 2 || hookCalls != 0 { t.Fatalf("collect: rc %d calls %d", s.Sy.Subrc, hookCalls) }
 hostclass.KERNEL_LOCK.Enqueue = nil
 var nilHook any
 func() { defer func() { nilHook = recover() }(); ZCL_GOGEN_ENQ_SEAM_DEFAULTS(s) }()
 if nilHook == nil { t.Fatal("nil Enqueue hook changed the refusal") }

 hostclass.KERNEL_LOCK.Dequeue = func(_ any, r enq.Request) error { requests = append(requests, r); return nil }
 ZCL_GOGEN_ENQ_SEAM_DEQUEUE(s)
 req = requests[len(requests)-1]
 if req.Mode != "E" || req.Scope != 2 || req.Client != "100" { t.Fatalf("dequeue count %d: %#v", len(requests), req) }
 var nilDequeue any
 h.Dequeue = nil
 func() { defer func() { nilDequeue = recover() }(); ZCL_GOGEN_ENQ_SEAM_DEQUEUE(s) }()
 if nilDequeue == nil { t.Fatal("nil Dequeue hook changed the refusal") }

 h.DequeueAll = func(any) error { return nil }
 ZCL_GOGEN_ENQ_SEAM_DEQUEUE_ALL(s)
 if s.Sy.Subrc != 0 { t.Fatalf("dequeue all: %d", s.Sy.Subrc) }
 var nilAll any
 h.DequeueAll = nil
 func() { defer func() { nilAll = recover() }(); ZCL_GOGEN_ENQ_SEAM_DEQUEUE_ALL(s) }()
 if nilAll == nil { t.Fatal("nil DequeueAll hook changed the refusal") }
}

var requests []enq.Request
var waits, hookCalls, nilSleeps int

func init() {
 hostclass.KERNEL_LOCK.Enqueue = func(step any, r enq.Request, sleep func(time.Duration)) (enq.Result, error) {
 hookCalls++
 requests = append(requests, r)
 if sleep == nil { waits--; nilSleeps++ } else { waits++ }
 return enq.Result{}, nil
 }
 hostclass.KERNEL_LOCK.Dequeue = func(step any, r enq.Request) error { requests = append(requests, r); return nil }
}
`);
    const run = spawnSync("go", ["test", "-vet=off", "-timeout=10s", `./cmd/${basename(goDir)}`], {
      cwd: goRoot, encoding: "utf8", timeout: 110000,
      env: {...process.env, GOFLAGS: "-buildvcs=false", GOCACHE: process.env.GOCACHE ?? join(home, ".local/enqseam/go-cache")},
    });
    assert.equal(run.status, 0, run.stderr || run.stdout);
  } finally {
    rmSync(goRoot, {recursive: true, force: true});
  }
});

// The widths are measured from request() and the actual Node runtime types
// in .local/enqseam/js-parity-r2.txt, including numeric value-length fallback.
test("lock key widths match Node for every DDIC key kind", () => {
 const dir = mkdtempSync(join(here, ".out", "enq-width-"));
 try {
  cpSync(join(here,"testdata-enq-seam"),dir,{recursive:true});
  const fields = [["MANDT","CLNT",3,3],["NAME","CHAR",10,10],["NUM","NUMC",4,4],
   ["DAY","DATS",8,8],["CLOCK","TIMS",6,6],["BYTE","INT1",3,1],["SHORT","INT2",5,1],
   ["INT","INT4",10,1],["LONG","INT8",19,1],["AMOUNT","DEC",7,4],["BYTES","RAW",3,3]];
  const tablePath = join(dir,"zgogen_enq_tab.tabl.xml");
  const table = readFileSync(tablePath,"utf8");
  const columns = fields.map(([name,kind,len])=>`<DD03P><FIELDNAME>${name}</FIELDNAME><KEYFLAG>X</KEYFLAG><DATATYPE>${kind}</DATATYPE><LENG>${len}</LENG><DECIMALS>2</DECIMALS></DD03P>`).join("");
  writeFileSync(tablePath,table.replace(/<DD03P_TABLE>[\s\S]*?<\/DD03P_TABLE>/,`<DD03P_TABLE>${columns}</DD03P_TABLE>`));
  const program = compileProgram({folders:[dir],objects:[]});
  assert.deepEqual(program.lockObjects.get("EZGOGEN_ENQ").fields.map(f=>[f.name,f.length]), fields.map(([name,, ,width])=>[name,width]));
  writeFileSync(tablePath,readFileSync(tablePath,"utf8").replace('<DATATYPE>DATS</DATATYPE>','<DATATYPE>STRG</DATATYPE>'));
  assert.throws(()=>compileProgram({folders:[dir],objects:[]}),/ZGOGEN_ENQ_TAB.*DAY/);
 } finally { rmSync(dir,{recursive:true,force:true}); }
});

test("an omitted DATS key blocks another session's specific date", {timeout:120000}, () => {
 const dir = mkdtempSync(join(here, ".out", "enq-date-"));
 const {dir: goDir, goRoot} = createGoTestDir("gogen-enq-date-");
 try {
  cpSync(join(here,"testdata-enq-seam"),dir,{recursive:true});
  const tablePath=join(dir,"zgogen_enq_tab.tabl.xml");
  writeFileSync(tablePath,readFileSync(tablePath,"utf8").replace('<DATATYPE>NUMC</DATATYPE>','<DATATYPE>DATS</DATATYPE>').replace('<LENG>000004</LENG>','<LENG>000008</LENG>'));
  const classPath=join(dir,"zcl_gogen_enq_seam.clas.abap");
  writeFileSync(classPath,readFileSync(classPath,"utf8").replaceAll("'0017'","'20261008'").replace("mandt = '100' name = name num = num", "name = name num = num").replace("mode_zgogen_enq_tab = 'X' _scope = '3' _wait = 'X'", "mode_zgogen_enq_tab = 'E'"));
  writeFileSync(join(goDir,"zz_generated.go"),emitGo(compileProgram({folders:[core,dir],objects:["ZCL_GOGEN_ENQ_SEAM"]})));
  writeFileSync(join(goDir,"date_test.go"),`
package main
import("testing";"time";"osg/gogen/abap";"osg/gogen/enq";"osg/gogen/hostclass")
func TestDateWildcard(t *testing.T) {
 st:=enq.New("date"); defer st.Close(); a,b:=st.Open("A"),st.Open("B")
 sa,sb:=&abap.Session{},&abap.Session{}
 hostclass.KERNEL_LOCK.Enqueue=func(step any,r enq.Request,sleep func(time.Duration))(enq.Result,error){
  sid:=a; if step==any(sb){sid=b}; return st.Enqueue(sid,r,sleep!=nil),nil
 }
 defer func(){hostclass.KERNEL_LOCK.Enqueue=nil}()
 ZCL_GOGEN_ENQ_SEAM_DEFAULTS(sa)
 ZCL_GOGEN_ENQ_SEAM_ALL_KEYS(sb)
 if sb.Sy.Subrc!=1 {t.Fatalf("specific date subrc = %d, want FOREIGN_LOCK",sb.Sy.Subrc)}
}
`);
  const run=spawnSync("go",["test","-vet=off",`./cmd/${basename(goDir)}`],{cwd:goRoot,encoding:"utf8",env:{...process.env,GOFLAGS:"-buildvcs=false",GOCACHE:process.env.GOCACHE ?? join(home,".local/enqseam/go-cache")}});
  assert.equal(run.status,0,run.stderr||run.stdout);
 } finally {rmSync(dir,{recursive:true,force:true}); rmSync(goRoot,{recursive:true,force:true});}
});
