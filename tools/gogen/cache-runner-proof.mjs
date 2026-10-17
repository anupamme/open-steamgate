// Real runner, copied inputs, serial memory-capped builds and artifact hashes.
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync, openSync, closeSync} from "node:fs";
import {join, resolve} from "node:path";
const [source, destination, inputDestination, ...flags] = process.argv.slice(2);
if (!source || !destination || !inputDestination || flags.some((f) => f !== "--build"))
  throw new Error("usage: cache-runner-proof.mjs <zlnt-system> <fresh-evidence-dir> <fresh-input-copy> [--build]");
const work = resolve(destination), input = resolve(inputDestination), buildBinary = flags.includes("--build");
for (const folder of [work, input]) {
  if (existsSync(folder)) throw new Error(`${folder} must be fresh`);
  mkdirSync(folder, {recursive: true});
}
const cache = join(work, "frontend");
for (const folder of ["libs/zlnt-core/src", "inputs/zlnt-tests-statements/src", "inputs/zlnt-tests-base/src"])
  cpSync(join(resolve(source), folder), join(input, folder), {recursive: true, dereference: true});
const report = join(input, "inputs/zlnt-tests-base/src/zlnt_tests_run.prog.abap");
const libs = ["libs/zlnt-core/src", "inputs/zlnt-tests-statements/src"].flatMap((folder) => ["--lib", join(input, folder)]);
const results = {buildBinary, rows: [], comparisons: []};
const save = () => writeFileSync(join(work, "report.json"), JSON.stringify(results, null, 2) + "\n");
function capture(label, enabled) {
  const build = join(work, `.build-${label}`), diagnostics = join(work, `${label}.ndjson`);
  const env = {...process.env, NODE_OPTIONS: "--max-old-space-size=24576", OSABAP_BUILD_ROOT: build,
    OSABAP_TIMING: "1", OSABAP_EMIT_ONLY: buildBinary ? "" : "1", OSD_GOGEN_CACHE: enabled ? cache : "",
    GOGEN_CACHE_DIAGNOSTICS: diagnostics};
  const start = performance.now(), log = join(work, `${label}.log`), fd = openSync(log, "w");
  let child;
  try {
    child = spawnSync("systemd-run", ["--user", "--scope", "-q", "-p", "MemoryMax=70G", "-p", "MemorySwapMax=0",
      process.execPath, "--preserve-symlinks", "tools/gogen/osabap.mjs", report, ...libs], {env, stdio: ["ignore", fd, fd]});
  } finally { closeSync(fd); }
  if (child.status !== 0) {
    results.failure = {label, status: child.status, signal: child.signal, error: child.error?.message,
      elapsedMs: Math.round(performance.now() - start), log}; save();
    throw new Error(`${label}: build failed: ${log}`);
  }
  const phases = {};
  let counts;
  for (const line of readFileSync(log, "utf8").split("\n")) if (line.startsWith("OSABAP_TIMING ")) {
    const row = JSON.parse(line.slice("OSABAP_TIMING ".length)); phases[row.phase] = row.ms;
    if (row.phase === "frontend") counts = {lowered: row.lowered, reused: row.reused};
  }
  for (const name of ["frontend", "emit", "goBuild", "total"]) assert.ok(Number.isFinite(phases[name]), `missing ${name}`);
  const generated = join(build, "go/cmd/osabap");
  const hashes = Object.fromEntries(readdirSync(generated).filter((name) => name.startsWith("zz_") || name === "symbols.json").sort()
    .map((name) => [name, createHash("sha256").update(readFileSync(join(generated, name))).digest("hex")]));
  const reasons = {}, loweredClasses = [], rounds = [], allClasses = new Set();
  let seen = new Set(), round = {lowered: 0, reused: 0};
  if (existsSync(diagnostics)) for (const line of readFileSync(diagnostics, "utf8").split("\n")) if (line) {
    const row = JSON.parse(line);
    if (row.event === "class") {
      if (seen.has(row.name)) { rounds.push(round); seen = new Set(); round = {lowered: 0, reused: 0}; }
      seen.add(row.name); allClasses.add(row.name); round[row.hit ? "reused" : "lowered"]++;
      if (!row.hit) {
        const reason = [row.reason, row.key, row.method].filter(Boolean).join(":");
        reasons[reason] = (reasons[reason] ?? 0) + 1; loweredClasses.push(row.name);
      }
    }
  }
  if (seen.size) rounds.push(round);
  if (enabled) assert.equal(allClasses.size, counts.lowered + counts.reused, "diagnostics must cover the final class universe");
  results.rows.push({label, enabled, phases, counts, reasons, loweredClasses, rounds,
    uniqueClasses: allClasses.size || counts.lowered + counts.reused,
    uniqueLowered: enabled ? [...new Set(loweredClasses)].sort() : undefined,
    manifestHash: createHash("sha256").update(JSON.stringify(hashes)).digest("hex"),
    wallMs: Math.round(performance.now() - start), hashes});
  save(); console.error(JSON.stringify(results.rows.at(-1)));
  return hashes;
}
function equal(left, right, label) {
  assert.deepEqual(right, left, `${label}: generated artifacts differ`);
  results.comparisons.push({label, equal: true}); save();
}
const recorded = capture("cold-enabled", true);
equal(recorded, capture("warm-enabled", true), "unchanged warm = recorded");
const cold = capture("cold-disabled", false);
equal(cold, recorded, "cold enabled = disabled");
equal(cold, capture("warm-disabled", false), "disabled control = cold");
const file = join(input, "inputs/zlnt-tests-statements/src/zcl_lnt_add_module.clas.abap");
const before = readFileSync(file, "utf8"), after = before.replace("|add 2 to lv_foo.|", "|add 3 to lv_foo.|");
assert.notEqual(after, before); writeFileSync(file, after);
results.edit = {file: "zcl_lnt_add_module.clas.abap", before: "|add 2 to lv_foo.|", after: "|add 3 to lv_foo.|"}; save();
const editedWarm = capture("edited-enabled", true), editedCold = capture("edited-disabled", false);
equal(editedCold, editedWarm, "edited warm = edited cold");
assert.notDeepEqual(editedCold, cold, "edit must change generated artifacts");
const warm = results.rows.find((r) => r.label === "warm-enabled"), disabled = results.rows.find((r) => r.label === "warm-disabled");
results.reuseRatio = 1 - warm.uniqueLowered.length / warm.uniqueClasses;
results.finalRoundReuseRatio = warm.counts.reused / (warm.counts.reused + warm.counts.lowered);
results.minimumRoundReuseRatio = Math.min(...warm.rounds.map((r) => r.reused / (r.reused + r.lowered)));
results.reuseBudgetMet = results.reuseRatio >= 0.99 && results.minimumRoundReuseRatio >= 0.99;
results.editedNewlyLowered = results.rows.find((r) => r.label === "edited-enabled").uniqueLowered.filter((n) => !warm.uniqueLowered.includes(n));
results.unchangedWarmRatio = warm.phases.total / disabled.phases.total;
results.editedBudgetMet = results.rows.find((r) => r.label === "edited-enabled").phases.total <= 100000;
save();
