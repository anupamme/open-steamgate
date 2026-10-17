import {test} from "node:test";
import assert from "node:assert/strict";

test("dynamic static indexes preserve the first class and its inherited implementation", async () => {
  const {prepareDynamicStatics} = await import("./frontend-dynamic-call.mjs");
  const {dynamicAdapters} = await import("./emit-dynamic-call.mjs");
  const method = (value) => ({name: "RUN", static: true, params: [{name: "P", default: value}]});
  const first = {name: "BASE", super: null, methods: [method("first")], stubs: [method("stub")]};
  const later = {name: "BASE", super: null, methods: [method("later")], stubs: []};
  const child = {name: "CHILD", super: "BASE", methods: [], stubs: []};
  const shadow = {name: "CHILD", super: "OTHER", methods: [], stubs: []};
  const other = {name: "OTHER", super: null, methods: [method("other")], stubs: []};
  const program = {classes: [first, later, child, shadow, other], dynStatics: new Set(["RUN"])};
  prepareDynamicStatics(program, {defaultValue: (p) => p.default, aliasTarget: () => undefined});
  assert.deepEqual(program.dynamicDispatch.map(({key, owner, defaults}) => [key, owner, defaults]), [
    ["BASE=>RUN", "BASE", [{name: "P", value: "first"}]],
    ["BASE=>RUN", "BASE", [{name: "P", value: "first"}]],
    ["CHILD=>RUN", "BASE", [{name: "P", value: "first"}]],
    ["CHILD=>RUN", "BASE", [{name: "P", value: "first"}]],
    ["OTHER=>RUN", "OTHER", [{name: "P", value: "other"}]],
  ]);
  assert.deepEqual(dynamicAdapters(program).map(({m}) => m.params[0].default),
    ["first", "first", "first", "first", "other"]);
});

test("dynamic dispatch refuses absent exception classes; CX_ROOT cannot catch a refusal", async () => {
  const abap = await import("./js/abap.mjs?dynamic-call-closure");
  abap.knownClasses(["Z_DYN_TEST"], []);
  abap.registerStatic("Z_DYN_TEST=>VALUE", ["P0"], "RESULT", () => "ok");
  const cases = [
    ["CX_SY_DYN_CALL_ILLEGAL_CLASS", () => abap.CallStatic({}, "Z_ABSENT", "VALUE", {})],
    ["CX_SY_DYN_CALL_ILLEGAL_METHOD", () => abap.CallStatic({}, "Z_DYN_TEST", "ABSENT", {})],
    ["CX_SY_DYN_CALL_PARAM_NOT_FOUND", () => abap.CallStatic({}, "Z_DYN_TEST", "VALUE", {}, "WRONG")],
    ["CX_SY_DYN_CALL_PARAM_NOT_FOUND", () => abap.CallStatic({}, "Z_DYN_TEST", "VALUE", {WRONG: {}})],
    ["CX_SY_DYN_CALL_PARAM_MISSING", () => abap.paramMissing("P0")],
    ["CX_SY_DYN_CALL_ILLEGAL_TYPE", () => abap.CallStatic({}, "Z_DYN_TEST", "VALUE", {}, "RESULT")],
  ];
  for (const [exception, run] of cases) assert.throws(run, (e) => e.cls === "NOT_COMPILED" && e.message.includes(exception) && !abap.catchable(e), exception);
});

test("dynamic defaults select their constants during lowering, independently of emitter order", async () => {
  const {fileURLToPath} = await import("node:url");
  const {compileProgram} = await import("./frontend.mjs");
  const {emitGo} = await import("./emit-go.mjs");
  const {emitJs} = await import("./emit-js.mjs");
  for (const emitters of [[emitGo, emitJs], [emitJs, emitGo]]) {
    const program = compileProgram({folders: [fileURLToPath(new URL("./testdata", import.meta.url))],
      objects: ["ZCL_GOGEN_T_DYNRECVDEFAULT", "ZCL_GOGEN_T_DYNRECVCOMPOSITE"]});
    const constants = [...program.consts.keys()];
    assert.ok(constants.some(n => n.endsWith("__C")), "qualified DEFAULT selected before emission");
    assert.ok(constants.some(n => n.endsWith("__DEF")), "structured DEFAULT selected before emission");
    for (const emit of emitters) {
      emit(program);
      assert.deepEqual([...program.consts.keys()], constants, "emission must not select new constants");
    }
  }
});

test("osabap selection grows through an initially unselected callee and its runtime exceptions", async () => {
  const {mkdtempSync, writeFileSync, readFileSync, rmSync} = await import("node:fs");
  const {tmpdir} = await import("node:os");
  const {join} = await import("node:path");
  const {libraryPath} = await import("../osd-lib-path.mjs");
  const {compileClosedProgram} = await import("./frontend-closure.mjs");
  const dir = mkdtempSync(join(tmpdir(), "dynrecv-closure-"));
  try {
    // The pinned core lacks PARAM_MISSING; provide the same test-only class as semantics.
    writeFileSync(join(dir, "cx_sy_dyn_call_param_missing.clas.abap"), readFileSync(new URL("./testdata/cx_sy_dyn_call_param_missing.clas.abap", import.meta.url)));
    writeFileSync(join(dir, "zentry.clas.abap"), `CLASS zentry DEFINITION PUBLIC.
 PUBLIC SECTION. CLASS-METHODS run. ENDCLASS.
 CLASS zentry IMPLEMENTATION. METHOD run. zcallee=>run( ). ENDMETHOD. ENDCLASS.`);
    writeFileSync(join(dir, "zcallee.clas.abap"), `CLASS zcallee DEFINITION PUBLIC.
 PUBLIC SECTION. CLASS-METHODS run. ENDCLASS.
 CLASS zcallee IMPLEMENTATION. METHOD run.
 TRY. CALL METHOD ('ZABSENT')=>begin. CATCH cx_root. ENDTRY.
 ENDMETHOD. ENDCLASS.`);
    const program = compileClosedProgram({folders: [dir, join(libraryPath(process.cwd(), "open-abap-core"), "src")], objects: ["zentry"]});
    const names = new Set(program.classes.map(c => c.name));
    assert.ok(names.has("ZCALLEE"), "callee was outside initial object list");
    for (const n of ["CX_ROOT", "CX_SY_DYN_CALL_ERROR", "CX_SY_DYN_CALL_PARAMETER_ERROR", "CX_SY_DYN_CALL_ILLEGAL_CLASS",
      "CX_SY_DYN_CALL_ILLEGAL_METHOD", "CX_SY_DYN_CALL_PARAM_NOT_FOUND", "CX_SY_DYN_CALL_PARAM_MISSING", "CX_SY_DYN_CALL_ILLEGAL_TYPE"])
      assert.ok(names.has(n), `${n} compiled, not just reported missing`);
    assert.equal(program.classes.find(c => c.name === "ZCALLEE").stubs.length, 0);
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

test("closure retains dependency diagnostics while explicit inputs keep strict syntax checking", async () => {
  const {mkdtempSync, writeFileSync, rmSync} = await import("node:fs");
  const {tmpdir} = await import("node:os");
  const {join} = await import("node:path");
  const {compileClosedProgram} = await import("./frontend-closure.mjs");
  const dir = mkdtempSync(join(tmpdir(), "dynrecv-broken-dependency-"));
  try {
    writeFileSync(join(dir, "zentry.clas.abap"), `CLASS zentry DEFINITION PUBLIC.
 PUBLIC SECTION. CLASS-METHODS run. ENDCLASS.
 CLASS zentry IMPLEMENTATION. METHOD run. zbroken=>run( ). ENDMETHOD. ENDCLASS.`);
    writeFileSync(join(dir, "zbroken.clas.abap"), `CLASS zbroken DEFINITION PUBLIC.
 PUBLIC SECTION. CLASS-METHODS run. ENDCLASS.
 CLASS zbroken IMPLEMENTATION. METHOD run. DATA x TYPE any. ENDMETHOD. ENDCLASS.`);
    const options = {folders: [dir], objects: ["zentry"]};
    const program = compileClosedProgram(options);
    assert.ok(program.diagnostics.some(d => d.object.toUpperCase() === "ZBROKEN"));
    assert.ok(!program.classes.some(c => c.name === "ZBROKEN"));
    assert.throws(() => compileClosedProgram({...options, objects: ["zbroken"]}), /cannot be generic/);
  } finally { rmSync(dir, {recursive: true, force: true}); }
});
