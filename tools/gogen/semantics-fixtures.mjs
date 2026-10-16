import {DYNAMIC_EXPECT, checkDynamicCallOracle} from "./dynamic-call-oracle.mjs";
import {FIND_SUBSTRING_EXPECT, checkFindSubstringOracle} from "./find-substring-oracle.mjs";
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

export {compileClosedProgram as compileSemantics} from "./frontend-closure.mjs";

export const SEMANTICS_ORACLE_EXPECT = {...DYNAMIC_EXPECT, ...FIND_SUBSTRING_EXPECT};
export async function checkSemanticsOracles(selected, home, core, fixtures) {
  await checkDynamicCallOracle(selected, home, core, fixtures);
  await checkFindSubstringOracle(selected, home, core, fixtures);
}
