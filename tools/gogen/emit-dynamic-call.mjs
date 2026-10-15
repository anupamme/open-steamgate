import {append} from "./append.ts";
import {convert, defaultValue, Unsupported} from "./frontend.mjs";

// Resolve the declared result type before asking the ordinary MOVE converter.
// A missing conversion becomes an ABAP dynamic-call type error at dispatch.
/** @param {Iterable<import('./emit-go-types.ts').Class>} classes @param {string} method @param {import('./ir.ts').Type} target */
export function dynamicResultMoves(classes, method, target) {
  const moves = [];
  for (const cls of classes) for (const m of [...cls.methods, ...(cls.stubs ?? [])]) {
    if (!m.static || m.name !== method || !m.returning) continue;
    try {
      const value = convert({e: "var", name: "dyn_result", type: m.returning.type}, target);
      moves.push({key: `${cls.name}=>${m.name}`, type: m.returning.type, value});
    } catch (e) { if (!(e instanceof Unsupported)) throw e; }
  }
  return moves;
}

export function dynamicCallJs(st, ctx, t, classes, {expr, place, ident}) {
  const moves = st.receiving ? dynamicResultMoves(classes, st.method, st.receiving.target.type) : [];
  const call = `abap.CallStatic(s, ${expr(st.cls, ctx)}, ${JSON.stringify(st.method)}, {${st.args.map((a) => `${JSON.stringify(a.name)}: ${expr(a.value, ctx)}`).join(", ")}}, ${JSON.stringify(st.receiving?.name ?? "")}, ${JSON.stringify(moves.map((m) => m.key))})`;
  if (!st.receiving) return [`${t}${call};`];
  return [`${t}{`, `${t}  const [$dynKey, $dynValue] = ${call};`, `${t}  switch ($dynKey) {`,
    ...moves.flatMap((m) => [`${t}    case ${JSON.stringify(m.key)}:`, `${t}      ${place(st.receiving.target, ctx)} = ((${ident("dyn_result")}) => ${expr(m.value, ctx)})($dynValue); break;`]), `${t}  }`, `${t}}`];
}

/**
 * CALL METHOD (class)=>m, as emit-go's staticRegistry: every compiled class is
 * known by name, and each static method a dynamic call names gets an adapter
 * that reads its arguments out of generic data by name.
 */
export function staticRegistryJs(program, {definable, zero, unwrapTo, composite, expr, typeName}) {
  const wanted = program.dynStatics ?? new Set();
  if (wanted.size === 0) return [];
  const out = [`abap.knownClasses(${JSON.stringify(program.classes.map((c) => c.name))}, ${JSON.stringify([...(program.rtti?.known ?? [])].filter((n) => !n.includes("=>")))});`];
  for (const cls of program.classes) {
    for (const m of [...cls.methods, ...(cls.stubs ?? [])]) {
      if (!m.static || !wanted.has(m.name) || !m.params || !definable(program, m)) continue;
      const lines = [];
      const args = m.params.map((p, i) => {
        const v = `v${i}`;
        if (p.dir !== "importing") { lines.push(`  const ${v} = {v: ${zero(p.type)}};`); return v; }
        if (p.suppliedOf) { lines.push(`  const ${v} = ${JSON.stringify(p.suppliedOf)} in a ? "X" : "";`); return v; }
        const d = `a[${JSON.stringify(p.name)}]`;
        const read = ["i", "string", "c", "d", "t"].includes(p.type.k) ? unwrapTo(p.type, d)
          : p.type.k === "data" ? d : composite(p.type) && p.byValue ? `abap.copy(${d}.get())` : `${d}.get()`;
        const absent = p.default !== undefined ? expr(defaultValue(p, {reg: program.reg, program, className: cls.name}), {cls, method: m, loop: 0}) : p.optional ? zero(p.type)
          : `abap.paramMissing(${JSON.stringify(`${cls.name}=>${m.name} ${p.name}`)})`;
        lines.push(`  const ${v} = ${JSON.stringify(p.name)} in a ? ${read} : ${absent};`);
        return v;
      });
      append(out, [`abap.registerStatic(${JSON.stringify(`${cls.name}=>${m.name}`)}, ${JSON.stringify(m.params.filter((p) => p.dir === "importing").map((p) => p.name))}, ${JSON.stringify(m.returning?.name ?? "")}, (s, a) => {`], lines, [`  ${m.returning ? "return " : ""}${typeName(cls.name)}.${typeName(m.name)}(${["s", ...args].join(", ")});`, "});"]);
    }
  }
  out.push("");
  return out;
}
