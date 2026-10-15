import {test} from "node:test";
import assert from "node:assert/strict";

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
