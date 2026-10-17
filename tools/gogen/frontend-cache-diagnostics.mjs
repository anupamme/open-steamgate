// Explicit opt-in NDJSON; diagnostics never participate in cache decisions.
import {appendFileSync} from "node:fs";
import {frontendRound} from "./frontend-timing.mjs";
export function cacheDiagnostic(row) {
  const path = process.env.GOGEN_CACHE_DIAGNOSTICS;
  if (!path) return;
  try { appendFileSync(path, JSON.stringify({pid: process.pid, round: frontendRound(), elapsedMs: Math.round(performance.now()), ...row}) + "\n"); }
  catch { /* Unavailable diagnostics must not change compilation. */ }
}

// Optional explanations survive processes and closure rounds. This file is
// diagnostic only: losing a concurrent update cannot affect a cache decision.
import {mkdirSync, readFileSync, renameSync, rmSync, writeFileSync} from "node:fs";
import {join} from "node:path";
import {randomUUID} from "node:crypto";
export function diagnosticCache(root, components) {
  if (!process.env.GOGEN_CACHE_DIAGNOSTICS) return;
  const file = join(root, "diagnostics.json"), entries = new Map();
  let previous;
  try { previous = JSON.parse(readFileSync(file, "utf8")); } catch { /* First diagnostic run. */ }
  const changed = Object.keys(components).filter((k) => previous?.components?.[k] !== components[k]);
  return {
    miss(owner, name) {
      if (!previous) return {reason: "no-entry"};
      if (changed.length) return {reason: "key-components", components: changed};
      const reason = previous.entries?.[`${owner}:${name}`];
      return {reason: !reason ? "no-entry" : reason === "stored" ? "entry-unavailable-or-selection" : `not-stored:${reason}`};
    },
    remember(owner, name, reason) { entries.set(`${owner}:${name}`, reason); },
    finish() {
      const temp = `${file}.${randomUUID()}.pending`;
      try {
        mkdirSync(root, {recursive: true});
        writeFileSync(temp, JSON.stringify({components, entries: {...previous?.entries, ...Object.fromEntries(entries)}}));
        renameSync(temp, file);
      } catch { /* Diagnostic availability must not affect compilation. */ }
      finally { try { rmSync(temp, {force: true}); } catch { /* Unavailable root. */ } }
    },
  };
}
