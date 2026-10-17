// Runtime-only opt-in counters; importing the compiler performs no host action.
let current;
export function frontendRound() { return current?.round ?? 1; }
export function timingEnabled() {
  return process.env.OSABAP_TIMING === "1" || !!process.env.GOGEN_CACHE_DIAGNOSTICS;
}
export function beginFrontendRound(round = 1) {
  current = {round, enabled: timingEnabled(), phases: new Map(), active: new Set()};
}
export function timedFrontend(phase, run) {
  if (!current?.enabled || current.active.has(phase)) return run();
  const state = current, start = performance.now(); state.active.add(phase);
  try { return run(); }
  finally {
    state.active.delete(phase);
    state.phases.set(phase, (state.phases.get(phase) ?? 0) + performance.now() - start);
  }
}
export function finishFrontendRound() {
  if (!current?.enabled) return [];
  const rows = ["graphLoading", "certificateValidation", "observation", "replay", "finalization"]
    .map((phase) => ({phase, round: current.round, ms: Math.round(current.phases.get(phase) ?? 0)}));
  if (process.env.OSABAP_TIMING === "1") for (const row of rows)
    console.error(`OSABAP_TIMING ${JSON.stringify(row)}`);
  return rows;
}
