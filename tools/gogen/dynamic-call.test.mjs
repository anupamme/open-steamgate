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
