import assert from "node:assert/strict";
import {parse} from "acorn";
import {readFileSync, readdirSync} from "node:fs";
import {join} from "node:path";
import {ABAP, MemoryConsole} from "@abaplint/runtime";
import {modulesOf} from "../osd-transpile.mjs";

// Tiny programs through the repository's actual transpiler/runtime Node path.
// Divergent results are observations, not the contract of the Go/JS hosts.
export async function dynamicCallOracle(home, core, fixtures) {
  const names = ["cx_root", "cx_dynamic_check", "cx_static_check", "cx_no_check", "cx_sy_dyn_call_error", "cx_sy_dyn_call_parameter_error",
    "cx_sy_dyn_call_illegal_class", "cx_sy_dyn_call_illegal_method", "cx_sy_dyn_call_param_not_found", "cx_sy_dyn_call_illegal_type"];
  const files = readdirSync(core, {recursive: true}).filter((p) =>
    (p.endsWith(".clas.abap") || p.endsWith(".intf.abap")) && (names.includes(p.split("/").at(-1).split(".")[0]) || p.endsWith("if_message.intf.abap"))
    || p.endsWith(".xml") && ["dtel", "doma", "tabl", "ttyp"].includes(p.split(".").at(-2)))
    .map((p) => ({filename: p.split("/").at(-1), contents: readFileSync(join(core, p), "utf8")}));
  for (const n of ["zcl_gogen_t_dynrecvrefarg", "zcl_gogen_t_dynrecvcollision", "zcl_gogen_t_dynrecvexporttext", "zcl_gogen_t_dynrecvchanging", "zcl_gogen_t_dynrecvcase", "zcl_gogen_t_dynrecvstruct", "zcl_gogen_t_dynrecvany", "zcl_gogen_t_dynrecvcomposite", "zcl_gogen_dynbase", "zcl_gogen_t_dynrecvclosure", "zcl_gogen_t_dynrecvchild", "zcl_gogen_t_dynrecvalias", "zcl_gogen_t_dynrecvfs", "zcl_gogen_t_dynrecvdefault", "zcl_lnt_p_base_chai", "zcl_gogen_t_dynrecv", "zcl_gogen_t_dynrecvnf", "zcl_gogen_t_dynrecverr", "cx_sy_dyn_call_param_missing"])
    files.push({filename: `${n}.clas.abap`, contents: readFileSync(join(fixtures, `${n}.clas.abap`), "utf8")});
  files.push({filename: "zif_gogen_dynval.intf.abap", contents: readFileSync(join(fixtures, "zif_gogen_dynval.intf.abap"), "utf8")});
  const matched = ["ZCL_GOGEN_T_DYNRECVREFARG", "ZCL_GOGEN_T_DYNRECVCOLLISION", "ZCL_GOGEN_T_DYNRECVEXPORTTEXT", "ZCL_GOGEN_T_DYNRECVCASE", "ZCL_GOGEN_T_DYNRECVSTRUCT", "ZCL_GOGEN_T_DYNRECVANY", "ZCL_GOGEN_T_DYNRECVCOMPOSITE", "ZCL_GOGEN_T_DYNRECVCLOSURE", "ZCL_GOGEN_T_DYNRECVCHILD", "ZCL_GOGEN_T_DYNRECVALIAS", "ZCL_GOGEN_T_DYNRECVFS", "ZCL_GOGEN_T_DYNRECVDEFAULT", "ZCL_GOGEN_T_DYNRECV", "ZCL_GOGEN_T_DYNRECVNF"];
  const probes = [
    ["name", "TXT", "RECEIVING wrong = target", "success"],
    ["none", "VOID", "RECEIVING result = target", "TypeError"],
    ["export", "TXT", "EXPORTING wrong = target RECEIVING result = target", "success"],
    ["missing", "NEED", "RECEIVING result = target", "TypeError"],
    ["type", "TXT", "RECEIVING result = ref", "success"],
  ];
  for (const [i, cls] of matched.entries()) files.push({filename: `zmatched${i}.prog.abap`, contents: `REPORT zmatched${i}. WRITE ${cls.toLowerCase()}=>run( ).`});
  for (const [label, method, params] of probes) files.push({filename: `zprobe_${label}.prog.abap`, contents:
    `REPORT zprobe_${label}. DATA target TYPE string. DATA ref TYPE REF TO object. TRY. CALL METHOD ('ZCL_GOGEN_T_DYNRECVERR')=>('${method}') ${params}. WRITE 'success'. CATCH cx_root. WRITE 'caught-root'. ENDTRY.`});
  files.push({filename: "zchanging.prog.abap", contents: "REPORT zchanging. WRITE zcl_gogen_t_dynrecvchanging=>run( )."});
  const {Transpiler} = modulesOf(home);
  const output = await new Transpiler({ignoreSyntaxCheck: true, unknownTypes: "runtimeError"}).runRaw(files);
  const saved = globalThis.abap;
  const abap = globalThis.abap = new ABAP({console: new MemoryConsole()});
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const rank = (o) => { const i = ["if_message", ...names, "cx_sy_dyn_call_param_missing", "zif_gogen_dynval", "zcl_gogen_dynbase"].indexOf(o.filename.split(".")[0]); return i < 0 ? 99 : i; };
  try {
    const chunks = output.objects.filter((o) => !o.filename.endsWith(".prog.mjs")).sort((a, b) => rank(a) - rank(b)).map((o) =>
      moduleBody(o.chunk.getCode()));
    await new AsyncFunction("abap", chunks.join("\n"))(abap);
    const run = async (filename) => {
      abap.console.clear();
      try { await new AsyncFunction("abap", output.objects.find((o) => o.filename === filename).chunk.getCode())(abap); return abap.console.get(); }
      catch (e) { if (e instanceof TypeError) return "TypeError"; throw e; }
    };
    const changing = await run("zchanging.prog.mjs");
    assert.equal(changing, "silent/0", "Node-divergent mandatory CHANGING");
    console.log(`ok   Node-divergent mandatory CHANGING: ${changing}; hosts require PARAM_MISSING; SAP unmeasured`);
    const rows = {};
    for (const [i, cls] of matched.entries()) rows[cls] = await run(`zmatched${i}.prog.mjs`);
    for (const [label, , , expected] of probes) {
      const got = await run(`zprobe_${label}.prog.mjs`);
      assert.equal(got, expected, `Node-divergent ${label}`);
      console.log(`ok   Node-divergent ${label}: ${got}; SAP unmeasured; measure on A4H`);
    }
    return rows;
  } finally { globalThis.abap = saved; }
}

export const DYNAMIC_EXPECT = {
  ZCL_GOGEN_T_DYNRECVREFARG: "bound/bound/initial",
  ZCL_GOGEN_T_DYNRECVCOLLISION: "42/7/9/8",
  ZCL_GOGEN_T_DYNRECVEXPORTTEXT: "export class Z",
  // Node-divergent: Node fabricates zero storage. Required-parameter policy; SAP unmeasured.
  ZCL_GOGEN_T_DYNRECVCHANGING: "CX_SY_DYN_CALL_PARAM_MISSING/7",
  // Node measured; SAP unmeasured. Parenthesized literal method names ignore case.
  ZCL_GOGEN_T_DYNRECVCASE: "42",
  // Hidden parameters are compiler implementation details; SAP unmeasured.
  ZCL_GOGEN_T_DYNRECVSUPPLIED: "42/7/CX_SY_DYN_CALL_PARAM_NOT_FOUND/literal",
  ZCL_GOGEN_T_DYNRECVSTRUCT: "42",
  ZCL_GOGEN_T_DYNRECVANY: "42",
  ZCL_GOGEN_T_DYNRECVCOMPOSITE: "9",

  ZCL_GOGEN_T_DYNRECVCLOSURE: "caught",
  ZCL_GOGEN_T_DYNRECVCHILD: "42",
  ZCL_GOGEN_T_DYNRECVALIAS: "42",
  ZCL_GOGEN_T_DYNRECVFS: "42",
  ZCL_GOGEN_T_DYNRECVDEFAULT: "7",

  // Node measured on 2026-10-15; SAP unmeasured; measure on A4H.
  ZCL_GOGEN_T_DYNRECV: "chai/42/abc/bound/default/0/initial",
  ZCL_GOGEN_T_DYNRECVNF: "CX_SY_DYN_CALL_ILLEGAL_CLASS;root;CX_SY_DYN_CALL_ILLEGAL_METHOD;root;",
  // Node-divergent: silent success / JS TypeError. Keyword documentation policy;
  // Go == JS, SAP unmeasured; measure on A4H.
  ZCL_GOGEN_T_DYNRECVERR: "CX_SY_DYN_CALL_PARAM_NOT_FOUND;root;CX_SY_DYN_CALL_PARAM_NOT_FOUND;root;CX_SY_DYN_CALL_PARAM_NOT_FOUND;root;CX_SY_DYN_CALL_PARAM_MISSING;root;CX_SY_DYN_CALL_ILLEGAL_TYPE;root;",
};
export async function checkDynamicCallOracle(selected, home, core, fixtures) {
  if (selected.length && !selected.some((n) => n.startsWith("zcl_gogen_t_dynrecv"))) return;
  const rows = await dynamicCallOracle(home, core, fixtures);
  for (const [name, value] of Object.entries(rows)) {
    assert.equal(value, DYNAMIC_EXPECT[name], `Node ${name}`);
    console.log(`ok   Node ${name}: ${value}`);
  }
}

// Strip module declarations by parser ranges; strings and comments stay byte-for-byte.
function moduleBody(code) {
  const edits = parse(code, {ecmaVersion: "latest", sourceType: "module"}).body.flatMap((node) =>
    node.type === "ImportDeclaration" ? [[node.start, node.end]]
      : node.type === "ExportNamedDeclaration" && node.declaration ? [[node.start, node.declaration.start]] : []);
  let end = 0, body = "";
  for (const [start, next] of edits) { body += code.slice(end, start); end = next; }
  return body + code.slice(end);
}
