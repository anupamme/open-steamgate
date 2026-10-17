import {createGoTestDir} from "./go-test-module.mjs";
import {test} from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {basename, dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import {compileProgram} from "./frontend.mjs";
const {emitGo} = await import(process.env.GOGEN_HOSTCLASS_EMITTER ?? "./emit-go.mjs");
import {libraryPath} from "../osd-lib-path.mjs";
import {home} from "./home.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const core = libraryPath(home, "open-abap-core");

test("host-replaced kernel hooks preserve ABAP values and exceptions", () => {
  const sourceDir = mkdtempSync(join(tmpdir(), "gogen-hostclass-"));
  const {dir: goDir, goRoot} = createGoTestDir("gogen-hostclass-test-");
  try {
    for (const name of ["zcl_osd_enq_kernel.clas.abap", "zcx_osd_adt.clas.abap"]) {
      writeFileSync(join(sourceDir, name), readFileSync(join(here, "../../src/adt", name)));
    }
    writeFileSync(join(sourceDir, "zcl_gogen_host_caller.clas.abap"), `
CLASS zcl_gogen_host_caller DEFINITION PUBLIC FINAL CREATE PUBLIC.
 PUBLIC SECTION.
 CLASS-METHODS bind_catch RETURNING VALUE(rv) TYPE string.
 CLASS-METHODS end_catch_text RETURNING VALUE(rv) TYPE string.
ENDCLASS.
CLASS zcl_gogen_host_caller IMPLEMENTATION.
 METHOD bind_catch.
 DATA lx TYPE REF TO zcx_osd_adt.
 TRY.
 zcl_osd_enq_kernel=>bind( iv_id = 'id' iv_user = 'user' ).
 CATCH zcx_osd_adt INTO lx.
 rv = 'caught'.
 ENDTRY.
 ENDMETHOD.
 METHOD end_catch_text.
 DATA lx TYPE REF TO zcx_osd_adt.
 TRY.
 zcl_osd_enq_kernel=>end( iv_id = 'id' ).
 CATCH zcx_osd_adt INTO lx.
 rv = lx->if_message~get_text( ).
 ENDTRY.
 ENDMETHOD.
ENDCLASS.
`);
    writeFileSync(join(sourceDir, "zcl_gogen_host_compare.clas.abap"), `
CLASS zcl_gogen_host_compare DEFINITION PUBLIC FINAL CREATE PUBLIC.
 PUBLIC SECTION.
 CLASS-METHODS stub.
ENDCLASS.
CLASS zcl_gogen_host_compare IMPLEMENTATION.
 METHOD stub.
 DATA lx TYPE REF TO zcx_osd_adt.
 lx = zcx_osd_adt=>system_not_supported( ).
 RAISE EXCEPTION lx.
 ENDMETHOD.
ENDCLASS.
`);
    writeFileSync(join(sourceDir, "zcx_optional.clas.abap"), `
CLASS zcx_optional DEFINITION PUBLIC INHERITING FROM cx_static_check CREATE PUBLIC.
 PUBLIC SECTION.
 DATA marker TYPE string.
 CLASS-METHODS make IMPORTING iv_optional TYPE string OPTIONAL iv_default TYPE string DEFAULT 'default ran' RETURNING VALUE(rv) TYPE REF TO zcx_optional.
ENDCLASS.
CLASS zcx_optional IMPLEMENTATION.
 METHOD make.
 CREATE OBJECT rv.
 rv->marker = iv_default.
 IF iv_optional IS INITIAL. rv->marker = rv->marker && ' optional ran'. ENDIF.
 IF iv_optional IS SUPPLIED. rv->marker = 'unexpected supplied'. ENDIF.
 ENDMETHOD.
ENDCLASS.
`);
    writeFileSync(join(sourceDir, "zcx_plain.clas.abap"), `
CLASS zcx_plain DEFINITION PUBLIC INHERITING FROM cx_static_check CREATE PUBLIC.
ENDCLASS.
CLASS zcx_plain IMPLEMENTATION.
ENDCLASS.
`);
    const generated = emitGo(compileProgram({folders: [sourceDir, core, join(home, "src/adt")], objects: [
      "CX_ROOT", "CX_STATIC_CHECK", "ZCL_OSD_ENQ_KERNEL", "ZCX_OSD_ADT", "ZCL_GOGEN_HOST_CALLER", "ZCL_GOGEN_HOST_COMPARE", "ZCX_OPTIONAL", "ZCX_PLAIN",
    ]}));
    assert.match(generated, /hHostclass\.ZCL_OSD_ENQ_KERNEL\.Bind/);
    mkdirSync(goDir, {recursive: true});
    writeFileSync(join(goDir, "zz_generated.go"), generated);
    writeFileSync(join(goDir, "zz_generated_test.go"), `package main
import (
 "errors"
 "fmt"
 "testing"
 "strings"
 "osg/gogen/abap"
 "osg/gogen/hostclass"
)

func TestHooks(t *testing.T) {
 h := &hostclass.ZCL_OSD_ENQ_KERNEL
 if got := ZCL_GOGEN_HOST_CALLER_BIND_CATCH(&abap.Session{}); got != "caught" { t.Fatal("nil Bind hook changed the fallback") }
 var nilEnd any
 func() { defer func() { nilEnd = recover() }(); ZCL_OSD_ENQ_KERNEL_END(&abap.Session{}, "id") }()
 var fallback any
 func() { defer func() { fallback = recover() }(); ZCL_GOGEN_HOST_COMPARE_STUB(&abap.Session{}) }()
 if fmt.Sprint(nilEnd) != fmt.Sprint(fallback) { t.Fatalf("nil End hook differs from ABAP fallback: %#v vs %#v", nilEnd, fallback) }
 var seen any
 step := &abap.Session{}
 h.Bind = func(st any, id, user string) (bool, error) { seen = st; return id == "id" && user == "user", nil }
 h.ContextAlive = func(any, string) (bool, error) { return false, nil }
 h.Owns = func(any, string) (bool, error) { return true, nil }
 h.SessionID = func(any, string) (string, error) { return "session-id", nil }
 defer func() { h.Bind, h.End, h.Revive, h.ContextAlive, h.Owns, h.SessionID = nil, nil, nil, nil, nil, nil }()
 if got := ZCL_OSD_ENQ_KERNEL_BIND(step, "id", "user"); got != "X" { t.Fatal(got) }
 if seen != any(step) { t.Fatal("the hook did not get the calling step's Session") }
 if got := ZCL_OSD_ENQ_KERNEL_CONTEXT_ALIVE(&abap.Session{}, "id"); got != " " { t.Fatal(got) }
 if got := ZCL_OSD_ENQ_KERNEL_OWNS(&abap.Session{}, "id"); got != "X" { t.Fatal(got) }
 if got := ZCL_OSD_ENQ_KERNEL_SESSION_ID(&abap.Session{}, "id"); got != "session-id" { t.Fatal(got) }
 h.Bind = func(any, string, string) (bool, error) { return false, &hostclass.Raise{Class: "ZCX_OSD_ADT", Factory: "SYSTEM_NOT_SUPPORTED"} }
 if got := ZCL_GOGEN_HOST_CALLER_BIND_CATCH(&abap.Session{}); got != "caught" { t.Fatal(got) }
 for _, request := range []*hostclass.Raise{
  {Class: "ZCX_OSD_ADT", Text: "host refused"},
  {Class: "ZCX_OSD_ADT", Factory: "SYSTEM_NOT_SUPORTED"},
  {Class: "ZCX_MISSING", Factory: "MAKE"},
  {Class: "ZCX_PLAIN"},
  {Class: "ZCX_OSD_ADT", Factory: "NOT_COMPILED"},
 } {
  t.Run(request.Class+"=>"+request.Factory, func(t *testing.T) {
  h.End = func(any, string) error { return request }
  var failure any
  func() { defer func() { failure = recover() }(); ZCL_OSD_ENQ_KERNEL_END(&abap.Session{}, "id") }()
  text := fmt.Sprint(failure)
  if !strings.Contains(text, "NOT_COMPILED") || !strings.Contains(text, request.Class+"=>"+request.Factory) { t.Fatalf("unavailable factory did not fail loudly: %v", failure) }
  })
 }
 t.Run("optional factory", func(t *testing.T) {
 h.End = func(any, string) error { return &hostclass.Raise{Class: "ZCX_OPTIONAL", Factory: "make"} }
 var optional any
 func() { defer func() { optional = recover() }(); ZCL_OSD_ENQ_KERNEL_END(&abap.Session{}, "id") }()
 raised, ok := optional.(*abap.Raised)
 if !ok { t.Fatalf("optional factory: %#v", optional) }
 object, ok := raised.Obj.(*ZCX_OPTIONAL)
 if !ok || object.marker != "default ran optional ran" { t.Fatalf("factory body/default omitted args: %#v", raised.Obj) }
 })
 h.End = func(any, string) error { return &hostclass.Raise{Class: "ZCX_OSD_ADT", Factory: "SYSTEM_NOT_SUPPORTED"} }
 var hook any
 func() { defer func() { hook = recover() }(); ZCL_OSD_ENQ_KERNEL_END(&abap.Session{}, "id") }()
 var stub any
 func() { defer func() { stub = recover() }(); ZCL_GOGEN_HOST_COMPARE_STUB(&abap.Session{}) }()
 if fmt.Sprint(hook) != fmt.Sprint(stub) { t.Fatalf("undeclared Raise differs: %#v vs %#v", hook, stub) }
 h.End = func(any, string) error { return errors.New("host down") }
 var plain any
 func() { defer func() { plain = recover() }(); ZCL_OSD_ENQ_KERNEL_END(&abap.Session{}, "id") }()
 if plain == nil { t.Fatal("ordinary host error was swallowed") }
}
`);
    const run = spawnSync("go", ["test", "-vet=off", `./cmd/${basename(goDir)}`], {cwd: goRoot, encoding: "utf8", timeout: 120000, env: {...process.env, GOFLAGS: "-buildvcs=false", GOCACHE: process.env.GOCACHE ?? join(home, ".local/hostcls/go-cache")}});
    assert.equal(run.status, 0, run.stderr || run.stdout);
  } finally {
    rmSync(sourceDir, {recursive: true, force: true});
    rmSync(goRoot, {recursive: true, force: true});
  }
});

test("host-replaced signatures are refused with the offending parameter", () => {
  const sourceDir = mkdtempSync(join(tmpdir(), "gogen-hostclass-bad-"));
  try {
    const source = readFileSync(join(here, "../../src/adt/zcl_osd_enq_kernel.clas.abap"), "utf8")
      .replace("iv_id TYPE string", "iv_id TYPE f");
    writeFileSync(join(sourceDir, "zcl_osd_enq_kernel.clas.abap"), source);
    writeFileSync(join(sourceDir, "zcx_osd_adt.clas.abap"), readFileSync(join(here, "../../src/adt/zcx_osd_adt.clas.abap")));
    assert.throws(() => compileProgram({folders: [core, join(home, "src/adt"), sourceDir], objects: ["ZCL_OSD_ENQ_KERNEL", "ZCX_OSD_ADT"]}),
      /ZCL_OSD_ENQ_KERNEL=>BIND IV_ID: a host-replaced method may use only string, c LENGTH 1, i, or int8/);
  } finally { rmSync(sourceDir, {recursive: true, force: true}); }
});

test("host Raise glue only sees its package and imported layers", () => {
  const sourceDir = mkdtempSync(join(tmpdir(), "gogen-hostclass-layers-"));
  const {dir: goDir, goRoot} = createGoTestDir("gogen-hostclass-layers-");
  try {
    for (const name of ["zcl_osd_enq_kernel.clas.abap", "zcx_osd_adt.clas.abap"]) {
      writeFileSync(join(sourceDir, name), readFileSync(join(here, "../../src/adt", name)));
    }
    writeFileSync(join(sourceDir, "zcx_unrelated.clas.abap"), `
CLASS zcx_unrelated DEFINITION PUBLIC INHERITING FROM cx_static_check CREATE PUBLIC.
 PUBLIC SECTION.
 CLASS-METHODS make RETURNING VALUE(rv) TYPE REF TO zcx_unrelated.
ENDCLASS.
CLASS zcx_unrelated IMPLEMENTATION.
 METHOD make. CREATE OBJECT rv. ENDMETHOD.
ENDCLASS.
`);
    const program = compileProgram({folders: [sourceDir, core, join(home, "src/adt")],
      objects: ["CX_ROOT", "CX_STATIC_CHECK", "ZCL_OSD_ENQ_KERNEL", "ZCX_OSD_ADT", "ZCX_UNRELATED"]});
    const base = program.classes.filter((c) => c.name !== "ZCX_UNRELATED");
    const upper = program.classes.filter((c) => c.name === "ZCX_UNRELATED");
    mkdirSync(join(goDir, "core")); mkdirSync(join(goDir, "app"));
    const lowerCode = emitGo(program, "core", {classes: base, visibleClasses: new Set(base.map((c) => c.name)),
      externalClasses: new Set(["ZCX_UNRELATED"]), marker: "HostCoreLayer"});
    assert.doesNotMatch(lowerCode.slice(lowerCode.indexOf("func hostRaise("), lowerCode.indexOf("func hostRaise(") + lowerCode.slice(lowerCode.indexOf("func hostRaise(")).indexOf("\n}\n")), /ZCX_UNRELATED/);
    assert.equal(lowerCode.match(/func hostRaise\(/g)?.length, 1);
    writeFileSync(join(goDir, "core", "zz_generated.go"), lowerCode);
    const upperCode = emitGo(program, "app", {classes: upper, structs: new Map(), consts: new Map(), interfaces: new Set(), visibleClasses: new Set(program.classes.map((c) => c.name)),
      externalClasses: new Set(base.map((c) => c.name)), imports: [`osg/gogen/cmd/${basename(goDir)}/core`],
      importMarkers: ["HostCoreLayer"]});
    assert.doesNotMatch(upperCode, /func hostRaise\(/);
    writeFileSync(join(goDir, "app", "zz_generated.go"), upperCode);
    const run = spawnSync("go", ["test", `./cmd/${basename(goDir)}/...`], {cwd: goRoot, encoding: "utf8", timeout: 120000});
    assert.equal(run.status, 0, run.stderr + run.stdout);
  } finally {
    rmSync(sourceDir, {recursive: true, force: true}); rmSync(goRoot, {recursive: true, force: true});
  }
});

// critic round 2: a host method's own signature, not the emitter's view of it
function kernelVariant(edit) {
  const sourceDir = mkdtempSync(join(tmpdir(), "gogen-hostclass-variant-"));
  writeFileSync(join(sourceDir, "zcl_osd_enq_kernel.clas.abap"), edit(readFileSync(join(here, "../../src/adt/zcl_osd_enq_kernel.clas.abap"), "utf8")));
  writeFileSync(join(sourceDir, "zcx_osd_adt.clas.abap"), readFileSync(join(here, "../../src/adt/zcx_osd_adt.clas.abap")));
  return sourceDir;
}

test("an OPTIONAL host parameter reaches the hook without its IS SUPPLIED flag", () => {
  const sourceDir = kernelVariant((s) => s
    .replace(/(CLASS-METHODS session_id\s+IMPORTING iv_id TYPE string)/, "$1 OPTIONAL")
    .replace(/(METHOD session_id\.)/, "$1\n    IF iv_id IS SUPPLIED.\n    ENDIF."));
  try {
    const generated = emitGo(compileProgram({folders: [core, join(home, "src/adt"), sourceDir], objects: ["ZCL_OSD_ENQ_KERNEL", "ZCX_OSD_ADT"]}));
    const call = generated.match(/hHostclass\.ZCL_OSD_ENQ_KERNEL\.SessionID\(s, ([^)]*)\)/);
    assert.ok(call, "the SessionID hook is called");
    assert.equal(call[1].split(",").length, 1, `one argument, got ${call[1]}`);
  } finally { rmSync(sourceDir, {recursive: true, force: true}); }
});

test("a host-replaced method whose signature does not compile is refused, not dropped", () => {
  const sourceDir = kernelVariant((s) => s.replace("CLASS-METHODS end IMPORTING iv_id TYPE string.", "CLASS-METHODS end IMPORTING iv_id TYPE decfloat34."));
  try {
    assert.throws(() => compileProgram({folders: [core, join(home, "src/adt"), sourceDir], objects: ["ZCL_OSD_ENQ_KERNEL", "ZCX_OSD_ADT"]}),
      /ZCL_OSD_ENQ_KERNEL=>END/);
  } finally { rmSync(sourceDir, {recursive: true, force: true}); }
});
