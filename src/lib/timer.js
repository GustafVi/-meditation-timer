/**
 * Pure function — no Svelte dependency.
 * Computes current timer state from raw timestamps.
 * Safe to call in RAF loops; uses Date.now() for drift-free timing.
 */
export function computeTimerState(isRunning, sessionStartTime, pausedElapsed, totalSeconds, intervals) {
  const elapsedMs = isRunning
    ? (pausedElapsed + (Date.now() - sessionStartTime))
    : pausedElapsed
  const totalElapsed = Math.min(Math.floor(elapsedMs / 1000), totalSeconds)
  let accumulated = 0
  let idx = 0
  for (idx = 0; idx < intervals.length; idx++) {
    if (accumulated + intervals[idx].seconds > totalElapsed) break
    accumulated += intervals[idx].seconds
  }
  const done = totalElapsed >= totalSeconds
  if (done) idx = intervals.length - 1
  return { totalElapsed, idx, elapsedInInterval: totalElapsed - accumulated, done }
}
