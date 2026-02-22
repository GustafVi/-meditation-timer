<script>
  import { BUILTIN_PRESETS, SEGMENT_COLORS, formatTime } from '../lib/constants.js'
  import { getUserPresets, saveUserPresets, lsGet, lsSet } from '../lib/storage.js'
  import {
    computeStreak, computeBestStreak, getTodayCount, getCalendarData
  } from '../lib/dates.js'

  let {
    totalSeconds,
    intervals,
    sessions,
    onstart,
    onupdatetotal,
    onaddinterval,
    onremoveinterval,
  } = $props()

  // ===== Local state =====
  let totalMinutesValue = $state(totalSeconds / 60)
  let intervalMinutes = $state('')
  let intervalSeconds = $state('')
  let intervalLabel = $state('')
  let errorMessage = $state('')
  let activePresetId = $state(null)
  let userPresets = $state(getUserPresets())

  // ===== Collapsible section state =====
  let presetsCollapsed = $state(lsGet('collapsed_presets', 'false') === 'true')
  let durationCollapsed = $state(lsGet('collapsed_duration', 'false') === 'true')
  let intervalsCollapsed = $state(lsGet('collapsed_intervals', 'false') === 'true')

  function togglePresets() {
    presetsCollapsed = !presetsCollapsed
    lsSet('collapsed_presets', String(presetsCollapsed))
  }
  function toggleDuration() {
    durationCollapsed = !durationCollapsed
    lsSet('collapsed_duration', String(durationCollapsed))
  }
  function toggleIntervals() {
    intervalsCollapsed = !intervalsCollapsed
    lsSet('collapsed_intervals', String(intervalsCollapsed))
  }

  // ===== Derived =====
  const allocated = $derived(intervals.reduce((s, iv) => s + iv.seconds, 0))
  const remaining = $derived(totalSeconds - allocated)
  const canStart = $derived(remaining === 0 && intervals.length > 0)

  // Keep totalMinutesValue in sync if totalSeconds changes from parent
  $effect(() => {
    totalMinutesValue = totalSeconds / 60
  })

  // ===== Streak / calendar (read once on mount — SetupScreen remounts each visit) =====
  const streak = computeStreak()
  const bestStreak = Math.max(computeBestStreak(), streak)
  const todayCount = getTodayCount()
  const calendarDays = getCalendarData()

  const weatherState = todayCount === 0 ? 'storm' : todayCount === 1 ? 'cloudy' : 'sunny'

  // ===== Handlers =====
  function handleTotalMinutesInput(e) {
    const val = parseInt(e.target.value, 10)
    if (!val || val < 1) return
    totalMinutesValue = val
    onupdatetotal(val * 60)
  }

  function handleTotalMinutesBlur(e) {
    const val = parseInt(e.target.value, 10)
    if (!val || val < 1) {
      const fallback = Math.max(Math.ceil(allocated / 60), 1)
      totalMinutesValue = fallback
      onupdatetotal(fallback * 60)
    }
  }

  function addInterval() {
    const mins = parseInt(intervalMinutes, 10) || 0
    const secs = parseInt(intervalSeconds, 10) || 0
    const totalSec = mins * 60 + secs
    if (totalSec <= 0) {
      errorMessage = 'Enter a duration greater than 0.'
      return
    }
    if (totalSec > remaining) {
      errorMessage = `Only ${formatTime(remaining)} remaining to allocate.`
      return
    }
    const label = intervalLabel.trim()
    onaddinterval({ seconds: totalSec, label })
    intervalMinutes = ''
    intervalSeconds = ''
    intervalLabel = ''
    errorMessage = ''
    activePresetId = null
  }

  function handleAddClick(e) {
    e.stopPropagation()
    if (intervalsCollapsed) {
      intervalsCollapsed = false
      lsSet('collapsed_intervals', 'false')
      return
    }
    addInterval()
  }

  function handleKeydown(e) {
    if (e.key === 'Enter') addInterval()
  }

  function loadPreset(preset) {
    onupdatetotal(preset.totalMinutes * 60)
    // Replace all intervals via parent: remove all, then add each
    // We pass the full new intervals array via a synthetic approach
    // by updating totalSeconds and intervals together
    for (let i = intervals.length - 1; i >= 0; i--) onremoveinterval(i)
    preset.intervals.forEach(iv => onaddinterval({ ...iv }))
    errorMessage = ''
    activePresetId = preset.id
  }

  function saveCurrentAsPreset() {
    if (intervals.length === 0 || remaining !== 0) return
    const name = prompt('Name this preset:')
    if (!name || !name.trim()) return
    const newPreset = {
      id: `user-${Date.now()}`,
      name: name.trim(),
      builtin: false,
      totalMinutes: totalSeconds / 60,
      intervals: intervals.map(iv => ({ ...iv })),
    }
    userPresets = [...userPresets, newPreset]
    saveUserPresets(userPresets)
    activePresetId = newPreset.id
  }

  function deleteUserPreset(id) {
    userPresets = userPresets.filter(p => p.id !== id)
    saveUserPresets(userPresets)
    if (activePresetId === id) activePresetId = null
  }

  const allPresets = $derived([...BUILTIN_PRESETS, ...userPresets])
</script>

<!-- ===== PRESETS ===== -->
<section class="setup-section">
  <div class="section-header" role="button" tabindex="0" onclick={togglePresets} onkeydown={(e) => e.key === 'Enter' && togglePresets()}>
    <span class="section-chevron" class:collapsed={presetsCollapsed}>▾</span>
    <h2 class="section-label">Presets</h2>
    <button
      class="save-preset-btn"
      title="Save current config as preset"
      disabled={intervals.length === 0 || remaining !== 0}
      onclick={(e) => { e.stopPropagation(); saveCurrentAsPreset() }}
    >+ Save</button>
  </div>
  <div class="section-body" class:collapsed={presetsCollapsed}>
    <div class="preset-list">
      {#each allPresets as preset (preset.id)}
        <div
          class="preset-chip"
          class:builtin={preset.builtin}
          class:active={preset.id === activePresetId}
          onclick={() => loadPreset(preset)}
          role="button"
          tabindex="0"
          onkeydown={(e) => e.key === 'Enter' && loadPreset(preset)}
        >
          <span class="preset-chip__name">{preset.name}</span>
          <span class="preset-chip__meta">{preset.totalMinutes}m · {preset.intervals.length}</span>
          {#if !preset.builtin}
            <button
              class="preset-chip__delete"
              title="Delete preset"
              onclick={(e) => { e.stopPropagation(); deleteUserPreset(preset.id) }}
            >×</button>
          {/if}
        </div>
      {/each}
    </div>
  </div>
</section>

<!-- ===== TOTAL DURATION ===== -->
<section class="setup-section">
  <div class="section-header" role="button" tabindex="0" onclick={toggleDuration} onkeydown={(e) => e.key === 'Enter' && toggleDuration()}>
    <span class="section-chevron" class:collapsed={durationCollapsed}>▾</span>
    <h2 class="section-label">Total Duration</h2>
  </div>
  <div class="section-body" class:collapsed={durationCollapsed}>
    <label for="total-minutes" class="duration-field-label">Minutes</label>
    <input
      type="number"
      id="total-minutes"
      min="1"
      max="180"
      value={totalMinutesValue}
      class="duration-input"
      oninput={handleTotalMinutesInput}
      onblur={handleTotalMinutesBlur}
    >
  </div>
</section>

<!-- ===== INTERVALS ===== -->
<section class="setup-section">
  <div class="section-header" role="button" tabindex="0" onclick={toggleIntervals} onkeydown={(e) => e.key === 'Enter' && toggleIntervals()}>
    <span class="section-chevron" class:collapsed={intervalsCollapsed}>▾</span>
    <h2 class="section-label">
      Intervals
      <span class="remaining-badge">{formatTime(remaining)} remaining</span>
    </h2>
    <button class="control-btn accent-sm" onclick={handleAddClick}>Add</button>
  </div>
  <div class="section-body" class:collapsed={intervalsCollapsed}>
    <div class="interval-add-row">
      <input
        type="number"
        min="0"
        max="180"
        placeholder="Min"
        class="interval-input"
        bind:value={intervalMinutes}
        onkeydown={handleKeydown}
      >
      <span class="interval-input-sep">:</span>
      <input
        type="number"
        min="0"
        max="59"
        placeholder="Sec"
        class="interval-input"
        bind:value={intervalSeconds}
        onkeydown={handleKeydown}
      >
      <input
        type="text"
        placeholder="Label (optional)"
        class="interval-label-input"
        bind:value={intervalLabel}
        onkeydown={handleKeydown}
      >
    </div>

    <div class="interval-list">
      {#each intervals as iv, i}
        <div class="interval-card">
          <span class="interval-card__info">
            <span class="interval-card__number">{i + 1}</span>
            <span class="interval-card__time">{formatTime(iv.seconds)}</span>
            {#if iv.label}
              <span class="interval-card__label">{iv.label}</span>
            {/if}
          </span>
          <button class="interval-card__delete" onclick={() => onremoveinterval(i)}>×</button>
        </div>
      {/each}
    </div>

    <div class="interval-bar">
      {#each intervals as iv, i}
        <div
          class="interval-bar__seg"
          style:flex={iv.seconds}
          style:background={SEGMENT_COLORS[i % SEGMENT_COLORS.length]}
        ></div>
      {/each}
      {#if remaining > 0}
        <div
          class="interval-bar__seg"
          style:flex={remaining}
          style:background="rgba(255,255,255,0.08)"
        ></div>
      {/if}
    </div>
  </div>
</section>

<!-- ===== START BUTTON ===== -->
<div class="controls">
  <button class="control-btn primary" disabled={!canStart} onclick={onstart}>Start</button>
</div>
<p class="setup-error">{errorMessage}</p>

<!-- ===== SESSION INFO + WEATHER ===== -->
<div class="session-info">
  <svg class="weather-icon" data-weather={weatherState} viewBox="0 0 44 30" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <g class="wi-sun">
      <circle cx="22" cy="12" r="6"/>
      <line x1="22" y1="0" x2="22" y2="4" stroke-linecap="round"/>
      <line x1="22" y1="20" x2="22" y2="24" stroke-linecap="round"/>
      <line x1="8" y1="12" x2="12" y2="12" stroke-linecap="round"/>
      <line x1="32" y1="12" x2="36" y2="12" stroke-linecap="round"/>
      <line x1="13.5" y1="3.5" x2="16.3" y2="6.3" stroke-linecap="round"/>
      <line x1="27.7" y1="17.7" x2="30.5" y2="20.5" stroke-linecap="round"/>
      <line x1="30.5" y1="3.5" x2="27.7" y2="6.3" stroke-linecap="round"/>
      <line x1="13.5" y1="20.5" x2="16.3" y2="17.7" stroke-linecap="round"/>
    </g>
    <g class="wi-cloud">
      <path d="M4,22 Q4,16 10,16 Q11,10 18,11 Q24,8 29,14 Q35,12 36,18 Q40,18 40,22 Q40,26 36,26 L8,26 Q4,26 4,22 Z"/>
    </g>
  </svg>
  <p>Sessions completed: <span>{sessions}</span></p>
</div>

<!-- ===== STREAK & CALENDAR ===== -->
<div class="streak-section">
  <div class="streak-row">
    <div class="streak-flame">
      <span class="flame-icon">🔥</span>
      <span class="streak-number">{streak}</span>
      <span class="streak-label">day streak</span>
    </div>
    <div class="streak-right">
      <div class="today-count-badge">
        <span class="today-count-number">{todayCount}</span>
        <span class="today-count-label">today</span>
      </div>
      <div class="streak-best">
        <span class="best-label">Best</span>
        <span class="best-number">{bestStreak}</span>
      </div>
    </div>
  </div>
  <div class="week-calendar">
    {#each calendarDays as day}
      <div class="cal-day">
        <span class="cal-day__label">{day.label}</span>
        <div
          class="cal-day__dot"
          class:meditated={day.meditated}
          class:today={day.isToday}
        >
          {day.count > 1 ? day.count : (day.count === 1 ? '✓' : '')}
        </div>
      </div>
    {/each}
  </div>
</div>
