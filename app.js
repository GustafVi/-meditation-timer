// ===== DOM refs =====
const setupScreen = document.getElementById('setup-screen');
const timerScreen = document.getElementById('timer-screen');

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

// ===== State =====
let totalSeconds = 10 * 60; // default 10 min
let intervals = [];          // { seconds, label }
let currentIntervalIndex = 0;
let timerInterval = null;
let isRunning = false;
let sessions = parseInt(localStorage.getItem('meditationSessions') || '0', 10);
let audioCtx = null;

// Timestamp-based tracking (survives iOS screen lock)
let sessionStartTime = 0;   // Date.now() when session started
let pausedElapsed = 0;       // total ms elapsed before last pause
let lastChimedInterval = -1; // track which intervals already chimed

sessionCountEl.textContent = sessions;

// ===== Helpers =====
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

// ===== Audio =====
// Unlock audio on the very first touch anywhere on the page.
// iOS Safari requires AudioContext creation + resume + playback
// to all happen inside a user-initiated touch event handler.
let audioUnlocked = false;

function getAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

function unlockAudio() {
  if (audioUnlocked) return;
  const ctx = getAudioCtx();
  ctx.resume().then(() => {
    // Play a short silent tone to fully activate the audio pipeline
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0;          // silent
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(0);
    osc.stop(ctx.currentTime + 0.05);
    audioUnlocked = true;
  });
}

// Attach unlock to first user interaction (touchstart fires before click on iOS)
document.addEventListener('touchstart', unlockAudio, { once: true });
document.addEventListener('click', unlockAudio, { once: true });

function playIntervalChime() {
  try {
    const ctx = getAudioCtx();
    ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 659.25; // E5
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.8);
  } catch (e) { /* silent */ }
}

function playSessionChime() {
  try {
    const ctx = getAudioCtx();
    ctx.resume();
    const freqs = [523.25, 659.25, 783.99]; // C5 E5 G5
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.3);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.3 + 2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.3);
      osc.stop(ctx.currentTime + i * 0.3 + 2);
    });
  } catch (e) { /* silent */ }
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

// ===== Setup: interval builder =====
addIntervalBtn.addEventListener('click', addInterval);

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
    card.innerHTML = `
      <span class="interval-card__info">
        <span class="interval-card__number">${i + 1}</span>
        <span class="interval-card__time">${formatTime(iv.seconds)}</span>
        ${iv.label ? `<span class="interval-card__label">${iv.label}</span>` : ''}
      </span>
      <button class="interval-card__delete" data-index="${i}">&times;</button>
    `;
    intervalListEl.appendChild(card);
  });

  // Delete handlers
  intervalListEl.querySelectorAll('.interval-card__delete').forEach(btn => {
    btn.addEventListener('click', () => removeInterval(parseInt(btn.dataset.index, 10)));
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
}

renderSetup();

// ===== Start session =====
startBtn.addEventListener('click', startSession);

function startSession() {
  if (intervals.length === 0 || remainingToAllocate() !== 0) return;

  // Unlock AudioContext on user gesture (required for iOS Safari)
  unlockAudio();

  // Switch screens
  setupScreen.classList.add('hidden');
  timerScreen.classList.remove('hidden');

  currentIntervalIndex = 0;
  lastChimedInterval = -1;
  pausedElapsed = 0;
  sessionStartTime = Date.now();
  isRunning = true;

  renderTimeline();
  tick(); // render immediately
  timerInterval = setInterval(tick, 250); // check 4x/sec for accuracy
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
  const state = getTimerState();

  // Check for interval transitions and play chimes
  if (state.idx > lastChimedInterval + 1) {
    // We skipped past one or more intervals (screen was locked)
    // Chime for the most recent transition
    playIntervalChime();
  } else if (state.idx === lastChimedInterval + 1 && state.idx > 0) {
    playIntervalChime();
  }
  if (state.idx > lastChimedInterval) lastChimedInterval = state.idx - 1;
  // Update to current interval (but not beyond last chimed to avoid double-chime)
  if (state.idx > 0) lastChimedInterval = state.idx - 1;

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

  if (state.done) {
    completeSession();
  }
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
pauseBtn.addEventListener('click', togglePause);
resetBtn.addEventListener('click', resetToSetup);

function togglePause() {
  if (isRunning) {
    clearInterval(timerInterval);
    pausedElapsed += Date.now() - sessionStartTime;
    isRunning = false;
    pauseBtn.textContent = 'Resume';
    timerDisplay.classList.remove('active');
  } else {
    sessionStartTime = Date.now();
    isRunning = true;
    pauseBtn.textContent = 'Pause';
    timerDisplay.classList.add('active');
    timerInterval = setInterval(tick, 250);
  }
}

function resetToSetup() {
  clearInterval(timerInterval);
  isRunning = false;
  timerDisplay.classList.remove('active');
  progressCircle.style.strokeDashoffset = 0;
  timerScreen.classList.add('hidden');
  setupScreen.classList.remove('hidden');
  showError('');
  renderSetup();
}

// ===== Session complete =====
function completeSession() {
  clearInterval(timerInterval);
  isRunning = false;
  timerDisplay.classList.remove('active');
  highlightTimeline();

  sessions++;
  localStorage.setItem('meditationSessions', sessions);
  sessionCountEl.textContent = sessions;

  playSessionChime();

  // Mark all intervals as done in timeline
  intervalTimeline.querySelectorAll('.timeline-chip').forEach(chip => {
    chip.classList.remove('active');
    chip.classList.add('done');
  });

  pauseBtn.textContent = 'Done';
  pauseBtn.disabled = true;
  overallFill.style.width = '100%';
  overallTime.textContent = '00:00';
  timerText.textContent = '00:00';

  // After a moment, allow reset
  setTimeout(() => {
    pauseBtn.disabled = false;
    pauseBtn.textContent = 'New Session';
    pauseBtn.onclick = () => {
      pauseBtn.onclick = null;
      pauseBtn.removeEventListener('click', togglePause);
      pauseBtn.addEventListener('click', togglePause);
      resetToSetup();
    };
  }, 2000);
}

// ===== Service Worker =====
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('service-worker.js');
}
