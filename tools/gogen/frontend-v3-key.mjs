import {projectedQuery, projectionAnswer} from "./frontend-query-contract.mjs";
// Schema v3 semantic keys. Only ARTIFACT closure nodes enter this format;
// source words, scheduling inventories and final-output dispatch do not.
import {graphComponents} from "./frontend-components.mjs";
import {cacheDiagnostic} from "./frontend-cache-diagnostics.mjs";
import {createHash} from "node:crypto";
import {artifactDigestOf, canonical} from "./frontend-artifact-digests.mjs";
import {inputSnapshot} from "./frontend-inventory.mjs";
import {querySpec, queryAnswer, supportedQuery, queryEvaluator} from "./frontend-v3-queries.mjs";
import {auditedBookkeeping, provenanceGraph} from "./frontend-provenance.mjs";
// Cache-owned graphs are complete and never mutated after publication. Public
// keyComputer callers may supply mutable graphs; they are recomputed each call.
const sealed = new WeakSet();
export function sealDependencyGraph(graph) {
  const seen = new Set();
  for (const node of Object.values(graph.nodes)) for (const row of node.rows) if (projectedQuery(row)) {
    for (const values of [row.result, row.providers]) if (Array.isArray(values) && !seen.has(values)) {
      seen.add(values); Object.freeze(values);
    }
  }
  sealed.add(graph); return graph;
}
export const encoded = (v) => JSON.stringify(canonical(v));
export const hashV3 = (v) => createHash("sha256").update(encoded(v)).digest("hex");
export const replayGuards = (value) => value.replay.ops.filter((op) => ["read", "measure"].includes(op.kind));

// Borrowed definitions can come through program maps, bypassing named registry
// reads. The fingerprint's owning artifact is still a semantic dependency.
export function borrowedOwners(value) {
  const owners = new Set();
  for (const op of value.replay?.ops ?? []) if (op.kind === "read" && op.value !== undefined) {
    JSON.parse(op.value, (_, v) => { if (v?.definition && v.owner) owners.add(v.owner); return v; });
  }
  return owners;
}

export function keyComputer(reg, namespace, program) {
  const inventory = inputSnapshot(reg), answers = new Map(), rawHashes = new Map();
  const sources = new Map([...inventory.objects.values()].flatMap((e) => e.sources).map((s) => [s.name, s]));
  const specifications = new WeakMap(), queryValues = new WeakMap(), guards = new WeakMap();
  let evaluate = queryEvaluator(program);
  const trace = provenanceGraph(reg), currentIssues = new Map();
  const fault = process.env.GOGEN_CACHE_SHADOW_FAULT;
  const drop = fault?.startsWith("drop-dependency:") ? new RegExp(fault.slice(16)) : undefined;
  if (fault && !drop && !["ignore-miss", "unknown-complete"].includes(fault) && !fault.startsWith("ignore-query:"))
    throw new Error(`unknown GOGEN_CACHE_SHADOW_FAULT: ${fault}`);
  const digest = (key, current, graph) => {
    if (drop?.test(key)) return "FAULT-OMITTED";
    if (!current) return graph.nodes[key]?.digest ?? null;
    return artifactDigestOf(reg, key);
  };
  const raw = (name) => {
    if (!rawHashes.has(name)) {
      const source = sources.get(name);
      rawHashes.set(name, source ? hashV3(["raw-file", source.name, source.raw]) : null);
    }
    return rawHashes.get(name);
  };
  // A provider's rows are shared by many entry closures. Hash and re-evaluate
  // each shared query node once, rather than serializing it again per consumer.
  const queryValue = (graph, q, current) => {
    if (!queryValues.has(graph)) queryValues.set(graph, [new WeakMap(), new WeakMap()]);
    const cache = queryValues.get(graph)[Number(current)];
    if (cache.has(q)) return cache.get(q);
    if (!specifications.has(q)) {
      const spec = querySpec(q);
      specifications.set(q, {spec, id: hashV3(["gogen-query-id-3", spec])});
    }
    const {spec, id} = specifications.get(q);
    let answer = queryAnswer(q);
    if (current && fault !== `ignore-query:${q.kind}`) {
      if (!answers.has(id)) answers.set(id, auditedBookkeeping("v3-current-query", () => evaluate(q)));
      answer = answers.get(id);
    }
    const providers = [], rawFiles = [];
    for (const identity of projectedQuery(q) ? [] : [...answer.result, ...answer.providers ?? []]) {
      if (typeof identity !== "string") continue;
      if (inventory.objects.has(identity) || graph.nodes[identity]) {
        const d = digest(identity, current, graph);
        if (!d) throw new Error(`missing-digest:${identity}`);
        providers.push([identity, d]);
      } else if (inventory.fileOwners.has(identity) || Object.hasOwn(graph.rawFiles ?? {}, identity)) {
        const d = current ? raw(identity) : graph.rawFiles?.[identity];
        if (!d) throw new Error(`missing-raw-hash:${identity}`);
        rawFiles.push([identity, d]); providers.push(["raw-file", identity, d]);
      } else if (q.kind === "getFileByName" && answer.result.length) throw new Error(`missing-raw-hash:${identity}`);
    }
    const result = {spec, id, rawFiles, hash: projectedQuery(q)
      ? hashV3(["gogen-projected-answer-4", spec, projectionAnswer(answer)])
      : hashV3(["gogen-query-answer-3", spec, answer.result.length ? answer : {...answer, missing: "MISSING"}, providers])};
    cache.set(q, result);
    return result;
  };
  const states = new WeakMap();
  const firstReason = (a, b) => a === undefined ? b : b === undefined ? a : a < b ? a : b;
  const stateOf = (graph) => {
    if (sealed.has(graph) && states.has(graph)) return states.get(graph);
    const index = graphComponents(graph.nodes, drop);
    const state = {index, nodes: [new Map(), new Map()], groups: [new Map(), new Map()],
      observations: [new Map(), new Map()], invalid: [undefined, undefined]};
    if (sealed.has(graph)) {
      states.set(graph, state);
      cacheDiagnostic({event: "dependency-components", nodes: Object.keys(graph.nodes).length,
        components: index.members.length, largest: Math.max(0, ...index.members.map((m) => m.length))});
    }
    return state;
  };
  const nodeValue = (graph, id, current, state) => {
    const memo = state.nodes[Number(current)];
    if (memo.has(id)) return memo.get(id);
    const node = graph.nodes[id];
    if (!node) throw new Error(`missing-artifact:${id}`);
    if (drop?.test(node.owner)) return {hash: hashV3(["dropped"]), queries: new Map(), rawFiles: new Map()};
    if (current && fault !== "unknown-complete") {
      if (!currentIssues.has(node.owner)) {
        const rows = [...trace?.global.queries.values() ?? [], ...trace?.artifacts.get(node.owner)?.queries.values() ?? []];
        const unknown = rows.find((q) => q.role === "artifact" && q.kind === "unknown-scan");
        currentIssues.set(node.owner, unknown ? `current-unknown-scan:${node.owner}:${unknown.args.join("/")}` : undefined);
      }
      if (currentIssues.get(node.owner)) throw new Error(currentIssues.get(node.owner));
    }
    const d = digest(node.owner, current, graph);
    if (!d) throw new Error(`missing-digest:${node.owner}`);
    const queries = new Map(), rawFiles = new Map();
    for (const q of node.rows) {
      if (q.role !== "artifact" || fault === "unknown-complete" && q.kind === "unknown-scan") continue;
      if (!supportedQuery(q)) throw new Error(`${q.kind === "unknown-scan" ? "unknown-scan" : "unsupported-query"}:${q.args.join("/") || q.kind}`);
      if (fault === "ignore-miss" && !q.result.length) continue;
      const resolved = queryValue(graph, q, current), observed = state.observations[Number(current)];
      if (observed.has(resolved.id) && observed.get(resolved.id) !== resolved.hash) {
        state.invalid[Number(current)] = `unstable-query:${q.kind}`;
        throw new Error(state.invalid[Number(current)]);
      }
      observed.set(resolved.id, resolved.hash); queries.set(resolved.id, resolved);
      for (const [name, hash] of resolved.rawFiles) rawFiles.set(name, hash);
    }
    for (const edge of node.dependencies) if (!graph.nodes[edge]) throw new Error(`missing-artifact:${edge}`);
    // Stream node tuples: large shared closures must not become a giant JSON
    // tree again for every consumer. Sorted query IDs bind the same observations.
    const hash = createHash("sha256").update(encoded(["gogen-component-node-4", id, node.owner, d]));
    for (const [key, value] of [...queries].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))
      hash.update(encoded([key, value.hash]));
    const result = {hash: hash.digest("hex"), digest: d, queries, rawFiles};
    memo.set(id, result); return result;
  };
  const groupValue = (graph, number, current, state) => {
    const memo = state.groups[Number(current)];
    if (memo.has(number)) {
      const value = memo.get(number); if (value.error) throw new Error(value.error); return value;
    }
    try {
      const children = state.index.dependencies[number].map((n) => groupValue(graph, n, current, state));
      const nodes = state.index.members[number].map((id) => [id, nodeValue(graph, id, current, state)]);
      let dependencyReason, rawReason, queryReason, queryId;
      if (current) for (const [id, now] of nodes) {
        const before = nodeValue(graph, id, false, state), owner = graph.nodes[id].owner;
        if (before.digest !== now.digest) dependencyReason = firstReason(dependencyReason, `dependency:${owner}`);
        for (const [name, hash] of before.rawFiles) if (now.rawFiles.get(name) !== hash) rawReason = firstReason(rawReason, `raw-file:${name}`);
        for (const [key, q] of before.queries) if (now.queries.get(key)?.hash !== q.hash && (queryId === undefined || key < queryId)) {
          queryId = key; queryReason = `query:${q.spec.kind}(${q.spec.args.join(",")})`;
        }
      }
      for (const child of children) {
        dependencyReason = firstReason(dependencyReason, child.dependencyReason);
        rawReason = firstReason(rawReason, child.rawReason);
        if (child.queryId !== undefined && (queryId === undefined || child.queryId < queryId)) {
          queryId = child.queryId; queryReason = child.queryReason;
        }
      }
      const result = {hash: hashV3(["gogen-dependency-component-4", nodes.map(([id, n]) => [id, n.hash]),
        children.map((c) => c.hash).sort()]), dependencyReason, rawReason, queryReason, queryId};
      memo.set(number, result); return result;
    } catch (error) { memo.set(number, {error: error.message}); throw error; }
  };
  const compute = (graph, root, value, {current = false} = {}) => {
    try {
      const state = stateOf(graph);
      if (sealed.has(graph)) { ownedStates.add(state); ownedGraphs.add(graph); }
      if (state.invalid[Number(current)]) throw new Error(state.invalid[Number(current)]);
      const roots = [...new Set([root, ...borrowedOwners(value)])];
      for (const id of roots) if (!graph.nodes[id]) throw new Error(`missing-artifact:${id}`);
      const groups = [...new Set(roots.map((id) => state.index.component.get(id)))].map((n) => groupValue(graph, n, current, state));
      if (!guards.has(value)) guards.set(value, hashV3(["gogen-replay-guards-3", replayGuards(value)]));
      const parts = {owner: graph.nodes[root].owner, name: value.name, components: groups.map((g) => g.hash).sort(),
        supplied: value.supplied ?? null, guards: guards.get(value)};
      const reason = groups.reduce((r, g) => firstReason(r, g.dependencyReason), undefined)
        ?? groups.reduce((r, g) => firstReason(r, g.rawReason), undefined)
        ?? groups.filter((g) => g.queryId !== undefined).sort((a, b) => a.queryId < b.queryId ? -1 : a.queryId > b.queryId ? 1 : 0)[0]?.queryReason;
      return {complete: true, key: hashV3(["gogen-entry-key-4", namespace, parts]), parts, reason};
    } catch (error) { return {complete: false, reason: error.message}; }
  };
  // Saved graph/SCC certificates are immutable. Current answers are strictly
  // program/round-local; resetting them must never retain a prior selection.
  const ownedStates = new Set();
  const originalStateOf = stateOf;
  compute.round = (next) => {
    evaluate = queryEvaluator(next); answers.clear(); currentIssues.clear();
    for (const state of ownedStates) {
      state.nodes[1].clear(); state.groups[1].clear(); state.observations[1].clear(); state.invalid[1] = undefined;
      // Only saved SCC hashes need to survive. Retaining every per-node query
      // map for every published round would multiply the large graph's memory.
      state.nodes[0].clear(); state.observations[0].clear();
    }
    // Row materializations expire at the boundary; saved SCC hashes survive.
    for (const graph of ownedGraphs) if (queryValues.has(graph)) queryValues.set(graph, [new WeakMap(), new WeakMap()]);
  };
  const ownedGraphs = new Set();
  compute.certificates = (graph) => {
    const state = originalStateOf(graph); ownedStates.add(state); ownedGraphs.add(graph);
    const certificates = state.index.members.map((_, n) => {
      try { return {hash: groupValue(graph, n, false, state).hash}; }
      catch (error) { return {error: error.message}; }
    });
    return state.invalid[0] ? certificates.map(() => ({error: state.invalid[0]})) : certificates;
  };
  compute.seed = (graph, certificates, unchanged, revision) => {
    const state = originalStateOf(graph); ownedStates.add(state); ownedGraphs.add(graph);
    if (certificates.length !== state.index.members.length) return;
    if (state.seedRevision === revision) return;
    state.seedRevision = revision;
    state.nodes[1].clear(); state.groups[1].clear(); currentIssues.clear(); answers.clear();
    if (queryValues.has(graph)) queryValues.get(graph)[1] = new WeakMap();
    certificates.forEach((value, n) => {
      state.groups[0].set(n, value);
      if (unchanged.has(n)) state.groups[1].set(n, value);
    });
  };
  return compute;
}

export function mismatchReason(saved, current) {
  return current.reason ?? "key-mismatch";
}

export function graphRawFiles(graph, reg) {
  const snapshot = inputSnapshot(reg);
  graph.rawFiles = Object.fromEntries([...snapshot.objects.values()].flatMap((e) => e.sources)
    .map((s) => [s.name, hashV3(["raw-file", s.name, s.raw])]));
  return graph;
}
