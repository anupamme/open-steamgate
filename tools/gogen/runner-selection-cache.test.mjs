import {test} from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {discoveryEvidence} from "./runner-selection-evidence.mjs";
const source = (name, body, superclass = "") => `CLASS ${name} DEFINITION PUBLIC ${superclass ? `INHERITING FROM ${superclass}` : ""}.
PUBLIC SECTION. CLASS-METHODS run. ENDCLASS.
CLASS ${name} IMPLEMENTATION. METHOD run. ${body} ENDMETHOD. ENDCLASS.`;
const childCode = `
import {compileClosedProgram} from ${JSON.stringify(new URL("frontend-closure.mjs", import.meta.url).href)};
import {prepareRunnerCache, finishRunnerCache} from ${JSON.stringify(new URL("runner-cache-recording.mjs", import.meta.url).href)};
import {artifactsOf} from ${JSON.stringify(new URL("cache-oracle-capture.mjs", import.meta.url).href)};
const {input, cacheDir, objects, policy, tolerant, forceSelection} = JSON.parse(process.argv[1]);
const folders = [input];
const runner = prepareRunnerCache(folders, cacheDir ? {cacheDir, dependencyCache: true, provenance: false} : {}, policy);
try {
 const p = compileClosedProgram({...runner.options, folders, objects, tolerant, ...(forceSelection ? {selectionCache: {read: () => ({selection: forceSelection, evidence: "test-forced", rounds: []}), write() {}}} : {})});
 finishRunnerCache(runner.certificate);
 console.log(JSON.stringify({artifacts: artifactsOf(p).artifacts, wanted: [...p.wanted], rounds: p.closureRounds, evidence: p.selectionEvidence}));
} catch(e) { console.log(JSON.stringify({error: e.message})); }
`;
function capture(input, cacheDir, extra = {}, noline = false) {
  const result = spawnSync(process.execPath, ["--preserve-symlinks", "--input-type=module", "-e", childCode,
    JSON.stringify({input, cacheDir, objects: ["zentry"], policy: "test-v1", ...extra})],
    {encoding: "utf8", maxBuffer: 20e6, env: {...process.env, GOGEN_NOLINE: noline ? "1" : ""}});
  assert.equal(result.status, 0, result.stderr); return JSON.parse(result.stdout);
}
function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), "gogen-selection-")), input = join(root, "input"), cache = join(root, "cache");
  mkdirSync(input);
  const put = (name, text) => writeFileSync(join(input, `${name}.clas.abap`), text);
  put("zentry", source("zentry", "DATA(t5) = CONV string( |value 1| ). zleaf=>run( )."));
  put("zleaf", source("zleaf", "")); put("zother", source("zother", ""));
  try { run({input, cache, put}); } finally { rmSync(root, {recursive: true, force: true}); }
}
function oracle(input, cache, extra = {}, noline = false) {
  const warm = capture(input, cache, extra, noline), cold = capture(input, undefined, extra, noline);
  assert.ok(!warm.error, warm.error); assert.ok(!cold.error, cold.error);
  assert.deepEqual(warm.artifacts, cold.artifacts, "oracle disables object cache AND selection seed, starts from original roots");
  assert.deepEqual(warm.wanted, cold.wanted); return warm;
}
for (const noline of [false, true]) {
  test(`certified selection collapses warm and multi-edit/revert rounds; noline=${noline}`, () => fixture(({input, cache, put}) => {
    assert.equal(oracle(input, cache, {}, noline).rounds, 2);
    const warm = oracle(input, cache, {}, noline);
    assert.equal(warm.rounds, 1); assert.equal(warm.evidence, "exact-inputs");
    for (const value of [2, 3, 1]) {
      put("zentry", source("zentry", `DATA(t5) = CONV string( |value ${value}| ). zleaf=>run( ).`));
      const edited = oracle(input, cache, {}, noline);
      assert.equal(edited.rounds, 1); assert.equal(edited.evidence, "local-string-initializers");
    }
  }));
  for (const change of ["addition", "removal", "superclass", "macro", "supplied", "catch", "broken"]) {
    test(`selection falls back on ${change}; noline=${noline}`, () => fixture(({input, cache, put}) => {
      if (change === "superclass") {
        put("zoldbase", source("zoldbase", ""));
        put("zleaf", source("zleaf", "", "zoldbase"));
      }
      if (change === "macro") {
        writeFileSync(join(input, "zentry.clas.macros.abap"), "DEFINE call_hidden. zleaf=>run( ). END-OF-DEFINITION.");
        put("zentry", source("zentry", "call_hidden."));
      }
      if (change === "catch") {
        put("cx_root", source("cx_root", ""));
        for (const name of ["zcx_old", "zcx_child"]) put(name, `CLASS ${name} DEFINITION PUBLIC INHERITING FROM cx_root. ENDCLASS. CLASS ${name} IMPLEMENTATION. ENDCLASS.`);
        put("zentry", source("zentry", "TRY. RAISE EXCEPTION TYPE zcx_old. CATCH cx_root. ENDTRY."));
      }
      if (change === "supplied") {
        put("zleaf", "CLASS zleaf DEFINITION PUBLIC. PUBLIC SECTION. METHODS work IMPORTING p TYPE i OPTIONAL. ENDCLASS. CLASS zleaf IMPLEMENTATION. METHOD work. ENDMETHOD. ENDCLASS.");
        put("zother", "CLASS zother DEFINITION PUBLIC INHERITING FROM zleaf. PUBLIC SECTION. METHODS work REDEFINITION. ENDCLASS. CLASS zother IMPLEMENTATION. METHOD work. IF p IS SUPPLIED. ENDIF. ENDMETHOD. ENDCLASS.");
        put("zentry", source("zentry", "DATA o TYPE REF TO zother. CREATE OBJECT o. o->work( p = 1 )."));
      }
      oracle(input, cache, {}, noline);
      assert.equal(oracle(input, cache, {}, noline).evidence, "exact-inputs");
      if (change === "addition") put("zentry", source("zentry", "zleaf=>run( ). zother=>run( )."));
      if (change === "removal") put("zentry", source("zentry", "DATA(t5) = CONV string( |value 1| )."));
      if (change === "superclass") put("zleaf", source("zleaf", "", "zother"));
      if (change === "macro") {
        writeFileSync(join(input, "zentry.clas.macros.abap"), "DEFINE call_hidden. zother=>run( ). END-OF-DEFINITION.");
        put("zentry", source("zentry", "call_hidden."));
      }
      if (change === "supplied") put("zentry", source("zentry", "DATA o TYPE REF TO zother. CREATE OBJECT o. o->work( )."));
      if (change === "catch") put("zentry", source("zentry", "TRY. RAISE EXCEPTION TYPE zcx_child. CATCH cx_root. ENDTRY."));
      if (change === "broken") put("zleaf", source("zleaf", "DATA x TYPE any."));
      const edited = oracle(input, cache, {}, noline);
      assert.equal(edited.evidence, "discovery-from-roots");
      if (["removal", "macro"].includes(change)) assert.ok(!edited.wanted.includes("ZLEAF"), "obsolete dependency disappears");
      if (change === "superclass") assert.ok(!edited.wanted.includes("ZOLDBASE"));
      if (change === "catch") assert.ok(!edited.wanted.includes("ZCX_OLD"));
      const warm = oracle(input, cache, {}, noline);
      assert.equal(warm.evidence, "exact-inputs");
      if (change === "broken") {
        assert.ok(JSON.parse(warm.artifacts.diagnostics).some(d => d.object.toUpperCase() === "ZLEAF"));
        assert.match(capture(input, cache, {objects: ["zleaf"]}, noline).error, /cannot be generic/);
      }
    }));
  }
}
test("policy, roots, corruption and tool identity fail closed", () => fixture(({input, cache}) => {
  oracle(input, cache);
  assert.equal(oracle(input, cache, {policy: "different"}).evidence, "discovery-from-roots");
  assert.equal(oracle(input, cache, {objects: ["zother"]}).evidence, "discovery-from-roots");
  writeFileSync(join(cache, "runner-selection.json"), "corrupt");
  assert.equal(oracle(input, cache).evidence, "discovery-from-roots");
  const data = JSON.parse(readFileSync(join(cache, "runner-selection.json"), "utf8"));
  data.contents.selection.push("ZOTHER");
  data.checksum = createHash("sha256").update(JSON.stringify(data.contents)).digest("hex");
  writeFileSync(join(cache, "runner-selection.json"), JSON.stringify(data));
  assert.equal(oracle(input, cache).evidence, "discovery-from-roots", "checksummed inconsistent selection is refused");
  data.contents.key.identity = "obsolete";
  writeFileSync(join(cache, "runner-selection.json"), JSON.stringify(data));
  assert.equal(oracle(input, cache).evidence, "discovery-from-roots");
}));
test("discovery evidence excludes only plain local string initializer values", () => {
  const before = source("z", "DATA(t5) = CONV string( |value 1| ).");
  const key = text => discoveryEvidence("z.clas.abap", text);
  assert.equal(key(before), key(before.replace("value 1", "value 2")));
  for (const after of [before.replace("string", "zother"), before.replace("value 1", "{ zother=>run( ) }"), before.replace("value 1", "value 22"),
    before.replace("CONV string( |value 1| )", "zother=>run( )"), before.replace("DATA(t5)", "DATA(other)"),
    before.replace("value 1", "value\\n2"), before.replace("value 1", "value\n2")]) assert.notEqual(key(before), key(after));
  const constant = "CLASS z DEFINITION. PUBLIC SECTION. CONSTANTS c TYPE string VALUE 'one'. ENDCLASS.";
  assert.notEqual(key(constant), key(constant.replace("one", "two")));
});

test("negative control: a closed stale superset changes bytes; from-roots oracle detects it", () => fixture(({input, cache, put}) => {
  oracle(input, cache);
  put("zentry", source("zentry", ""));
  const correct = oracle(input, cache);
  const stale = capture(input, undefined, {forceSelection: ["ZENTRY", "ZLEAF"]});
  assert.equal(stale.rounds, 1, "no missing classes does not prove selection equality");
  assert.notDeepEqual(stale.artifacts, correct.artifacts);
}));
test("seed controller continues missing-class rounds and keeps explicit roots strict", () => fixture(({input, put}) => {
  const grown = capture(input, undefined, {forceSelection: ["ZENTRY"]});
  assert.equal(grown.rounds, 2);
  assert.deepEqual(grown.artifacts, capture(input, undefined).artifacts);
  put("zentry", source("zentry", "DATA x TYPE any."));
  assert.match(capture(input, undefined, {forceSelection: ["ZENTRY", "ZLEAF"]}).error, /cannot be generic/);
}));

for (const noline of [false, true]) test(`literal width changes restart discovery; noline=${noline}`, () => fixture(({input, cache, put}) => {
  oracle(input, cache, {}, noline);
  put("zentry", source("zentry", "DATA(t5) = CONV string( |value 22| ). zleaf=>run( )."));
  const result = oracle(input, cache, {}, noline);
  assert.equal(result.evidence, "discovery-from-roots");
  assert.equal(result.rounds, 2);
}));

test("literal edits must preserve the frontend's actual raw-source probe answers", () => {
  const key = text => discoveryEvidence("z.clas.abap", source("z", `DATA(t5) = CONV string( |${text}| ).`));
  assert.notEqual(key("TYPES ztype1 TYPE i."), key("TYPES ztype2 TYPE i."));
  assert.notEqual(key("INTERFACE lif_one."), key("INTERFACE lif_two."));
  assert.notEqual(key("CL_AMC_CHANNEL_MANAGER"), key("ZL_AMC_CHANNEL_MANAGER"));
  assert.equal(key("add 2 to lv_foo."), key("add 3 to lv_foo."));
});
