// Shared explicit opt-in for report and ABAP Unit frontend rebuilds.
import {join, resolve} from "node:path";
export function frontendCacheDir(home, env = process.env) {
  const value = env.OSD_GOGEN_CACHE;
  if (!value) return undefined;
  return value === "1"
    ? join(resolve(env.OSD_RUN_CACHE || join(home, ".local", "osd-run")), "frontend")
    : resolve(value);
}

// Runner opt-in may replay complete v3 dependency closures after a global
// miss. Expanded provenance reporting remains a separate explicit request.
export function runnerCacheOptions(home, env = process.env) {
  const cacheDir = frontendCacheDir(home, env);
  return cacheDir ? {cacheDir, provenance: env.GOGEN_PROVENANCE === "1", dependencyCache: true} : {};
}
