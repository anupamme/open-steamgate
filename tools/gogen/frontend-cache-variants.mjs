// Exact derived-read variants share a global content generation. Losing a
// racing index update is a miss; entries and indexes always publish atomically.
import {readFileSync, writeFileSync, renameSync, rmSync} from "node:fs";
import {createHash, randomUUID} from "node:crypto";
const LIMIT = 4;
const reads = (value) => value.replay?.ops.filter((op) => op.kind === "read" && op.key === "caught" && op.method === "get") ?? [];
export function projectionVariant(value) {
  const rows = reads(value).map((op) => JSON.stringify([op.args, op.value])).sort();
  return rows.length ? createHash("sha256").update(JSON.stringify(["caught-variant-1", rows])).digest("hex") : "";
}
export function projectionMatches(value, program) {
  try { return reads(value).every((op) => JSON.stringify(program.caught?.get(...op.args)) === op.value); }
  catch { return false; }
}
export function readVariants(file) {
  try {
    const rows = JSON.parse(readFileSync(file, "utf8"));
    return Array.isArray(rows) && rows.length <= LIMIT && rows.every((key) => typeof key === "string" && /^[0-9a-f]{64}$/.test(key)) ? rows : [];
  } catch { return []; }
}
export function rememberVariant(file, variant) {
  if (!variant) return;
  const temporary = `${file}.${randomUUID()}.pending`;
  try {
    writeFileSync(temporary, JSON.stringify([variant, ...readVariants(file).filter((key) => key !== variant)].slice(0, LIMIT)));
    renameSync(temporary, file);
  } catch { /* Cache availability must not affect compilation. */ }
  finally { try { rmSync(temporary, {force: true}); } catch { /* Unavailable directory. */ } }
}
