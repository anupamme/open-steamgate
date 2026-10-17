// Host-side, compact proofs for the bounded existing-class edit path. The full
// observation graph remains the authority for every uncovered/affected entry.
import {inputSnapshot, rawHashOf, cdsInputDigest} from "./frontend-inventory.mjs";
import {hashV3, replayGuards, borrowedOwners} from "./frontend-v3-key.mjs";
import {querySpec, queryAnswer, supportedQuery, queryEvaluator} from "./frontend-v3-queries.mjs";
import {projectedQuery, projectionAnswer} from "./frontend-query-contract.mjs";
import {provenanceGraph, auditedBookkeeping, auditBuiltArtifacts} from "./frontend-provenance.mjs";
import {graphComponents} from "./frontend-components.mjs";
import {cacheDiagnostic} from "./frontend-cache-diagnostics.mjs";

export function effectiveInputs(reg) {
  const snapshot = inputSnapshot(reg);
  return {config: snapshot.config, cds: cdsInputDigest(reg), owners: [...snapshot.objects].map(([owner, e]) =>
    [owner, e.dependency, e.sources.map((s) => [s.name, rawHashOf(s)])])};
}

// A query's possible providers, including absent answers, are a contract, not
// edges inferred from its former answer. null means no invalidation coverage.
export function queryCoverage(q) {
  if (!supportedQuery(q)) return null;
  if (projectedQuery(q)) return "round";
  if (q.kind === "locals") return q.policy === "ordered-qualified-definitions" ? "round" : null;
  if (q.kind === "ownershipSafety") return q.policy === "expanded-statements" ? [q.artifact] : null;
  if (q.kind === "lock") return q.policy === "named-lock" ? ["type:ENQU"] : null;
  if (q.kind === "cds-mapping") return q.policy === "ordered-raw-ddls" ? [] : null;
  if (["function-module-owner", "function-group-include"].includes(q.kind)) {
    if (q.policy !== undefined && q.policy !== "group-member"
        && !(q.kind === "function-module-owner" && q.policy === "gogen-last-wins")) return null;
    return ["type:FUGR", "type:PROG"];
  }
  if (q.policy !== undefined) return null;
  if (["getObject", "getFileByName", "findObjectForFile", "getFirstObject"].includes(q.kind)) return [];
  if (["include-parent", "include-macro-context"].includes(q.kind)) return "all";
  if (q.kind === "cds-alias") return ["type:DDLS"];
  if (q.kind === "badi-definition") return ["type:ENHS"];
  if (q.kind === "behavior-definition") return ["type:BDEF"];
  if (["implicit-type-pool", "implicit-type-pool-constant"].includes(q.kind)) return ["type:TYPE"];
  return null;
}
const answerHash = (q, answer) => hashV3(projectedQuery(q) ? projectionAnswer(answer) : answer);

export function certificateIndex(reg, graph, compute, entries) {
  const queries = [], intern = new Map(), rows = new WeakMap(), nodes = {}, reverse = {};
  for (const [id, node] of Object.entries(graph.nodes)) {
    const ids = [];
    for (const q of node.rows) {
      if (q.role !== "artifact") continue;
      if (rows.has(q)) { ids.push(rows.get(q)); continue; }
      const spec = querySpec(q), answer = queryAnswer(q), hash = answerHash(q, answer), key = hashV3([spec, hash]);
      if (!intern.has(key)) {
        intern.set(key, queries.length);
        queries.push({q: {...spec, ...answer}, coverage: queryCoverage(q), hash});
      }
      rows.set(q, intern.get(key));
      ids.push(intern.get(key));
    }
    nodes[id] = {owner: node.owner, dependencies: node.dependencies, queries: [...new Set(ids)]};
    reverse[id] ??= [];
    for (const dependency of node.dependencies) (reverse[dependency] ??= []).push(id);
  }
  const components = graphComponents(nodes), certificates = compute.certificates(graph);
  const roots = Object.fromEntries(entries.filter((e) => e.result.complete).map((e) => [e.result.key,
    {root: e.root, roots: [...new Set([e.root, ...borrowedOwners(e.value)])], parts: e.result.parts}]));
  return {format: "gogen-certificates-1", inputs: effectiveInputs(reg), nodes, reverse, queries,
    members: components.members, certificates, roots};
}

export function certificateValidator(index, reg) {
  const now = effectiveInputs(reg), before = index.inputs;
  if (index.format !== "gogen-certificates-1" || before.config !== now.config || before.cds !== now.cds
      || before.owners.length !== now.owners.length) throw new Error("certificate-input-scope");
  const changed = new Set();
  for (const {q, coverage} of index.queries) {
    if (JSON.stringify(coverage) !== JSON.stringify(queryCoverage(q))) throw new Error("certificate-query-coverage");
    if (projectedQuery(q)) for (const values of [q.result, q.providers]) if (Array.isArray(values)) Object.freeze(values);
  }
  for (let i = 0; i < now.owners.length; i++) {
    const [owner, role, files] = now.owners[i], old = before.owners[i];
    if (owner !== old[0] || role !== old[1] || files.length !== old[2].length
        || files.some(([name], n) => name !== old[2][n][0])) throw new Error("certificate-inventory-order");
    if (files.some(([, hash], n) => hash !== old[2][n][1])) {
      if (!owner.startsWith("CLAS ")) throw new Error("certificate-edit-scope");
      changed.add(owner);
    }
  }
  // Check the redundant forward/reverse index once. Losing an edge must fail
  // closed even when a file was repackaged with a valid storage checksum.
  const forwardSets = new Map(Object.entries(index.nodes).map(([id, n]) => [id, new Set(n.dependencies)]));
  const reverseSets = new Map(Object.entries(index.reverse).map(([id, n]) => [id, new Set(n)]));
  const owners = new Set(now.owners.map(([owner]) => owner));
  for (const [id, node] of Object.entries(index.nodes)) {
    if (!owners.has(node.owner) || id !== node.owner && id !== `lowering:${node.owner}`) throw new Error("certificate-owner-index");
    if (!Array.isArray(node.queries) || node.queries.some((n) => !index.queries[n])) throw new Error("certificate-query-index");
    for (const dependency of node.dependencies)
      if (!index.nodes[dependency] || !reverseSets.get(dependency)?.has(id)) throw new Error("certificate-reverse-edge");
  }
  for (const [id, dependents] of Object.entries(index.reverse)) for (const dependent of dependents)
    if (!forwardSets.get(dependent)?.has(id)) throw new Error("certificate-forward-edge");
  const components = graphComponents(index.nodes);
  if (hashV3(components.members) !== hashV3(index.members) || index.certificates.length !== index.members.length)
    throw new Error("certificate-components");
  for (const entry of Object.values(index.roots)) {
    if (!entry.roots.includes(entry.root) || entry.roots.some((id) => !index.nodes[id])) throw new Error("certificate-roots");
    const hashes = [...new Set(entry.roots.map((id) => components.component.get(id)))].map((n) => index.certificates[n]?.hash).sort();
    if (hashes.some((hash) => !hash) || hashV3(hashes) !== hashV3(entry.parts.components)) throw new Error("certificate-root-components");
  }
  const reverse = structuredClone(index.reverse);
  // Test-only negative control, applied AFTER structural validation. The cold
  // oracle must catch the resulting stale constant/default reader.
  const fault = process.env.GOGEN_CACHE_CERTIFICATE_FAULT;
  if (fault) {
    if (!fault.startsWith("drop-reverse:")) throw new Error(`unknown GOGEN_CACHE_CERTIFICATE_FAULT: ${fault}`);
    reverse[fault.slice(13)] = [];
  }
  let invalid, roundProgram, epoch, revision;
  const expand = (seeds) => {
    const result = new Set(seeds), queue = [...result];
    for (let i = 0; i < queue.length; i++) for (const id of reverse[queue[i]] ?? [])
      if (!result.has(id)) { result.add(id); queue.push(id); }
    return result;
  };
  const base = new Set(Object.entries(index.nodes).filter(([, n]) => changed.has(n.owner)).map(([id]) => id));
  return {
    round(program) {
      const trace = provenanceGraph(reg);
      if (roundProgram === program && epoch === trace?.unknownVersion) return;
      const seeds = new Set(base), evaluate = queryEvaluator(program), answers = new Map();
      let evaluated = 0;
      for (let n = 0; n < index.queries.length; n++) {
        const {q, coverage, hash} = index.queries[n];
        const possible = coverage === "round" || coverage === "all" && changed.size > 0
          || Array.isArray(coverage) && coverage.some((owner) => changed.has(owner)
            || owner.startsWith("type:") && [...changed].some((c) => c.startsWith(owner.slice(5) + " ")));
        if (coverage === null) { answers.set(n, false); continue; }
        if (!possible) continue;
        try {
          evaluated++;
          const answer = auditedBookkeeping("certificate-query", () => evaluate(q));
          answers.set(n, answerHash(q, answer) === hash);
        } catch { answers.set(n, false); }
      }
      const unknown = (entry) => [...entry?.queries.values() ?? []].some((q) => q.role === "artifact" && q.kind === "unknown-scan");
      const globalUnknown = unknown(trace?.global), unknownOwners = new Set();
      for (const [owner, entry] of trace?.artifacts ?? []) if (unknown(entry)) unknownOwners.add(owner);
      for (const [id, node] of Object.entries(index.nodes)) {
        if (node.queries.some((n) => answers.get(n) === false)) seeds.add(id);
        if (globalUnknown || unknownOwners.has(node.owner)) seeds.add(id);
      }
      invalid = expand(seeds); roundProgram = program; epoch = trace?.unknownVersion; revision = {};
      cacheDiagnostic({event: "certificate-validation", graph: index.graph, changedOwners: [...changed], invalidatedNodes: invalid.size,
        invalidatedRoots: Object.values(index.roots).filter((e) => e.roots.some((id) => invalid.has(id))).length,
        queriesEvaluated: evaluated, nodes: Object.keys(index.nodes).length});
    },
    entry(key, root, value, namespace) {
      if (!invalid || auditBuiltArtifacts(reg)) return false;
      const entry = index.roots[key];
      if (!entry || entry.root !== root || entry.roots.some((id) => invalid.has(id))) return false;
      const parts = {...entry.parts, name: value.name, supplied: value.supplied ?? null,
        guards: hashV3(["gogen-replay-guards-3", replayGuards(value)])};
      return hashV3(["gogen-entry-key-4", namespace, parts]) === key;
    },
    provenance(owner, root) {
      const own = index.nodes[owner], lowering = index.nodes[root];
      return {rows: [...own.queries, ...lowering.queries].map((n) => index.queries[n].q),
        edges: [...new Set([...own.dependencies, ...lowering.dependencies].filter((id) => id !== owner))]};
    },
    seed(compute, graph) {
      if (invalid) compute.seed(graph, index.certificates, new Set(index.members
        .map((members, n) => members.every((id) => !invalid.has(id)) ? n : -1).filter((n) => n >= 0)), revision);
    },
  };
}
