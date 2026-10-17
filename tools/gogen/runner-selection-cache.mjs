// Optional host adapter; the compiler controller itself performs no host I/O.
import {createHash, randomUUID} from "node:crypto";
import {mkdirSync, readFileSync, renameSync, rmSync, writeFileSync} from "node:fs";
import {join} from "node:path";
import {discoveryEvidence} from "./runner-selection-evidence.mjs";
const digest = value => createHash("sha256").update(JSON.stringify(value ?? null)).digest("hex");
function closedSelection(saved) {
  const strings = value => Array.isArray(value) && value.every(n => typeof n === "string");
  if (!Array.isArray(saved.rounds) || !saved.rounds.length || !strings(saved.selection)) return undefined;
  let expected = saved.key.roots, selected;
  for (const row of saved.rounds) {
    if (![row.inputs, row.wanted, row.missing, row.supers, row.added].every(strings) || digest(row.inputs) !== digest(expected)) return undefined;
    selected ??= new Set(row.wanted);
    for (const name of row.added) {
      if (selected.has(name) || ![...row.missing, ...row.supers].includes(name)) return undefined;
    }
    row.added.forEach(n => selected.add(n));
    expected = [...selected];
  }
  if (saved.rounds.at(-1).added.length || digest(saved.rounds.at(-1).inputs) !== digest(saved.selection)) return;
  return [...selected];
}
export function runnerSelectionCache(cacheDir, identity, files, policy) {
  const file = join(cacheDir, "runner-selection.json");
  let previous;
  try {
    const saved = JSON.parse(readFileSync(file, "utf8"));
    if (saved.checksum === digest(saved.contents)) previous = saved.contents;
  } catch { /* Discovery from original roots. */ }
  const current = () => files.map(({layer, name, hash, path}) => ({layer, name, hash,
    evidence: discoveryEvidence(name, readFileSync(path, "utf8"))}));
  let inputs;
  const key = options => ({identity, policy, roots: options.objects, tolerant: options.tolerant ?? false,
    includeTests: options.includeTests instanceof Set ? [...options.includeTests] : options.includeTests ?? false});
  return {
    read(options) {
      try {
        if (options.registry || options.session || digest(previous?.key) !== digest(key(options))) return;
        if (!Array.isArray(previous?.inputs) || previous.inputs.length !== files.length
            || !previous.inputs.every(row => row && typeof row.hash === "string" && typeof row.evidence === "string")) return;
        const closed = closedSelection(previous);
        if (!closed) return;
        const exact = previous.inputs.every((old, i) => old.layer === files[i].layer && old.name === files[i].name && old.hash === files[i].hash);
        if (exact) inputs = previous.inputs;
        if (!exact) {
          inputs = files.map((row, i) => row.layer === previous.inputs[i].layer && row.name === previous.inputs[i].name && row.hash === previous.inputs[i].hash ? previous.inputs[i] : {
            layer: row.layer, name: row.name, hash: row.hash, evidence: discoveryEvidence(row.name, readFileSync(row.path, "utf8"))});
          if (!inputs.every((row, i) => row.layer === previous.inputs[i].layer && row.name === previous.inputs[i].name
              && row.evidence === previous.inputs[i].evidence
              && (row.hash === previous.inputs[i].hash || row.evidence.startsWith("local-v1:")))) return;
        }
        return {selection: previous.selection, closed, evidence: exact ? "exact-inputs" : "local-string-initializers", rounds: previous.rounds};
      } catch { return; } // Incomplete evidence always restarts discovery.
    },
    write(options, selection, rounds) {
      if (options.registry || options.session) return;
      const temp = `${file}.${randomUUID()}.pending`;
      try {
        const contents = {key: key(options), inputs: inputs ?? current(), selection, rounds};
        mkdirSync(cacheDir, {recursive: true});
        writeFileSync(temp, JSON.stringify({contents, checksum: digest(contents)})); renameSync(temp, file);
      } catch { /* Unavailable metadata is a miss. */ }
      finally { try { rmSync(temp, {force: true}); } catch { /* Unavailable cache. */ } }
    },
  };
}
