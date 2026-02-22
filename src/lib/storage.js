import { DATA_VERSION } from './constants.js'

// ===== localStorage helpers (safe in Safari Private Browsing / quota exceeded) =====
export function lsGet(key, fallback) {
  try { return localStorage.getItem(key) ?? fallback }
  catch { return fallback }
}

export function lsSet(key, value) {
  try { localStorage.setItem(key, value) }
  catch { /* quota exceeded or private mode — silently skip */ }
}

// ===== Data migration =====
// Bump DATA_VERSION and add a migrateToVN() function for every schema change.
// runMigrations() is called once at startup, before any data is read.

function migrateToV1() {
  // v0 → v1: validate and normalise all keys written by earlier app versions.
  // Safe for brand-new installs (all lsGet calls return the fallback).

  // meditationSessions — must be a non-negative integer string
  const n = parseInt(lsGet('meditationSessions', '0'), 10)
  lsSet('meditationSessions', String(isNaN(n) || n < 0 ? 0 : n))

  // meditationDays — sorted, deduped array of YYYY-MM-DD strings
  try {
    const raw = JSON.parse(lsGet('meditationDays', '[]'))
    const days = Array.isArray(raw) ? raw : []
    const valid = [...new Set(days)]
      .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
      .sort()
    lsSet('meditationDays', JSON.stringify(valid))
  } catch {
    lsSet('meditationDays', '[]')
  }

  // meditationDayCounts — object keyed by YYYY-MM-DD with positive integer values
  try {
    const raw = JSON.parse(lsGet('meditationDayCounts', '{}'))
    const src = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {}
    const clean = {}
    for (const [k, v] of Object.entries(src)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(k) && Number.isInteger(v) && v > 0) clean[k] = v
    }
    lsSet('meditationDayCounts', JSON.stringify(clean))
  } catch {
    lsSet('meditationDayCounts', '{}')
  }

  // meditationPresets — array (contents validated when loaded)
  try {
    const raw = JSON.parse(lsGet('meditationPresets', '[]'))
    lsSet('meditationPresets', JSON.stringify(Array.isArray(raw) ? raw : []))
  } catch {
    lsSet('meditationPresets', '[]')
  }
}

export function runMigrations() {
  const stored = parseInt(lsGet('meditationDataVersion', '0'), 10)
  if (stored >= DATA_VERSION) return

  if (stored < 1) migrateToV1()
  // if (stored < 2) migrateToV2()  // add future migrations here

  lsSet('meditationDataVersion', String(DATA_VERSION))
}

// ===== Session count =====
export function getSessions() {
  return parseInt(lsGet('meditationSessions', '0'), 10)
}

export function saveSessions(n) {
  lsSet('meditationSessions', String(n))
}

// ===== Meditated days & counts =====
export function getMeditatedDays() {
  return JSON.parse(lsGet('meditationDays', '[]'))
}

export function getDayCounts() {
  return JSON.parse(lsGet('meditationDayCounts', '{}'))
}

export function recordToday(todayKeyFn) {
  // Track unique days for streak
  const key = todayKeyFn()
  const days = getMeditatedDays()
  if (!days.includes(key)) {
    days.push(key)
    lsSet('meditationDays', JSON.stringify(days))
  }
  // Track per-day session count
  const counts = getDayCounts()
  counts[key] = (counts[key] || 0) + 1
  lsSet('meditationDayCounts', JSON.stringify(counts))
}

// ===== User presets =====
export function getUserPresets() {
  return JSON.parse(lsGet('meditationPresets', '[]'))
}

export function saveUserPresets(presets) {
  lsSet('meditationPresets', JSON.stringify(presets))
}
