import {compileProgram} from "./frontend.mjs";
import {existsSync, readFileSync, readdirSync} from "node:fs";
import {join} from "node:path";

// Keep copied demo fixtures aligned with the checkout used for measurement.
export function checkDemoCopies(here, home) {
  const demoCopies = readdirSync(join(here, "testdata")).filter((f) => /^zcl_osd_demo_\w+\.clas\.abap$/.test(f)).sort();
  const demoDrift = [];
  for (const f of demoCopies) {
    const theirs = join(home, "src", "demo_data", f);
    if (!existsSync(theirs)) { console.log(`skip copy check ${f}: not in ${home}/src/demo_data`); continue; }
    if (readFileSync(theirs, "utf8") !== readFileSync(join(here, "testdata", f), "utf8")) demoDrift.push(f);
  }
  return demoDrift;
}

// Exercise the same missing-class and superclass closure as the unit hosts,
// without selecting runtime exception classes by name in the fixture roots.
export function compileSemantics(options) {
  let program = compileProgram(options);
  for (;;) {
    const supers = [...program.wanted].map(n => program.reg.getObject("CLAS", n)?.getDefinition()?.getSuperClass()?.toUpperCase()).filter(Boolean);
    const more = [...program.missing, ...supers].filter(n => !program.wanted.has(n) && program.reg.getObject("CLAS", n));
    if (!more.length) return program;
    program = compileProgram({...options, folders: [], registry: program.reg, objects: [...program.wanted, ...more]});
  }
}
