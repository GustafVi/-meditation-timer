// ===== DOM refs =====
const setupScreen = document.getElementById('setup-screen');
const timerScreen = document.getElementById('timer-screen');
const celebrationScreen = document.getElementById('celebration-screen');

// Setup
const totalMinutesInput = document.getElementById('total-minutes');
const remainingTimeEl = document.getElementById('remaining-time');
const intervalMinInput = document.getElementById('interval-minutes');
const intervalSecInput = document.getElementById('interval-seconds');
const intervalLabelInput = document.getElementById('interval-label');
const addIntervalBtn = document.getElementById('add-interval-btn');
const intervalListEl = document.getElementById('interval-list');
const intervalBarEl = document.getElementById('interval-bar');
const startBtn = document.getElementById('start-btn');
const setupError = document.getElementById('setup-error');
const sessionCountEl = document.getElementById('session-count');
const presetListEl = document.getElementById('preset-list');
const savePresetBtn = document.getElementById('save-preset-btn');

// Streak / calendar
const streakCountEl = document.getElementById('streak-count');
const bestStreakEl = document.getElementById('best-streak');
const todayCountEl = document.getElementById('today-count');
const weekCalendarEl = document.getElementById('week-calendar');
const cStreakCountEl = document.getElementById('c-streak-count');
const cTodayCountEl = document.getElementById('c-today-count');
const cWeekCalendarEl = document.getElementById('c-week-calendar');
const celebrationMessageEl = document.getElementById('celebration-message');
const celebrationContinueBtn = document.getElementById('celebration-continue-btn');

// Timer
const intervalIndicator = document.getElementById('interval-indicator');
const intervalNameEl = document.getElementById('interval-name');
const timerText = document.getElementById('timer-text');
const progressCircle = document.querySelector('.progress-ring__circle');
const timerDisplay = document.querySelector('.timer-display');
const overallFill = document.getElementById('overall-progress-fill');
const overallTime = document.getElementById('overall-time');
const intervalTimeline = document.getElementById('interval-timeline');
const pauseBtn = document.getElementById('pause-btn');
const resetBtn = document.getElementById('reset-btn');

// ===== Constants =====
const CIRCUMFERENCE = 2 * Math.PI * 90; // 565.48
progressCircle.style.strokeDasharray = CIRCUMFERENCE;

const SEGMENT_COLORS = [
  '#e94560', '#0f3460', '#533483', '#e9a045',
  '#45e9a0', '#4560e9', '#e945c4', '#60e945',
];

// ===== localStorage helpers (safe in Safari Private Browsing / quota exceeded) =====
function lsGet(key, fallback) {
  try { return localStorage.getItem(key) ?? fallback; }
  catch { return fallback; }
}
function lsSet(key, value) {
  try { localStorage.setItem(key, value); }
  catch { /* quota exceeded or private mode — silently skip */ }
}

// ===== Data migration =====
// Bump DATA_VERSION and add a migrateToVN() function for every schema change.
// runMigrations() is called once at startup, before any data is read.
const DATA_VERSION = 1;

function migrateToV1() {
  // v0 → v1: validate and normalise all keys written by earlier app versions.
  // Safe for brand-new installs (all lsGet calls return the fallback).

  // meditationSessions — must be a non-negative integer string
  const n = parseInt(lsGet('meditationSessions', '0'), 10);
  lsSet('meditationSessions', String(isNaN(n) || n < 0 ? 0 : n));

  // meditationDays — sorted, deduped array of YYYY-MM-DD strings
  try {
    const raw = JSON.parse(lsGet('meditationDays', '[]'));
    const days = Array.isArray(raw) ? raw : [];
    const valid = [...new Set(days)]
      .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
      .sort();
    lsSet('meditationDays', JSON.stringify(valid));
  } catch {
    lsSet('meditationDays', '[]');
  }

  // meditationDayCounts — object keyed by YYYY-MM-DD with positive integer values
  try {
    const raw = JSON.parse(lsGet('meditationDayCounts', '{}'));
    const src = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
    const clean = {};
    for (const [k, v] of Object.entries(src)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(k) && Number.isInteger(v) && v > 0) clean[k] = v;
    }
    lsSet('meditationDayCounts', JSON.stringify(clean));
  } catch {
    lsSet('meditationDayCounts', '{}');
  }

  // meditationPresets — array (contents validated when loaded)
  try {
    const raw = JSON.parse(lsGet('meditationPresets', '[]'));
    lsSet('meditationPresets', JSON.stringify(Array.isArray(raw) ? raw : []));
  } catch {
    lsSet('meditationPresets', '[]');
  }
}

function runMigrations() {
  const stored = parseInt(lsGet('meditationDataVersion', '0'), 10);
  if (stored >= DATA_VERSION) return;

  if (stored < 1) migrateToV1();
  // if (stored < 2) migrateToV2();  // add future migrations here

  lsSet('meditationDataVersion', String(DATA_VERSION));
}

runMigrations();

// ===== State =====
let totalSeconds = 10 * 60; // default 10 min
let intervals = [];          // { seconds, label }
let currentIntervalIndex = 0;
let timerInterval = null;
let isRunning = false;
let sessions = parseInt(lsGet('meditationSessions', '0'), 10);

// Timestamp-based tracking (survives iOS screen lock)
let sessionStartTime = 0;   // Date.now() when session started
let pausedElapsed = 0;       // total ms elapsed before last pause
let lastChimedInterval = -1; // track which intervals already chimed

sessionCountEl.textContent = sessions;

// ===== Weather icon =====
function updateWeatherIcon(count) {
  const icon = document.getElementById('weather-icon');
  if (!icon) return;
  if (count === 0) icon.dataset.weather = 'storm';
  else if (count === 1) icon.dataset.weather = 'cloudy';
  else icon.dataset.weather = 'sunny';
}

updateWeatherIcon(getTodayCount());

// ===== Streak & Calendar Helpers =====
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function getMeditatedDays() {
  return JSON.parse(lsGet('meditationDays', '[]'));
}

function getTodayCounts() {
  return JSON.parse(lsGet('meditationDayCounts', '{}'));
}

function getTodayCount() {
  return getTodayCounts()[todayKey()] || 0;
}

function recordToday() {
  // Track unique days for streak
  const days = getMeditatedDays();
  const key = todayKey();
  if (!days.includes(key)) {
    days.push(key);
    lsSet('meditationDays', JSON.stringify(days));
  }
  // Track per-day session count
  const counts = getTodayCounts();
  counts[key] = (counts[key] || 0) + 1;
  lsSet('meditationDayCounts', JSON.stringify(counts));
}

function computeStreak() {
  const days = getMeditatedDays();
  if (days.length === 0) return 0;
  const daySet = new Set(days);
  let streak = 0;
  const d = new Date();
  for (let i = 0; i < 365; i++) {
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    if (daySet.has(key)) { streak++; d.setDate(d.getDate() - 1); }
    else break;
  }
  return streak;
}

function computeBestStreak() {
  const days = getMeditatedDays().sort();
  if (days.length === 0) return 0;
  let best = 1, current = 1;
  for (let i = 1; i < days.length; i++) {
    const diff = (Date.UTC(...days[i].split('-')) - Date.UTC(...days[i-1].split('-'))) / 86400000;
    if (diff === 1) { current++; if (current > best) best = current; }
    else if (diff > 1) { current = 1; }
  }
  return best;
}

function getLast7Days() {
  const result = [];
  const today = new Date();
  const dayNames = ['Su','Mo','Tu','We','Th','Fr','Sa'];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    result.push({ key, label: dayNames[d.getDay()], isToday: i === 0 });
  }
  return result;
}

function renderCalendar(containerEl) {
  const daySet = new Set(getMeditatedDays());
  const counts = getTodayCounts();
  containerEl.innerHTML = '';
  getLast7Days().forEach(({ key, label, isToday }) => {
    const col = document.createElement('div');
    col.className = 'cal-day';
    const lbl = document.createElement('span');
    lbl.className = 'cal-day__label';
    lbl.textContent = label;
    const dot = document.createElement('div');
    dot.className = 'cal-day__dot';
    const count = counts[key] || 0;
    if (daySet.has(key)) dot.classList.add('meditated');
    if (isToday) dot.classList.add('today');
    // Show count if multiple sessions, checkmark if 1, empty otherwise
    dot.textContent = count > 1 ? count : (count === 1 ? '✓' : '');
    col.appendChild(lbl);
    col.appendChild(dot);
    containerEl.appendChild(col);
  });
}

function renderStreakUI() {
  const streak = computeStreak();
  const best = Math.max(computeBestStreak(), streak);
  const todayCount = getTodayCount();
  streakCountEl.textContent = streak;
  bestStreakEl.textContent = best;
  // Animate the today counter bump if it just changed
  const prev = parseInt(todayCountEl.textContent, 10);
  todayCountEl.textContent = todayCount;
  if (todayCount > prev) {
    todayCountEl.classList.remove('bump');
    void todayCountEl.offsetWidth; // reflow to restart animation
    todayCountEl.classList.add('bump');
  }
  renderCalendar(weekCalendarEl);
}

function getStreakMessage(streak, todayCount = 1) {
  if (todayCount === 2) return 'Two sessions today. Double the calm 🌊';
  if (todayCount === 3) return 'Three today. You\'re deeply committed 🙏';
  if (todayCount >= 4) return `${todayCount} sessions today. Truly dedicated 🏯`;
  if (streak === 1) return 'Great start — day 1 complete!';
  if (streak === 3) return '3 days strong. A habit is forming 🌱';
  if (streak === 7) return "One full week! You're on fire 🔥";
  if (streak === 14) return 'Two weeks of calm. Incredible 💫';
  if (streak === 30) return '30 days. You\'ve changed yourself 🏆';
  if (streak % 10 === 0) return `${streak} days. Legendary consistency.`;
  return `${streak} days in a row. Keep going.`;
}

function spawnBurst() {
  const burst = document.getElementById('celebration-burst');
  burst.innerHTML = '';
  const colors = ['#e94560','#e9a045','#45e9a0','#4560e9','#e945c4','#fff'];
  for (let i = 0; i < 18; i++) {
    const p = document.createElement('div');
    p.className = 'burst-particle';
    p.style.setProperty('--angle', `${i * 20}deg`);
    p.style.background = colors[i % colors.length];
    p.style.animationDelay = `${(Math.random() * 0.2).toFixed(2)}s`;
    burst.appendChild(p);
  }
}

renderStreakUI();

// ===== Presets =====
const BUILTIN_PRESETS = [
  {
    id: 'builtin-quick',
    name: 'Quick Reset',
    builtin: true,
    totalMinutes: 5,
    intervals: [
      { seconds: 60, label: 'Breathe in' },
      { seconds: 120, label: 'Focus' },
      { seconds: 120, label: 'Release' },
    ],
  },
  {
    id: 'builtin-morning',
    name: 'Morning',
    builtin: true,
    totalMinutes: 10,
    intervals: [
      { seconds: 120, label: 'Body scan' },
      { seconds: 300, label: 'Breathe' },
      { seconds: 180, label: 'Intention' },
    ],
  },
  {
    id: 'builtin-deep',
    name: 'Deep Focus',
    builtin: true,
    totalMinutes: 20,
    intervals: [
      { seconds: 120, label: 'Settle' },
      { seconds: 900, label: 'Deep sit' },
      { seconds: 180, label: 'Return' },
    ],
  },
];

function getUserPresets() {
  return JSON.parse(lsGet('meditationPresets', '[]'));
}

function saveUserPresets(presets) {
  lsSet('meditationPresets', JSON.stringify(presets));
}

function getAllPresets() {
  return [...BUILTIN_PRESETS, ...getUserPresets()];
}

function loadPreset(preset) {
  totalSeconds = preset.totalMinutes * 60;
  totalMinutesInput.value = preset.totalMinutes;
  intervals = preset.intervals.map(iv => ({ ...iv }));
  showError('');
  renderSetup();
  renderPresets(preset.id);
}

function saveCurrentAsPreset() {
  if (intervals.length === 0 || remainingToAllocate() !== 0) return;
  const name = prompt('Name this preset:');
  if (!name || !name.trim()) return;
  const userPresets = getUserPresets();
  const newPreset = {
    id: `user-${Date.now()}`,
    name: name.trim(),
    builtin: false,
    totalMinutes: totalSeconds / 60,
    intervals: intervals.map(iv => ({ ...iv })),
  };
  userPresets.push(newPreset);
  saveUserPresets(userPresets);
  renderPresets(newPreset.id);
}

function deleteUserPreset(id) {
  saveUserPresets(getUserPresets().filter(p => p.id !== id));
  renderPresets(null);
}

function renderPresets(activeId = null) {
  presetListEl.innerHTML = '';
  getAllPresets().forEach(preset => {
    const chip = document.createElement('div');
    chip.className = 'preset-chip' + (preset.builtin ? ' builtin' : '');
    if (preset.id === activeId) chip.classList.add('active');

    const name = document.createElement('span');
    name.className = 'preset-chip__name';
    name.textContent = preset.name;

    const meta = document.createElement('span');
    meta.className = 'preset-chip__meta';
    meta.textContent = `${preset.totalMinutes}m · ${preset.intervals.length}`;

    chip.appendChild(name);
    chip.appendChild(meta);

    if (!preset.builtin) {
      const del = document.createElement('button');
      del.className = 'preset-chip__delete';
      del.textContent = '×';
      del.title = 'Delete preset';
      del.addEventListener('click', (e) => { e.stopPropagation(); deleteUserPreset(preset.id); });
      chip.appendChild(del);
    }

    chip.addEventListener('click', () => loadPreset(preset));
    presetListEl.appendChild(chip);
  });

  // Save button only enabled when config is fully valid
  savePresetBtn.disabled = intervals.length === 0 || remainingToAllocate() !== 0;
}

savePresetBtn.addEventListener('click', saveCurrentAsPreset);

renderPresets();

function formatTime(sec) {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function allocatedSeconds() {
  return intervals.reduce((sum, iv) => sum + iv.seconds, 0);
}

function remainingToAllocate() {
  return totalSeconds - allocatedSeconds();
}

function showError(msg) {
  setupError.textContent = msg;
}

// ===== Audio (HTML Audio elements for iOS screen-lock support) =====
let audioUnlocked = false;
let chimeTimeouts = [];      // setTimeout IDs for scheduled chimes
let ambientAudio = null;     // looping near-silent <audio> to keep iOS audio session alive
let intervalChimeUrl = null;   // blob URL for interval chime WAV
let sessionChimeUrl = null;    // blob URL for session-complete chime WAV
let ambientUrl = null;         // blob URL for ambient loop WAV
let intervalChimeAudio = null; // pre-created <audio> for interval chime (reused)
let sessionChimeAudio = null;  // pre-created <audio> for session chime (reused)

// --- WAV generation helpers ---
function writeWavHeader(view, sampleRate, numSamples) {
  const dataSize = numSamples * 2;
  const fileSize = 44 + dataSize;
  const writeStr = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  writeStr(0, 'RIFF');
  view.setUint32(4, fileSize - 8, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);  // PCM
  view.setUint16(22, 1, true);  // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);
}

// Generate the interval chime: E5 sine, 0.8s with decay
function generateIntervalChimeWav() {
  const sampleRate = 44100;
  const duration = 0.8;
  const numSamples = Math.ceil(sampleRate * duration);
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);
  writeWavHeader(view, sampleRate, numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const amp = 0.18 * Math.exp(-3.5 * t);
    const sample = amp * Math.sin(2 * Math.PI * 659.25 * t);
    view.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, sample * 32767)), true);
  }
  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
}

// Generate the session-complete chime: C5-E5-G5 arpeggio
function generateSessionChimeWav() {
  const sampleRate = 44100;
  const freqs = [523.25, 659.25, 783.99];
  const noteSpacing = 0.3;
  const noteDuration = 2.0;
  const totalDuration = noteSpacing * (freqs.length - 1) + noteDuration;
  const numSamples = Math.ceil(sampleRate * totalDuration);
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);
  writeWavHeader(view, sampleRate, numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let sample = 0;
    for (let n = 0; n < freqs.length; n++) {
      const noteStart = n * noteSpacing;
      if (t >= noteStart && t < noteStart + noteDuration) {
        const noteT = t - noteStart;
        const amp = 0.15 * Math.exp(-1.5 * noteT);
        sample += amp * Math.sin(2 * Math.PI * freqs[n] * noteT);
      }
    }
    sample = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + i * 2, sample * 32767, true);
  }
  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
}

// Generate a near-silent looping ambient tone (very low volume sine)
function generateAmbientWav() {
  const sampleRate = 8000;
  const duration = 2; // 2-second loop
  const numSamples = sampleRate * duration;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);
  writeWavHeader(view, sampleRate, numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    // Barely audible 100 Hz tone
    const sample = 0.002 * Math.sin(2 * Math.PI * 100 * t);
    view.setInt16(44 + i * 2, sample * 32767, true);
  }
  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
}

// Pre-generate all audio blobs at startup
intervalChimeUrl = generateIntervalChimeWav();
sessionChimeUrl = generateSessionChimeWav();
ambientUrl = generateAmbientWav();

function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  // Prime the ambient audio element from a user gesture (required by iOS)
  if (!ambientAudio) {
    ambientAudio = new Audio(ambientUrl);
    ambientAudio.loop = true;
    ambientAudio.volume = 0.01;
  }
  // Play + pause to unlock the audio element for later programmatic playback
  ambientAudio.play().then(() => { ambientAudio.pause(); }).catch(() => {});
}

document.addEventListener('touchstart', unlockAudio, { once: true });
document.addEventListener('click', unlockAudio, { once: true });

// --- Play chimes via pre-created <audio> elements ---
// iOS requires Audio elements to be played from a user gesture to "unlock" them.
// These are created and primed in startSession() (a click handler), then reused here.
function playIntervalChime() {
  if (!intervalChimeAudio) return;
  intervalChimeAudio.currentTime = 0;
  intervalChimeAudio.play().catch(() => {});
}

function playSessionChime() {
  if (!sessionChimeAudio) return;
  sessionChimeAudio.currentTime = 0;
  sessionChimeAudio.play().catch(() => {});
}

// --- Ambient keep-alive ---
function startKeepAlive() {
  if (!ambientAudio) {
    ambientAudio = new Audio(ambientUrl);
    ambientAudio.loop = true;
    ambientAudio.volume = 0.01;
  }
  ambientAudio.currentTime = 0;
  ambientAudio.play().catch(() => {});
}

function stopKeepAlive() {
  if (ambientAudio) {
    ambientAudio.pause();
    ambientAudio.currentTime = 0;
  }
}

// --- Schedule chimes via setTimeout ---
function scheduleAllChimes() {
  cancelScheduledChimes();
  const state = getTimerState();
  let accumulated = 0;
  for (let i = 0; i < intervals.length; i++) {
    accumulated += intervals[i].seconds;
    const delaySec = accumulated - state.totalElapsed;
    if (delaySec <= 0) continue;
    if (i < intervals.length - 1) {
      const tid = setTimeout(playIntervalChime, delaySec * 1000);
      chimeTimeouts.push(tid);
    } else {
      const tid = setTimeout(playSessionChime, delaySec * 1000);
      chimeTimeouts.push(tid);
    }
  }
}

function cancelScheduledChimes() {
  chimeTimeouts.forEach(id => clearTimeout(id));
  chimeTimeouts = [];
}

// --- MediaSession API ---
function setupMediaSession() {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: 'Meditation Timer',
    artist: 'Session in progress',
  });
  navigator.mediaSession.setActionHandler('play', () => {
    if (!isRunning) togglePause();
  });
  navigator.mediaSession.setActionHandler('pause', () => {
    if (isRunning) togglePause();
  });
}

function clearMediaSession() {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = null;
  navigator.mediaSession.setActionHandler('play', null);
  navigator.mediaSession.setActionHandler('pause', null);
}

// ===== Setup: total duration =====
totalMinutesInput.addEventListener('input', () => {
  const val = parseInt(totalMinutesInput.value, 10);
  if (!val || val < 1) return;
  totalSeconds = val * 60;
  // Trim intervals that no longer fit
  while (allocatedSeconds() > totalSeconds) {
    intervals.pop();
  }
  renderSetup();
});

totalMinutesInput.addEventListener('blur', () => {
  const val = parseInt(totalMinutesInput.value, 10);
  if (!val || val < 1) {
    const fallback = Math.max(Math.ceil(allocatedSeconds() / 60), 1);
    totalMinutesInput.value = fallback;
    totalSeconds = fallback * 60;
    renderSetup();
  }
});

// ===== Setup: interval builder =====
addIntervalBtn.addEventListener('click', addInterval);
[intervalMinInput, intervalSecInput, intervalLabelInput].forEach(input => {
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addInterval();
  });
});

function addInterval() {
  const mins = parseInt(intervalMinInput.value, 10) || 0;
  const secs = parseInt(intervalSecInput.value, 10) || 0;
  const totalSec = mins * 60 + secs;
  if (totalSec <= 0) {
    showError('Enter a duration greater than 0.');
    return;
  }
  if (totalSec > remainingToAllocate()) {
    showError(`Only ${formatTime(remainingToAllocate())} remaining to allocate.`);
    return;
  }
  const label = intervalLabelInput.value.trim();
  intervals.push({ seconds: totalSec, label });
  intervalMinInput.value = '';
  intervalSecInput.value = '';
  intervalLabelInput.value = '';
  showError('');
  renderSetup();
}

function removeInterval(index) {
  intervals.splice(index, 1);
  renderSetup();
}

// ===== Setup rendering =====
function renderSetup() {
  const remaining = remainingToAllocate();
  remainingTimeEl.textContent = `${formatTime(remaining)} remaining`;

  // Interval cards
  intervalListEl.innerHTML = '';
  intervals.forEach((iv, i) => {
    const card = document.createElement('div');
    card.className = 'interval-card';

    const info = document.createElement('span');
    info.className = 'interval-card__info';

    const num = document.createElement('span');
    num.className = 'interval-card__number';
    num.textContent = i + 1;
    info.appendChild(num);

    const time = document.createElement('span');
    time.className = 'interval-card__time';
    time.textContent = formatTime(iv.seconds);
    info.appendChild(time);

    if (iv.label) {
      const lbl = document.createElement('span');
      lbl.className = 'interval-card__label';
      lbl.textContent = iv.label;
      info.appendChild(lbl);
    }

    const del = document.createElement('button');
    del.className = 'interval-card__delete';
    del.textContent = '\u00d7';
    del.addEventListener('click', () => removeInterval(i));

    card.appendChild(info);
    card.appendChild(del);
    intervalListEl.appendChild(card);
  });

  // Visual bar
  intervalBarEl.innerHTML = '';
  if (intervals.length > 0) {
    intervals.forEach((iv, i) => {
      const seg = document.createElement('div');
      seg.className = 'interval-bar__seg';
      seg.style.flex = iv.seconds;
      seg.style.background = SEGMENT_COLORS[i % SEGMENT_COLORS.length];
      intervalBarEl.appendChild(seg);
    });
    // Remaining unallocated
    if (remaining > 0) {
      const seg = document.createElement('div');
      seg.className = 'interval-bar__seg';
      seg.style.flex = remaining;
      seg.style.background = 'rgba(255,255,255,0.08)';
      intervalBarEl.appendChild(seg);
    }
  }

  // Start button enabled only when fully allocated
  startBtn.disabled = remaining !== 0 || intervals.length === 0;

  // Keep save preset button in sync
  if (savePresetBtn) savePresetBtn.disabled = intervals.length === 0 || remaining !== 0;
}

renderSetup();

// ===== Screen transitions =====
function switchScreen(from, to) {
  from.classList.add('screen-leaving');
  setTimeout(() => {
    from.classList.add('hidden');
    from.classList.remove('screen-leaving');
    to.classList.remove('hidden');
    to.classList.add('screen-entering');
    to.addEventListener('animationend', () => to.classList.remove('screen-entering'), { once: true });
  }, 230);
}

// ===== Start session =====
startBtn.addEventListener('click', startSession);

function startSession() {
  if (isRunning) return;
  if (intervals.length === 0 || remainingToAllocate() !== 0) return;

  // Create and prime chime Audio elements from user gesture (required by iOS)
  unlockAudio();
  intervalChimeAudio = new Audio(intervalChimeUrl);
  intervalChimeAudio.volume = 1.0;
  intervalChimeAudio.play().then(() => intervalChimeAudio.pause()).catch(() => {});
  sessionChimeAudio = new Audio(sessionChimeUrl);
  sessionChimeAudio.volume = 1.0;
  sessionChimeAudio.play().then(() => sessionChimeAudio.pause()).catch(() => {});

  // Switch screens
  switchScreen(setupScreen, timerScreen);

  currentIntervalIndex = 0;
  lastChimedInterval = -1;
  pausedElapsed = 0;
  sessionStartTime = Date.now();
  isRunning = true;

  // Schedule chimes via setTimeout + start ambient keep-alive
  startKeepAlive();
  scheduleAllChimes();
  setupMediaSession();

  renderTimeline();
  tick(); // render immediately
  timerInterval = setInterval(tick, 250);
  pauseBtn.textContent = 'Pause';
  timerDisplay.classList.add('active');
}

// ===== Timer logic =====
// Compute which interval we're in and how far along, based on real time
function getTimerState() {
  const elapsedMs = isRunning ? (pausedElapsed + (Date.now() - sessionStartTime)) : pausedElapsed;
  const totalElapsed = Math.min(Math.floor(elapsedMs / 1000), totalSeconds);
  let accumulated = 0;
  let idx = 0;
  for (idx = 0; idx < intervals.length; idx++) {
    if (accumulated + intervals[idx].seconds > totalElapsed) break;
    accumulated += intervals[idx].seconds;
  }
  const done = totalElapsed >= totalSeconds;
  if (done) idx = intervals.length - 1;
  const elapsedInInterval = totalElapsed - accumulated;
  return { totalElapsed, idx, elapsedInInterval, done };
}

function tick() {
  if (!isRunning) return;

  const state = getTimerState();

  // Session complete
  if (state.done) {
    clearInterval(timerInterval);
    timerInterval = null;
    stopKeepAlive();
    completeSession();
    return;
  }

  currentIntervalIndex = state.idx;
  const iv = intervals[currentIntervalIndex];
  const remainInInterval = iv.seconds - state.elapsedInInterval;

  timerText.textContent = formatTime(Math.max(remainInInterval, 0));
  intervalIndicator.textContent = `Interval ${currentIntervalIndex + 1} of ${intervals.length}`;
  intervalNameEl.textContent = iv.label || '';

  // Ring progress
  const fraction = Math.max((iv.seconds - state.elapsedInInterval) / iv.seconds, 0);
  progressCircle.style.strokeDashoffset = CIRCUMFERENCE * (1 - fraction);

  // Overall progress
  const pct = (state.totalElapsed / totalSeconds) * 100;
  overallFill.style.width = `${Math.min(pct, 100)}%`;
  overallTime.textContent = formatTime(totalSeconds - state.totalElapsed);

  highlightTimeline();
}

function renderTimeline() {
  intervalTimeline.innerHTML = '';
  intervals.forEach((iv, i) => {
    const chip = document.createElement('span');
    chip.className = 'timeline-chip';
    chip.textContent = iv.label || `#${i + 1} ${formatTime(iv.seconds)}`;
    chip.dataset.index = i;
    intervalTimeline.appendChild(chip);
  });
}

function highlightTimeline() {
  intervalTimeline.querySelectorAll('.timeline-chip').forEach((chip, i) => {
    chip.classList.remove('active', 'done');
    if (i < currentIntervalIndex) chip.classList.add('done');
    else if (i === currentIntervalIndex) chip.classList.add('active');
  });
}

// ===== Pause / Reset =====
// Single stable listener — always attached, reads state at call time
pauseBtn.addEventListener('click', () => {
  if (pauseBtn.dataset.action === 'toggle') togglePause();
});
pauseBtn.dataset.action = 'toggle';

resetBtn.addEventListener('click', resetToSetup);

function togglePause() {
  if (isRunning) {
    clearInterval(timerInterval);
    pausedElapsed += Date.now() - sessionStartTime;
    isRunning = false;
    cancelScheduledChimes();
    stopKeepAlive();
    pauseBtn.textContent = 'Resume';
    timerDisplay.classList.remove('active');
  } else {
    sessionStartTime = Date.now();
    isRunning = true;
    startKeepAlive();
    scheduleAllChimes();
    pauseBtn.textContent = 'Pause';
    timerDisplay.classList.add('active');
    timerInterval = setInterval(tick, 250);
  }
}

function resetToSetup() {
  clearInterval(timerInterval);
  isRunning = false;
  lastChimedInterval = -1;
  cancelScheduledChimes();
  stopKeepAlive();
  clearMediaSession();
  timerDisplay.classList.remove('active');
  progressCircle.style.strokeDashoffset = 0;
  celebrationScreen.classList.add('hidden');
  switchScreen(timerScreen, setupScreen);
  pauseBtn.dataset.action = 'toggle';
  pauseBtn.textContent = 'Pause';
  showError('');
  renderSetup();
}

// ===== Session complete =====
function completeSession() {
  clearInterval(timerInterval);
  isRunning = false;
  cancelScheduledChimes();
  clearMediaSession();
  timerDisplay.classList.remove('active');
  highlightTimeline();

  sessions++;
  lsSet('meditationSessions', String(sessions));
  sessionCountEl.textContent = sessions;

  // Record today and update streak
  recordToday();
  updateWeatherIcon(getTodayCount());
  renderStreakUI();

  // Mark all intervals as done in timeline
  intervalTimeline.querySelectorAll('.timeline-chip').forEach(chip => {
    chip.classList.remove('active');
    chip.classList.add('done');
  });

  progressCircle.style.strokeDashoffset = CIRCUMFERENCE;
  overallFill.style.width = '100%';
  overallTime.textContent = '00:00';
  timerText.textContent = '00:00';
  pauseBtn.dataset.action = ''; // disable pause btn during celebration transition

  // Show celebration screen after a short delay
  setTimeout(() => {
    switchScreen(timerScreen, celebrationScreen);

    const streak = computeStreak();
    const todayCount = getTodayCount();
    cStreakCountEl.textContent = streak;
    cTodayCountEl.textContent = todayCount;
    celebrationMessageEl.textContent = getStreakMessage(streak, todayCount);
    renderCalendar(cWeekCalendarEl);
    spawnBurst();
  }, 600);
}

celebrationContinueBtn.addEventListener('click', () => {
  switchScreen(celebrationScreen, setupScreen);
  pauseBtn.dataset.action = 'toggle'; // re-enable pause for next session
  pauseBtn.textContent = 'Pause';
  progressCircle.style.strokeDashoffset = 0;
  showError('');
  renderStreakUI(); // refresh today count + streak on setup screen
  renderSetup();
});

// ===== iOS screen wake recovery =====
// When iOS suspends the page and the user wakes the screen,
// setTimeout timers may have been delayed. Reschedule remaining chimes
// and play any that were missed while the screen was locked.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && isRunning) {
    const state = getTimerState();

    if (state.done) {
      tick(); // will trigger completeSession
      return;
    }

    // Play missed interval chimes
    let accumulated = 0;
    for (let i = 0; i < intervals.length; i++) {
      accumulated += intervals[i].seconds;
      if (accumulated <= state.totalElapsed && i > lastChimedInterval) {
        if (i < intervals.length - 1) {
          playIntervalChime();
        }
        lastChimedInterval = i;
      }
    }

    // Reschedule remaining chimes from current position
    scheduleAllChimes();

    // Ensure ambient keep-alive is still playing
    if (ambientAudio && ambientAudio.paused) {
      ambientAudio.play().catch(() => {});
    }

    // Force a UI update
    tick();
  }
});

// ===== Service Worker =====
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('service-worker.js')
    .catch(err => console.warn('SW registration failed:', err));
}
