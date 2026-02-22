<script>
  import { computeStreak, getTodayCount, getCalendarData, getStreakMessage } from '../lib/dates.js'

  let { oncontinue } = $props()

  const streak = computeStreak()
  const todayCount = getTodayCount()
  const celebrationMessage = getStreakMessage(streak, todayCount)
  const calendarDays = getCalendarData()

  const COLORS = ['#b89dde', '#e8b870', '#7c5abf', '#6de8b4', '#cbb8f0', '#ede8f8']

  let particles = $state(Array.from({ length: 12 }, (_, i) => ({
    angle: i * 30,
    color: COLORS[i % COLORS.length],
    delay: (Math.random() * 0.2).toFixed(2),
  })))
</script>

<div class="celebration-inner">
  <div class="celebration-burst">
    {#each particles as p}
      <div
        class="burst-particle"
        style:--angle="{p.angle}deg"
        style:background={p.color}
        style:animation-delay="{p.delay}s"
      ></div>
    {/each}
  </div>

  <div class="celebration-emoji">🧘</div>
  <h2 class="celebration-title">Session Complete</h2>
  <p class="celebration-subtitle">{celebrationMessage}</p>

  <div class="celebration-streak-row">
    <span class="c-flame">🔥</span>
    <span class="c-streak-number">{streak}</span>
    <span class="c-streak-label">day streak</span>
    <span class="c-divider">·</span>
    <span class="c-today-number">{todayCount}</span>
    <span class="c-streak-label">today</span>
  </div>

  <div class="week-calendar celebration-calendar">
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

  <button class="control-btn primary" onclick={oncontinue}>New Session</button>
</div>
