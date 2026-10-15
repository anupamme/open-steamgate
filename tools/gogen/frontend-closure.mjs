import {compileProgram} from "./frontend.mjs";

// Close lowering-time and superclass dependencies without host-specific class
// lists. Explicit inputs keep their requested syntax policy. Dependencies may
// contain unsupported library definitions; retain their diagnostics/refusals
// without rejecting an otherwise valid report or repeatedly selecting them.
/** @param {Parameters<typeof compileProgram>[0]} options @returns {ReturnType<typeof compileProgram>} */
export function compileClosedProgram(options) {
  let program = compileProgram(options);
  const selected = new Set(program.wanted);
  for (;;) {
    const supers = [...selected].map(n => program.reg.getObject("CLAS", n)?.getDefinition()?.getSuperClass()?.toUpperCase()).filter(Boolean);
    const more = [...program.missing, ...supers].filter(n => !selected.has(n) && program.reg.getObject("CLAS", n));
    if (!more.length) return program;
    more.forEach(n => selected.add(n));
    program = compileProgram({...options, registry: program.reg, objects: [...selected], tolerant: true});
  }
}
