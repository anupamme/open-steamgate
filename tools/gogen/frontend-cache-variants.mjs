// Program-selection variants share a global content generation. Losing a
// racing index update is a miss; entries and indexes always publish atomically.
import {readFileSync, writeFileSync, renameSync, rmSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {replayLowering} from "./frontend-replay.mjs";
const LIMIT = 4;
const reads = (value) => value.replay?.ops.filter((op) => op.kind === "read" && op.key === "caught" && op.method === "get") ?? [];
export function projectionMatches(value, program) {
  try { return replayLowering(program, {ops: reads(value), written: []}); }
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
