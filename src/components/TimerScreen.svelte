<script>
  import { CIRCUMFERENCE, formatTime } from '../lib/constants.js'
  import { computeTimerState } from '../lib/timer.js'

  let {
    isRunning,
    totalSeconds,
    intervals,
    sessionStartTime,
    pausedElapsed,
    onpause,
    onresume,
    onreset,
    oncomplete,
  } = $props()

  // Compute initial display state immediately (isRunning is true when this mounts)
  let displayState = $state(
    computeTimerState(isRunning, sessionStartTime, pausedElapsed, totalSeconds, intervals)
  )

  // RAF-based timer loop (not setInterval — avoids drift and pairs cleanly with Svelte)
  $effect(() => {
    if (!isRunning) return
    let rafId
    function frame() {
      displayState = computeTimerState(isRunning, sessionStartTime, pausedElapsed, totalSeconds, intervals)
      if (displayState.done) {
        oncomplete()
        return
      }
      rafId = requestAnimationFrame(frame)
    }
    rafId = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(rafId)
  })
</script>

<p class="interval-indicator">
  Interval {displayState ? displayState.idx + 1 : 1} of {intervals.length}
</p>
<p class="interval-name">
  {displayState ? (intervals[displayState.idx]?.label || '') : ''}
</p>

<div class="timer-display" class:active={isRunning}>
  <svg class="progress-ring" viewBox="0 0 200 200">
    <defs>
      <linearGradient id="ring-gradient" x1="0" y1="0" x2="200" y2="200" gradientUnits="userSpaceOnUse">
        <stop offset="0%"   stop-color="#7c5abf"/>
        <stop offset="100%" stop-color="#c8a8f0"/>
      </linearGradient>
    </defs>
    <circle class="progress-ring__bg" cx="100" cy="100" r="90" />
    {#if displayState}
      {@const iv = intervals[displayState.idx]}
      {@const remainInInterval = iv.seconds - displayState.elapsedInInterval}
      {@const fraction = Math.max(remainInInterval / iv.seconds, 0)}
      <circle
        class="progress-ring__circle"
        cx="100" cy="100" r="90"
        stroke-dasharray={CIRCUMFERENCE}
        stroke-dashoffset={CIRCUMFERENCE * (1 - fraction)}
      />
    {:else}
      <circle
        class="progress-ring__circle"
        cx="100" cy="100" r="90"
        stroke-dasharray={CIRCUMFERENCE}
        stroke-dashoffset={0}
      />
    {/if}
  </svg>
  <span id="timer-text">
    {#if displayState}
      {@const iv = intervals[displayState.idx]}
      {@const remainInInterval = iv.seconds - displayState.elapsedInInterval}
      {formatTime(Math.max(remainInInterval, 0))}
    {:else}
      00:00
    {/if}
  </span>
</div>

<div class="overall-progress-wrap">
  <div class="overall-progress-bar">
    <div
      class="overall-progress-fill"
      style:width="{displayState ? Math.min((displayState.totalElapsed / totalSeconds) * 100, 100) : 0}%"
    ></div>
  </div>
  <span class="overall-time">
    {formatTime(displayState ? totalSeconds - displayState.totalElapsed : totalSeconds)}
  </span>
</div>

<div class="interval-timeline">
  {#each intervals as iv, i}
    <span
      class="timeline-chip"
      class:active={displayState && i === displayState.idx}
      class:done={displayState && i < displayState.idx}
    >
      {iv.label || `#${i + 1} ${formatTime(iv.seconds)}`}
    </span>
  {/each}
</div>

<div class="controls">
  <button class="control-btn primary" onclick={isRunning ? onpause : onresume}>
    {isRunning ? 'Pause' : 'Resume'}
  </button>
  <button class="control-btn secondary" onclick={onreset}>Reset</button>
</div>
