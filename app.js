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
let elapsedInInterval = 0;
let totalElapsed = 0;
let timerInterval = null;
let isRunning = false;
let sessions = parseInt(localStorage.getItem('meditationSessions') || '0', 10);
let audioCtx = null;

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
function getAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

function playIntervalChime() {
  try {
    const ctx = getAudioCtx();
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
  const ctx = getAudioCtx();
  if (ctx.state === 'suspended') ctx.resume();

  // Switch screens
  setupScreen.classList.add('hidden');
  timerScreen.classList.remove('hidden');

  currentIntervalIndex = 0;
  elapsedInInterval = 0;
  totalElapsed = 0;
  isRunning = true;

  renderTimeline();
  beginCurrentInterval();
  timerInterval = setInterval(tick, 1000);
  pauseBtn.textContent = 'Pause';
  timerDisplay.classList.add('active');
}

// ===== Timer logic =====
function beginCurrentInterval() {
  const iv = intervals[currentIntervalIndex];
  const remaining = iv.seconds - elapsedInInterval;
  timerText.textContent = formatTime(remaining);
  intervalIndicator.textContent = `Interval ${currentIntervalIndex + 1} of ${intervals.length}`;
  intervalNameEl.textContent = iv.label || '';
  updateRingProgress();
  updateOverallProgress();
  highlightTimeline();
}

function tick() {
  elapsedInInterval++;
  totalElapsed++;
  const iv = intervals[currentIntervalIndex];
  const remaining = iv.seconds - elapsedInInterval;
  timerText.textContent = formatTime(remaining);
  updateRingProgress();
  updateOverallProgress();

  if (remaining <= 0) {
    // Interval done
    if (currentIntervalIndex < intervals.length - 1) {
      // Move to next interval
      playIntervalChime();
      currentIntervalIndex++;
      elapsedInInterval = 0;
      beginCurrentInterval();
    } else {
      // Session complete
      completeSession();
    }
  }
}

function updateRingProgress() {
  const iv = intervals[currentIntervalIndex];
  const fraction = (iv.seconds - elapsedInInterval) / iv.seconds;
  progressCircle.style.strokeDashoffset = CIRCUMFERENCE * (1 - fraction);
}

function updateOverallProgress() {
  const pct = (totalElapsed / totalSeconds) * 100;
  overallFill.style.width = `${pct}%`;
  const overallRemaining = totalSeconds - totalElapsed;
  overallTime.textContent = formatTime(overallRemaining);
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
    isRunning = false;
    pauseBtn.textContent = 'Resume';
    timerDisplay.classList.remove('active');
  } else {
    isRunning = true;
    pauseBtn.textContent = 'Pause';
    timerDisplay.classList.add('active');
    timerInterval = setInterval(tick, 1000);
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
