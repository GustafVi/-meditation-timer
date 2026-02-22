import { getMeditatedDays, getDayCounts, recordToday as storageRecordToday } from './storage.js'

export function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function getTodayCount() {
  return getDayCounts()[todayKey()] || 0
}

export function recordToday() {
  storageRecordToday(todayKey)
}

export function computeStreak() {
  const days = getMeditatedDays()
  if (days.length === 0) return 0
  const daySet = new Set(days)
  let streak = 0
  const d = new Date()
  for (let i = 0; i < 365; i++) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (daySet.has(key)) { streak++; d.setDate(d.getDate() - 1) }
    else break
  }
  return streak
}

export function computeBestStreak() {
  const days = getMeditatedDays().sort()
  if (days.length === 0) return 0
  let best = 1, current = 1
  for (let i = 1; i < days.length; i++) {
    const diff = (Date.UTC(...days[i].split('-')) - Date.UTC(...days[i - 1].split('-'))) / 86400000
    if (diff === 1) { current++; if (current > best) best = current }
    else if (diff > 1) { current = 1 }
  }
  return best
}

export function getLast7Days() {
  const result = []
  const today = new Date()
  const dayNames = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    result.push({ key, label: dayNames[d.getDay()], isToday: i === 0 })
  }
  return result
}

export function getStreakMessage(streak, todayCount = 1) {
  if (todayCount === 2) return 'Two sessions today. Double the calm 🌊'
  if (todayCount === 3) return "Three today. You're deeply committed 🙏"
  if (todayCount >= 4) return `${todayCount} sessions today. Truly dedicated 🏯`
  if (streak === 1) return 'Great start — day 1 complete!'
  if (streak === 3) return '3 days strong. A habit is forming 🌱'
  if (streak === 7) return "One full week! You're on fire 🔥"
  if (streak === 14) return 'Two weeks of calm. Incredible 💫'
  if (streak === 30) return "30 days. You've changed yourself 🏆"
  if (streak % 10 === 0) return `${streak} days. Legendary consistency.`
  return `${streak} days in a row. Keep going.`
}

export function getCalendarData() {
  const daySet = new Set(getMeditatedDays())
  const counts = getDayCounts()
  return getLast7Days().map(d => ({
    ...d, meditated: daySet.has(d.key), count: counts[d.key] || 0
  }))
}
