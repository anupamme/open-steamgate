// Dependency candidates. Ordinary object-cache lookup remains global; the
// runner opt-in may replay a complete, revalidated candidate after a miss.
// Missing/corrupt/racing indexes always fall back to ordinary lowering.
import {cacheDiagnostic} from "./frontend-cache-diagnostics.mjs";
import {mkdirSync, readFileSync, writeFileSync, renameSync, rmSync} from "node:fs";
import {join} from "node:path";
import {createHash, randomUUID} from "node:crypto";
import {serialize, deserialize} from "node:v8";
import {deflateRawSync, inflateRawSync} from "node:zlib";
import {keyComputer, hashV3, mismatchReason, borrowedOwners, sealDependencyGraph} from "./frontend-v3-key.mjs";
import {recordLowering, replayLowering, copyReplayProgram} from "./frontend-replay.mjs";
import {auditedBookkeeping, auditBuiltArtifacts} from "./frontend-provenance.mjs";
import {certificateIndex, certificateValidator} from "./frontend-certificates.mjs";
import {timedFrontend} from "./frontend-timing.mjs";
const checksum = (bytes) => createHash("sha256").update(bytes).digest("hex");
const validHash = (s) => typeof s === "string" && /^[0-9a-f]{64}$/.test(s);
const KEEP_CANDIDATES = 4;
const encode = (v) => JSON.stringify(v, (_, x) => x instanceof Map ? {map: [...x]} : x instanceof Set ? {set: [...x]} : x);
function write(file, bytes) {
  const temp = `${file}.${randomUUID()}.pending`;
  try { writeFileSync(temp, bytes); renameSync(temp, file); }
  finally { rmSync(temp, {force: true}); }
}
function pack(value) {
  const bytes = deflateRawSync(serialize(value), {level: 1});
  return Buffer.concat([Buffer.from(checksum(bytes) + "\n"), bytes]);
}
function unpack(file) {
  const bytes = readFileSync(file), payload = bytes.subarray(65);
  if (bytes[64] !== 10 || bytes.subarray(0, 64).toString() !== checksum(payload)) throw new Error("bad v3 checksum");
  return deserialize(inflateRawSync(payload));
}
export function readRecordingPlan(root) { return unpack(join(root, "recording.plan")); }
export function writeRecordingPlan(root, value) {
  try { mkdirSync(root, {recursive: true}); write(join(root, "recording.plan"), pack(value)); }
  catch { /* An unavailable plan restores full recording next time. */ }
}
export function shadowCache(reg, root, namespace, portable) {
  // Namespace/tool identity and key/query indexes are needed only on a miss.
  let namespaceValue, directory;
  const namespaceOf = () => namespaceValue ??= typeof namespace === "function" ? namespace() : namespace;
  const dir = () => directory ??= join(root, "v3", namespaceOf());
  const graphs = new Map(), certificates = new Map();
  let compute, stats;
  let roundProgram;
  const computer = (program) => {
    compute ??= keyComputer(reg, namespaceOf(), program);
    if (roundProgram !== program) { compute.round(program); roundProgram = program; }
    return compute;
  };
  const certificateOf = (id, program) => {
    if (!validHash(id)) throw new Error("bad v3 graph id");
    if (process.env.GOGEN_CACHE_SHADOW_FAULT) return;
    if (!certificates.has(id)) {
      try {
        certificates.set(id, timedFrontend("graphLoading", () => {
          const index = unpack(join(dir(), `${id}.certificates`));
          if (index.graph !== id) throw new Error("certificate-graph-identity");
          return certificateValidator(index, reg);
        }));
      }
      catch { certificates.set(id, undefined); }
    }
    const certificate = certificates.get(id);
    timedFrontend("certificateValidation", () => certificate?.round(program));
    return certificate;
  };
  const entryDir = (owner, name) => join(dir(), hashV3([owner, name]));
  const index = (location) => {
    const keys = JSON.parse(readFileSync(join(location, "index.json"), "utf8"));
    if (!Array.isArray(keys) || keys.length > KEEP_CANDIDATES || keys.some((k) => !validHash(k))) throw new Error("bad v3 index");
    return keys;
  };
  const graphOf = (id) => {
    if (!validHash(id)) throw new Error("bad v3 graph id");
    if (!graphs.has(id)) {
      timedFrontend("graphLoading", () => {
        const bytes = readFileSync(join(dir(), `${id}.provenance`));
        if (checksum(bytes) !== id) throw new Error("bad v3 graph checksum");
        graphs.set(id, sealDependencyGraph(deserialize(inflateRawSync(bytes))));
      });
    }
    return graphs.get(id);
  };
  const begin = (program, attach = true) => {
    if (!stats) {
      stats = {entries: [], recomputeMs: 0, validated: 0, disagreements: 0};
    }
    if (attach) program.frontendCounts.shadowV3 = stats;
  };
  return {
    reset() { stats = undefined; },
    probe(owner, name, program) {
      begin(program);
      const row = {name, wouldReuseV3: false, actuallyLowered: false, reason: "no-candidate"};
      const refuse = (reason) => { if (row.reason === "no-candidate") row.reason = reason; };
      stats.entries.push(row);
      const start = performance.now();
      try {
        const location = entryDir(owner, name);
        for (const key of index(location)) {
          let candidate, graph, value, certificate, certified;
          try {
            candidate = unpack(join(location, `${key}.bin`));
            value = deserialize(candidate.valueBytes);
            if (value.name !== name || candidate.root !== `lowering:${owner}` || candidate.key !== key) continue;
            if (!portable(value)) { refuse("nonportable-candidate"); continue; }
            certificate = certificateOf(candidate.graph, program);
            certified = certificate?.entry(key, candidate.root, value, namespaceOf());
            if (!certified) {
              graph = graphOf(candidate.graph);
              certificate?.seed(computer(program), graph);
            }
          } catch { refuse("corrupt-candidate"); continue; }
          // Recompute completeness from the graph, never trust a persisted bit.
          const saved = certified ? {complete: true, key} : timedFrontend("certificateValidation", () => computer(program)(graph, candidate.root, value));
          if (!saved.complete || saved.key !== key) { refuse(saved.reason ?? "corrupt-key"); continue; }
          row.complete = true;
          const current = certified ? saved : timedFrontend("certificateValidation", () => computer(program)(graph, candidate.root, value, {current: true}));
          if (auditBuiltArtifacts(reg)) { refuse("audit-built-artifact"); break; }
          if (!current.complete) { refuse(current.reason); continue; }
          if (current.key !== key) { refuse(mismatchReason(saved, current)); continue; }
          // Ordered replay already forks every collection it writes. A shallow
          // trial isolates its effects without copying all growing maps first.
          const trial = {...program};
          if (value.supplied !== suppliedGuard(program, name) || !timedFrontend("replay", () => auditedBookkeeping("v3-shadow-replay-validation", () => replayLowering(trial, value.replay)))) {
            refuse("replay-refused"); continue;
          }
          if (certified) value.provenance = certificate.provenance(owner, candidate.root);
          else {
            const own = graph.nodes[owner], lowering = graph.nodes[candidate.root];
            value.provenance = {rows: [...own.rows, ...lowering.rows],
              edges: [...new Set([...own.dependencies, ...lowering.dependencies].filter((k) => k !== owner))]};
          }
          row.certificate = !!certified;
          row.wouldReuseV3 = true; row.currentComplete = true; row.reason = "would-reuse-v3"; row.key = key;
          return {row, value, trial};
        }
      } catch { /* Unavailable cache is a miss. */ }
      finally { stats.recomputeMs += performance.now() - start; }
      return {row};
    },
    validate(prediction, ctx, obj, lower) {
      if (!prediction.value || process.env.GOGEN_CACHE_SHADOW_VALIDATE !== "1") return;
      const cold = copyReplayProgram(ctx.program);
      // A real lowering at the exact class seam, with isolated top-level
      // collections. It contributes no observations to production provenance.
      const recorded = auditedBookkeeping("v3-shadow-cold-validation", () => recordLowering(cold,
        (tracked) => lower({...ctx, program: tracked}, obj)));
      const entry = prediction.value, expected = prediction.trial;
      Object.assign(expected, entry.current);
      const written = new Set([...entry.replay.written, ...recorded.replay?.written ?? []]);
      const effects = (p) => [...written].sort().map((k) => [k, p[k]]);
      const operations = (r) => r?.ops.filter((op) => ["assign", "effect"].includes(op.kind));
      // Compare IR bytes, ordered write/effect bytes and the resulting values.
      const equal = !!recorded.replay && encode(entry.ir) === encode(recorded.ir)
        && encode(operations(entry.replay)) === encode(operations(recorded.replay))
        && encode(effects(expected)) === encode(effects(cold));
      stats.validated++;
      if (!equal) {
        stats.disagreements++;
        throw new Error(`SHADOW V3 DISAGREEMENT: ${entry.name} (IR/effects differ from cold lowering)`);
      }
    },
    finish(graph, entries, program) {
      sealDependencyGraph(graph);
      begin(program, false);
      if (auditBuiltArtifacts(reg)) {
        stats.persistenceRefused = "audit-built-artifact";
        for (const row of stats.entries) {
          row.currentComplete = false; row.completenessReason = "audit-built-artifact";
        }
        return;
      }
      const bytes = deflateRawSync(serialize(graph), {level: 4}), graphHash = checksum(bytes);
      try { mkdirSync(dir(), {recursive: true}); write(join(dir(), `${graphHash}.provenance`), bytes); }
      catch { return; }
      const certifiedEntries = [];
      for (const entry of entries) {
        const value = deserialize(entry.valueBytes), root = `lowering:${entry.owner}`;
        const result = computer(program)(graph, root, value);
        cacheDiagnostic({event: "dependency-key", name: value.name, complete: result.complete, reason: result.reason, key: result.key});
        const row = stats.entries.findLast((r) => r.name === value.name);
        if (row) { row.currentComplete = result.complete; row.completenessReason = result.reason; }
        if (!result.complete) continue;
        certifiedEntries.push({result, root, value});
        const location = entryDir(entry.owner, value.name);
        try {
          mkdirSync(location, {recursive: true});
          write(join(location, `${result.key}.bin`), pack({key: result.key, graph: graphHash, root, valueBytes: entry.valueBytes}));
          let previous = [];
          try { previous = index(location); } catch { /* First observation or corrupt index. */ }
          const keys = [result.key, ...previous.filter((k) => k !== result.key)].slice(0, KEEP_CANDIDATES);
          write(join(location, "index.json"), JSON.stringify(keys));
          for (const key of previous) if (!keys.includes(key)) rmSync(join(location, `${key}.bin`), {force: true});
        } catch { /* Observational persistence cannot break compilation. */ }
      }
      try { write(join(dir(), `${graphHash}.certificates`), pack({...certificateIndex(reg, graph, computer(program), certifiedEntries), graph: graphHash})); }
      catch { /* Missing compact proof keeps the complete validation path. */ }
    },
  };
}
export function suppliedGuard(program, owner) {
  return JSON.stringify([...program.supplied].filter(([k]) => k.startsWith(`${owner}=>`)).map(([k, v]) => [k, [...v]]));
}
export {borrowedOwners};
