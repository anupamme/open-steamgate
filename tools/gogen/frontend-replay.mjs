import {definitionFingerprint} from "./frontend-artifact-digests.mjs";
import {isCaughtIndex} from "./frontend-hierarchy.mjs";
// Record the program inputs a lowering actually reads and its ordered effects.
// Registry/file identity is guarded by the enclosing immutable session.
const context = new Set(["currentClass", "currentOwner", "currentTypes"]);
const ignored = new Set(["reg", "frontendCounts"]);
// Definitions borrow their owning artifact's resolved semantics as well as location.
const definitions = new Set(["ClassDefinition", "InterfaceDefinition"]);
const definition = (v) => v && typeof v === "object" && definitions.has(v.constructor?.name)
  && typeof v.getName === "function" && typeof v.getFilename === "function" && typeof v.getStart === "function";
// Cache recording must stay bounded even for a generated class with thousands
// of repeated reads. Exceeding a budget refuses reuse; it never truncates guards.
const MAX_VALUES = 65536, MAX_FINGERPRINT_CHARS = 1 << 20;
const MAX_OPS = 65536, MAX_TRANSCRIPT_CHARS = 1 << 24;
function fingerprint(value, registry) {
  const kind = typeof value;
  if (value === undefined) return undefined;
  if (value === null || kind === "boolean") return value === null ? "null" : value ? "true" : "false";
  if (kind === "number" || kind === "string") {
    if (kind === "string" && value.length > MAX_FINGERPRINT_CHARS) throw new RangeError("replay fingerprint budget");
    const encoded = JSON.stringify(value);
    if (encoded.length > MAX_FINGERPRINT_CHARS) throw new RangeError("replay fingerprint budget");
    return encoded;
  }
  let values = 0, characters = 0;
  const fault = process.env.GOGEN_CACHE_ORACLE_FAULT;
  const locationOnly = fault === "fingerprint-location-only" || fault === "no-version,fingerprint-location-only";
  const encoded = JSON.stringify(value, (_, v) => {
    if (++values > MAX_VALUES || (typeof v === "string" && (characters += v.length) > MAX_FINGERPRINT_CHARS)
        || ((v instanceof Map || v instanceof Set) && v.size > MAX_VALUES / 2)
        || (Array.isArray(v) && v.length > MAX_VALUES)) throw new RangeError("replay fingerprint budget");
    return v instanceof Map ? {map: [...v]} : v instanceof Set ? {set: [...v]}
      : definition(v) ? locationOnly
        ? {definition: [v.constructor.name, v.getName(), v.getFilename(), v.getStart().getRow(), v.getStart().getCol()]}
        : definitionFingerprint(registry, v) : v;
  });
  if (encoded?.length > MAX_FINGERPRINT_CHARS) throw new RangeError("replay fingerprint budget");
  return encoded;
}
const clone = (v) => isCaughtIndex(v) ? v : v instanceof Map ? new Map(v) : v instanceof Set ? new Set(v) : Array.isArray(v) ? [...v] : v;
export function copyReplayProgram(program) {
  return Object.fromEntries(Object.entries(program).map(([k, v]) => [k, clone(v)]));
}

export function replayLowering(program, cached, refused = () => {}) {
  if (!cached) return false;
  const trial = {...program}, copied = new Set();
  try {
    for (const op of cached.ops) {
      if (op.kind === "measure") {
        if (trial[op.key]?.[op.method] !== op.value) { refused({reason: "replay-measure", key: op.key, method: op.method, expected: op.value, actual: trial[op.key]?.[op.method]}); return false; }
      } else if (op.kind === "read") {
        const value = op.method ? trial[op.key]?.[op.method](...op.args) : trial[op.key];
        const actual = fingerprint(value, program.reg);
        if (actual !== op.value) { refused({reason: "replay-read", key: op.key, method: op.method, args: op.args, expected: op.value, actual}); return false; }
      } else if (op.kind === "assign") { trial[op.key] = clone(op.value); copied.add(op.key); }
      else {
        if (!copied.has(op.key)) { trial[op.key] = clone(trial[op.key]); copied.add(op.key); }
        trial[op.key][op.method](...op.args);
      }
    }
  } catch (error) { refused({reason: "replay-error", message: error.message}); return false; }
  for (const key of cached.written) program[key] = trial[key];
  return true;
}

export function recordLowering(program, lower) {
  const ops = [], written = new Set(), borrowed = new Map(), seen = new Map();
  let safe = true, characters = 0, refusal;
  const refuse = (reason = "mutated-borrow") => { refusal ??= reason; safe = false; ops.length = 0; borrowed.clear(); seen.clear(); };
  const append = (op) => {
    if (!safe) return;
    // Compact before applying bounds. Repeated reads still fingerprint their
    // values, so aliases changed and restored between reads remain unsafe.
    if (op.kind === "assign" || op.kind === "effect") seen.delete(op.key);
    else if ((op.args ?? []).every((a) => a === null || ["undefined", "string", "number", "boolean"].includes(typeof a))) {
      if (!seen.has(op.key)) seen.set(op.key, new Map());
      // JSON alone aliases undefined/nonfinite numbers with null, and -0 with 0.
      const args = op.args?.map((a) => [typeof a, Object.is(a, -0) ? "-0" : String(a)]);
      const reads = seen.get(op.key), id = JSON.stringify([op.kind, op.method, args]);
      if (!reads.has(id)) reads.set(id, new Set());
      if (reads.get(id).has(op.value)) return;
      reads.get(id).add(op.value);
    }
    characters += typeof op.value === "string" ? op.value.length : 0;
    for (const arg of op.args ?? []) if (typeof arg === "string") characters += arg.length;
    if (ops.length >= MAX_OPS || characters > MAX_TRANSCRIPT_CHARS) { refuse("transcript-budget"); return; }
    ops.push(op);
  };
  const read = (key, method, args, value) => {
    if (!safe) return value;
    try {
      const encoded = fingerprint(value, program.reg);
      append({kind: "read", key, method, args, value: encoded});
      if (!safe) return value;
      if (value && typeof value === "object") {
        if (!borrowed.has(value)) borrowed.set(value, encoded);
        else if (borrowed.get(value) !== encoded) refuse();
      }
    } catch (error) { refuse(`fingerprint:${error.message}`); }
    return value;
  };
  const wrappers = new Map();
  const proxy = new Proxy(program, {
    get(target, key) {
      const value = target[key];
      if (ignored.has(key) || context.has(key)) return value;
      // Event registration examines previously emitted classes. Retry it.
      if (key === "classes") { refuse("classes-read"); return value; }
      if (value instanceof Map || value instanceof Set || Array.isArray(value)) {
        if (!wrappers.has(value)) wrappers.set(value, new Proxy(value, {
          get(collection, method) {
            if (method === "size" || method === "length") {
              append({kind: "measure", key, method, value: collection[method]});
              return collection[method];
            }
            if (["get", "has"].includes(method)) return (...args) => read(key, method, args, collection[method](...args));
            if (["set", "add", "delete", "clear", "push"].includes(method)) return (...args) => {
              written.add(key); append({kind: "effect", key, method, args});
              const result = collection[method](...args);
              return result === collection ? wrappers.get(collection) : result;
            };
            // Iteration/order is an input too; guard the complete collection.
            read(key, undefined, [], collection);
            const member = collection[method];
            return typeof member === "function" ? member.bind(collection) : member;
          },
        }));
        return wrappers.get(value);
      }
      return read(key, undefined, [], value);
    },
    set(target, key, value) {
      // Assignment expressions return the raw RHS: a following .set/.add
      // would bypass the collection proxy and leave an incomplete transcript.
      // Current-class context is restored separately by compileClass.
      if (!ignored.has(key) && !context.has(key)
          && (value instanceof Map || value instanceof Set || value instanceof WeakMap
            || value instanceof WeakSet || Array.isArray(value))) refuse("collection-assignment");
      target[key] = value;
      if (!ignored.has(key)) { written.add(key); append({kind: "assign", key, value: clone(value)}); }
      return true;
    },
  });
  const ir = lower(proxy);
  // Nested changes cannot be represented by collection effects. Retry those
  // lowerings, rather than replaying an incomplete mutation transcript.
  try { for (const [v, encoded] of borrowed) if (fingerprint(v, program.reg) !== encoded) { refuse(); break; } }
  catch { refuse(); }
  return {ir, refusal, replay: safe ? {ops, written} : undefined};
}
