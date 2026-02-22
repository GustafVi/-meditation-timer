<script>
  import { getSessions, saveSessions } from './lib/storage.js'
  import { recordToday } from './lib/dates.js'
  import {
    unlockAudio, createChimeElements, playIntervalChime,
    scheduleAllChimes, cancelScheduledChimes,
    startKeepAlive, stopKeepAlive, ensureAmbientPlaying,
    setupMediaSession, clearMediaSession,
  } from './lib/audio.js'
  import { computeTimerState } from './lib/timer.js'
  import { screenEnter, screenExit } from './lib/transitions.js'
  import SetupScreen from './components/SetupScreen.svelte'
  import TimerScreen from './components/TimerScreen.svelte'
  import CelebrationScreen from './components/CelebrationScreen.svelte'

  // ===== Cross-screen state =====
  let activeScreen = $state('setup')       // 'setup' | 'timer' | 'celebration'
  let totalSeconds = $state(600)           // default 10 min
  let intervals = $state([])
  let sessions = $state(getSessions())

  // Timer state
  let isRunning = $state(false)
  let sessionStartTime = $state(0)
  let pausedElapsed = $state(0)
  let lastChimedInterval = $state(-1)

  // Wake lock (not put in $state since it doesn't affect rendering)
  let wakeLock = null

  async function requestWakeLock() {
    if (!('wakeLock' in navigator)) return null
    try {
      const wl = await navigator.wakeLock.request('screen')
      wl.addEventListener('release', () => { wakeLock = null })
      return wl
    } catch {
      return null
    }
  }

  function releaseWakeLock() {
    if (wakeLock) { wakeLock.release(); wakeLock = null }
  }

  // ===== Chime scheduling effect =====
  // Runs when isRunning becomes true; cleanup runs when it becomes false.
  // All audio effects guard with the early return to avoid running on mount.
  $effect(() => {
    if (!isRunning) return
    scheduleAllChimes(intervals, totalSeconds, sessionStartTime, pausedElapsed)
    startKeepAlive()
    setupMediaSession(togglePause)
    return () => {
      cancelScheduledChimes()
      stopKeepAlive()
      clearMediaSession()
    }
  })

  // ===== Handlers =====

  /**
   * handleStart must be called synchronously from the Start button's onclick.
   * iOS requires Audio creation and unlock within a user gesture stack.
   */
  function handleStart() {
    unlockAudio()
    createChimeElements()         // must be in user gesture stack
    sessionStartTime = Date.now()
    pausedElapsed = 0
    lastChimedInterval = -1
    isRunning = true
    activeScreen = 'timer'
    requestWakeLock().then(wl => { wakeLock = wl })
  }

  function togglePause() {
    if (isRunning) {
      pausedElapsed += Date.now() - sessionStartTime
      isRunning = false
    } else {
      sessionStartTime = Date.now()
      isRunning = true
    }
  }

  function handleReset() {
    isRunning = false
    lastChimedInterval = -1
    cancelScheduledChimes()
    stopKeepAlive()
    clearMediaSession()
    releaseWakeLock()
    activeScreen = 'setup'
  }

  function completeSession() {
    isRunning = false
    cancelScheduledChimes()
    stopKeepAlive()
    clearMediaSession()
    releaseWakeLock()

    sessions++
    saveSessions(sessions)
    recordToday()

    setTimeout(() => {
      activeScreen = 'celebration'
    }, 600)
  }

  function handleContinue() {
    activeScreen = 'setup'
  }

  function handleUpdateTotal(secs) {
    // Trim intervals that no longer fit
    let allIntervals = [...intervals]
    let allocated = allIntervals.reduce((s, iv) => s + iv.seconds, 0)
    while (allocated > secs && allIntervals.length > 0) {
      allIntervals.pop()
      allocated = allIntervals.reduce((s, iv) => s + iv.seconds, 0)
    }
    intervals = allIntervals
    totalSeconds = secs
  }

  // ===== iOS screen wake recovery =====
  // When iOS suspends the page and the user wakes the screen,
  // setTimeout timers may have been delayed. Reschedule remaining chimes
  // and play any that were missed while the screen was locked.
  function handleVisibilityChange() {
    if (document.visibilityState === 'visible' && isRunning) {
      const state = computeTimerState(isRunning, sessionStartTime, pausedElapsed, totalSeconds, intervals)

      if (state.done) {
        completeSession()
        return
      }

      // Re-acquire wake lock if it was released while the page was hidden
      if (!wakeLock) requestWakeLock().then(wl => { wakeLock = wl })

      // Play missed interval chimes
      let accumulated = 0
      for (let i = 0; i < intervals.length; i++) {
        accumulated += intervals[i].seconds
        if (accumulated <= state.totalElapsed && i > lastChimedInterval) {
          if (i < intervals.length - 1) playIntervalChime()
          lastChimedInterval = i
        }
      }

      // Reschedule remaining chimes from current position
      scheduleAllChimes(intervals, totalSeconds, sessionStartTime, pausedElapsed)

      // Ensure ambient keep-alive is still playing
      ensureAmbientPlaying()
    }
  }
</script>

<svelte:document
  ontouchstart={unlockAudio}
  onclick={unlockAudio}
  onvisibilitychange={handleVisibilityChange}
/>

<div class="app">
  <header>
    <h1>Meditation Timer</h1>
  </header>
  <main>
    {#key activeScreen}
      {#if activeScreen === 'setup'}
        <div in:screenEnter out:screenExit>
          <SetupScreen
            {totalSeconds}
            {intervals}
            {sessions}
            onstart={handleStart}
            onupdatetotal={handleUpdateTotal}
            onaddinterval={(iv) => { intervals = [...intervals, iv] }}
            onremoveinterval={(i) => { intervals = intervals.filter((_, idx) => idx !== i) }}
          />
        </div>
      {:else if activeScreen === 'timer'}
        <div in:screenEnter out:screenExit>
          <TimerScreen
            {isRunning}
            {totalSeconds}
            {intervals}
            {sessionStartTime}
            {pausedElapsed}
            onpause={togglePause}
            onresume={togglePause}
            onreset={handleReset}
            oncomplete={completeSession}
          />
        </div>
      {:else}
        <div in:screenEnter out:screenExit>
          <CelebrationScreen oncontinue={handleContinue} />
        </div>
      {/if}
    {/key}
  </main>
</div>

<p class="version-label">v4.2</p>
