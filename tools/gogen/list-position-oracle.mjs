// Diagnostic measurements, not assertions of SAP behavior. No SAP connection.
// OSD_HEAVY_RANGE=50-59 tools/osd-heavy.sh node tools/gogen/list-position-oracle.mjs [--native]
import {execFileSync} from "node:child_process";
import {mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import {ABAP, MemoryConsole} from "@abaplint/runtime";
import {modulesOf} from "../osd-transpile.mjs";
import {libraryPath} from "../osd-lib-path.mjs";
import {home} from "./home.mjs";

const cases = [
  ["reported", "WRITE / 'a'. ULINE. WRITE / 'b'."],
  ["start", "ULINE. WRITE / 'b'."],
  ["twice", "ULINE. ULINE. WRITE / 'b'."],
  ["inline", "WRITE / 'a'. ULINE. WRITE 'b'."],
  ["write-uline", "WRITE / 'a'. ULINE."],
  ["skip", "WRITE / 'a'. SKIP. WRITE / 'b'."],
  ["new-line", "WRITE / 'a'. NEW-LINE. WRITE / 'b'."],
  ["top", "TOP-OF-PAGE. ULINE. WRITE / 'h'. START-OF-SELECTION. WRITE / 'b'."],
];
const gui = libraryPath(home, "open-abap-gui");
const core = join(libraryPath(home, "open-abap-core"), "src");
const {Transpiler} = modulesOf(home);
const {convertProgram} = await import(pathToFileURL(join(gui, "converter/src/api.mjs")).href);
const options = {ignoreSyntaxCheck: true, unknownTypes: "runtimeError", addCommonJS: true};
const dir = mkdtempSync(join(tmpdir(), "list-position-oracle-"));
const saved = globalThis.abap;
const hostClasses = new Set(["cx_root", "cx_no_check", "cx_static_check", "cx_dynamic_check",
  "cl_message_helper", "kernel_internal_name", "zcl_gg_host_list", "zcl_gg_host_session",
  "zcl_gg_host_compatibility", "zcl_gg_host_status", "zcx_gg_control_flow"]);
const hostFiles = [];
for (const root of [core, join(gui, "framework"), join(gui, "src")]) {
  for (const path of readdirSync(root, {recursive: true}).sort()) {
    const filename = path.split("/").at(-1);
    if (filename.endsWith(".intf.abap") || filename.endsWith(".type.abap") || filename.endsWith(".xml")
        || filename.endsWith(".clas.abap") && hostClasses.has(filename.split(".")[0])) {
      hostFiles.push({filename, contents: readFileSync(join(root, path), "utf8")});
    }
  }
}

async function runNode(files, target) {
  const output = await new Transpiler(options).runRaw(files);
  mkdirSync(target, {recursive: true});
  const abap = globalThis.abap = new ABAP({console: new MemoryConsole()});
  for (const object of output.objects) writeFileSync(join(target, object.filename), object.chunk.getCode());
  for (const object of output.objects.filter(o => o.filename.endsWith(".clas.mjs") || o.filename.endsWith(".intf.mjs"))) {
    await import(pathToFileURL(join(target, object.filename)).href);
  }
  await import(pathToFileURL(join(target, "zprobe.prog.mjs")).href);
  return abap.console.get();
}

// Execute the actual converted event and list processor, with the same handler
// wiring as ZCL_GG_HOST=>RUN. Kernel code only serializes the finished list;
// it does not implement list positioning or change its output.
const driver = `REPORT zprobe.
DATA lo_list TYPE REF TO zcl_gg_host_list.
DATA lo_session TYPE REF TO zcl_gg_host_session.
DATA lo_report TYPE REF TO zcl_osabap_probe.
DATA lo_handler TYPE REF TO zif_gg_list_processing_v1.
DATA lt_lines TYPE zcl_gg_host_list=>ty_text_lines.
lo_list = NEW #( ).
lo_session = NEW #( io_list = lo_list ).
lo_report = NEW #( ).
lo_handler = lo_report->zif_gg_report_v1~get_list_processing( lo_session ).
lo_list->set_handler( io_session = lo_session io_handler = lo_handler ).
IF lo_handler IS BOUND.
  lo_list->apply_settings( lo_handler->get_settings( lo_session ) ).
ENDIF.
lo_report->zif_gg_report_v1~start_of_selection( io_session = lo_session it_values = VALUE #( ) ).
lt_lines = lo_list->finish_output( ).
WRITE '@KERNEL abap.console.add(JSON.stringify(lt_lines.array().map(row => row.get())));'.`;

try {
  for (const [name, body] of cases) {
    const source = `REPORT zprobe. ${body}`;
    try {
      const output = await runNode([{filename: "zprobe.prog.abap", contents: source}], join(dir, name, "direct"));
      console.log(JSON.stringify({name, engine: "Node-direct", source, output}));
    } catch (error) {
      console.log(JSON.stringify({name, engine: "Node-direct", error: error.message}));
    }
    const converted = await convertProgram({source, filename: "zprobe.prog.abap", mode: "strict",
      nativePassthrough: true, className: "ZCL_OSABAP_PROBE", transactionCode: "ZPROBE"});
    if (!converted.supported) throw new Error(JSON.stringify(converted.diagnostics));
    const files = [...hostFiles, {filename: "zcl_osabap_probe.clas.abap", contents: converted.classSource},
      ...(converted.helperSources ?? []).map(h => ({filename: `${h.className.toLowerCase()}.clas.abap`, contents: h.source})),
      {filename: "zprobe.prog.abap", contents: driver}];
    const lines = JSON.parse(await runNode(files, join(dir, name, "converted")));
    console.log(JSON.stringify({name, engine: "Node-converted", lines}));
    if (process.argv.includes("--native")) {
      const reportDir = join(dir, "report");
      mkdirSync(reportDir, {recursive: true});
      const report = join(reportDir, "zprobe.prog.abap");
      writeFileSync(report, source);
      const build = join(dir, "native");
      execFileSync(process.execPath, [join(import.meta.dirname, "osabap.mjs"), report], {
        env: {...process.env, OSABAP_BUILD_ROOT: build}, stdio: ["ignore", "ignore", "inherit"],
      });
      const output = execFileSync(join(build, ".out/osabap"), ["-params", "{}"], {encoding: "utf8"});
      console.log(JSON.stringify({name, engine: "Go-native", output}));
    }
  }
} finally {
  globalThis.abap = saved;
  rmSync(dir, {recursive: true, force: true});
}
