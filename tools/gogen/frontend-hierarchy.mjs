import {semanticQuery, withRole, provenanceGraph} from "./frontend-provenance.mjs";
// Every CATCH asks isSubclass of every wanted class (caughtClasses), so the
// superclass chains are walked lazily once per owner -- the program, or while
// a lowering is recorded its tracking proxy: the first walk in each recording
// still makes the reads a transcript and a cache key need, and later walks
// would only repeat them. A chain is extended exactly as far as the loop it
// replaces would have gone, 20 steps at most; step(c) names c's superclass.
/** @type {WeakMap<object, Map<string, import("./frontend-cache-types.ts").ChainEntry>>} */ const CHAINS = new WeakMap(), /** @type {WeakMap<object, Map<string, import("./frontend-cache-types.ts").CaughtEntry>>} */ CAUGHT = new WeakMap();
/** @template T @param {WeakMap<object, Map<string, T>>} map @param {object} owner @returns {Map<string, T>} */ const memo = (map, owner) => map.get(owner) ?? map.set(owner, new Map()).get(owner);

/** @param {object} owner @param {import("./frontend-session-types.ts").Registry} reg @param {string | null | undefined} cls @param {string} ancestor @param {(name: string) => string | null | undefined} step @returns {boolean} */ export function chainHas(owner, reg, cls, ancestor, step) {
  if (!cls) return false;
  const chains = memo(CHAINS, owner);
  if (!chains.has(cls)) chains.set(cls, {reg, chain: [cls], done: false});
  const entry = chains.get(cls);
  if (entry.reg !== reg) {
    for (let c = cls, guard = 0; c && guard < 20; guard += 1) {
      if (c === ancestor) return true;
      c = step(c);
    }
    return false;
  }
  for (let i = 0; i < 20; i += 1) {
    if (i >= entry.chain.length) return false;
    const c = entry.chain[i];
    if (c === ancestor) return true;
    if (i + 1 === entry.chain.length && !entry.done) {
      const next = step(c);
      if (next) entry.chain.push(next); else entry.done = true;
    }
  }
  return false;
}

// Iterating wanted is a whole-collection read (encoded in full while a
// lowering is recorded), once per CATCH. wanted only ever grows, so its size
// tells whether a previous answer for the same names still holds.
/** @param {{wanted: ReadonlySet<string>, caught?: Map<string, readonly string[]>}} program @param {readonly string[]} names @param {() => string[]} compute @returns {string[]} */ export function caughtOnce(program, names, compute) {
  if (program.caught) return [...program.caught.get(JSON.stringify(names)) ?? []];
  const known = memo(CAUGHT, program), key = names.join(","), size = program.wanted.size;
  if (known.get(key)?.size !== size) known.set(key, {size, own: compute()});
  return [...known.get(key).own];
}

const caughtIndexes = new WeakMap();
/** @param {unknown} value @returns {boolean} */ export const isCaughtIndex = (value) => caughtIndexes.has(value);
// Rebuild the current selection's hierarchy before the class seam. A CATCH
// consumes the sorted matching names, not unrelated selected classes or their
// implementation bytes. The old walk also tests at most twenty chain members.
/** @param {import('./frontend-session-types.ts').Registry} reg @param {ReadonlySet<string>} wanted @param {(name: string) => string | null | undefined} step @returns {Map<string, readonly string[]>} */ export function caughtIndex(reg, wanted, step) {
  const descendants = new Map(), providers = new Set();
  withRole("scheduling", () => {
    for (const name of wanted) {
      for (let at = name, i = 0; at && i < 20; i++) {
        if (!descendants.has(at)) descendants.set(at, new Set());
        descendants.get(at).add(name);
        providers.add(`CLAS ${at.split(":")[0]}`);
        at = step(at);
      }
    }
  });
  let epoch, complete;
  const safe = () => {
    const trace = provenanceGraph(reg);
    if (!trace) return true;
    if (trace.unknownVersion === epoch) return complete;
    const unknown = (entry) => [...entry?.queries.values() ?? []].some((q) => q.role === "artifact" && q.kind === "unknown-scan");
    epoch = trace.unknownVersion;
    return complete = !unknown(trace.global) && ![...providers].some((owner) => unknown(trace.artifacts.get(owner)));
  };
  const values = new Map();
  const answer = (names) => Object.freeze([...new Set(names.flatMap((n) => [...descendants.get(n) ?? []]))].sort());
  const lookup = (key) => {
    if (!values.has(key)) values.set(key, answer(JSON.parse(key)));
    return values.get(key);
  };
  const index = new Map();
  index.get = (key) => {
    const result = lookup(key);
    semanticQuery(reg, "caught", JSON.parse(key), result, {providers: [], complete: safe(), policy: "selected-subclasses"});
    return result;
  };
  for (const method of ["set", "delete", "clear"]) Object.defineProperty(index, method, {value: () => { throw new TypeError("read-only caught index"); }});
  caughtIndexes.set(index, {lookup, safe});
  return index;
}

/** @param {Map<string, readonly string[]> | undefined} index @param {readonly string[]} names @returns {{result: readonly string[], providers: string[], complete: boolean}} */ export function currentCaughtAnswer(index, names) {
  const state = caughtIndexes.get(index);
  if (!state) throw new Error("caught index unavailable");
  return {result: state.lookup(JSON.stringify(names)), providers: [], complete: state.safe()};
}
