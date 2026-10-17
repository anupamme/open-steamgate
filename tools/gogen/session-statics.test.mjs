import {createGoTestDir} from "./go-test-module.mjs";
import {test} from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {copyFileSync, mkdirSync, rmSync, writeFileSync} from "node:fs";
import {dirname, join, basename} from "node:path";
import {fileURLToPath} from "node:url";
import {compileProgram} from "./frontend.mjs";

const here = dirname(fileURLToPath(import.meta.url));
// Allows the same fixture and Go driver to verify an earlier emitter without a stash.
const {emitGo} = await import(process.env.GOGEN_STATICS_EMITTER ?? "./emit-go.mjs");
const bench = process.env.GOGEN_STATICS_BENCH === "1";
for (const layered of bench ? [false] : [false, true]) test(`generated class statics and constructors belong to each internal session (${layered ? "layered" : "single package"})`, () => {
  const fixture = join(here, "fixtures", "session-statics");
  const {dir, goRoot} = createGoTestDir("session-statics-");
  try {
    const program = compileProgram({folders: [fixture], objects: ["ZCL_RACE_INIT", "ZCL_RACE_COUNTER", "ZCL_RACE_READER", "ZCL_RACE_CHILD", "ZCL_RACE_BASE", ...(layered ? [] : ["ZCL_PROBE"])]});
    assert.deepEqual(program.partial, []);
    assert.deepEqual(program.broken, []);
    if (layered) {
      const base = program.classes.filter((c) => c.name === "ZCL_RACE_BASE");
      const rest = program.classes.filter((c) => c.name !== "ZCL_RACE_BASE");
      mkdirSync(join(dir, "core"));
      writeFileSync(join(dir, "core", "zz_generated.go"), emitGo(program, "core", {
        classes: base, structs: new Map(), consts: new Map(),
        externalClasses: new Set(rest.map((c) => c.name)), marker: "StaticsCoreLayer",
      }));
      writeFileSync(join(dir, "zz_generated.go"), emitGo(program, "main", {
        classes: rest, structs: new Map(), consts: new Map(),
        externalClasses: new Set(base.map((c) => c.name)),
        imports: [`osg/gogen/cmd/${basename(dir)}/core`], importMarkers: ["StaticsCoreLayer"],
      }));
    } else writeFileSync(join(dir, "zz_generated.go"), emitGo(program));
    copyFileSync(join(fixture, "statics_test.go"), join(dir, "statics_test.go"));
    // The original layered fixture still checks inheritance across packages;
    // event registrations are exercised by the single-package generated probe.
    if (!layered) copyFileSync(join(fixture, "events_test.go"), join(dir, "events_test.go"));
    const args = bench ? ["-run", "^$", "-bench", "BenchmarkSessionStaticIncrement", `-benchtime=${process.env.GOGEN_STATICS_BENCHTIME ?? "10000000x"}`, "-count=5"] : ["-race", "-count=3"];
    const run = spawnSync("go", ["test", ...args, `./cmd/${basename(dir)}`], {
      cwd: goRoot, encoding: "utf8", timeout: 180000,
      env: {...process.env, GORACE: "halt_on_error=1 exitcode=66"},
    });
    if (bench) process.stdout.write(run.stdout);
    assert.equal(run.error, undefined);
    assert.equal(run.status, 0, run.stderr + run.stdout);
    // a clean runner downloads the module's dependencies first ("go:
    // downloading ..."); anything else on stderr is a finding (a data race
    // report goes there)
    assert.equal(run.stderr.split("\n").filter((l) => l && !/^go: downloading /.test(l)).join("\n"), "");
  } finally { rmSync(goRoot, {recursive: true, force: true}); }
});
