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
}

renderSetup();

// ===== Start session =====
startBtn.addEventListener('click', startSession);

function startSession() {
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
  setupScreen.classList.add('hidden');
  timerScreen.classList.remove('hidden');

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
pauseBtn.addEventListener('click', togglePause);
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
  cancelScheduledChimes();
  stopKeepAlive();
  clearMediaSession();
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
  cancelScheduledChimes();
  clearMediaSession();
  timerDisplay.classList.remove('active');
  highlightTimeline();

  sessions++;
  localStorage.setItem('meditationSessions', sessions);
  sessionCountEl.textContent = sessions;

  // Mark all intervals as done in timeline
  intervalTimeline.querySelectorAll('.timeline-chip').forEach(chip => {
    chip.classList.remove('active');
    chip.classList.add('done');
  });

  progressCircle.style.strokeDashoffset = CIRCUMFERENCE;
  pauseBtn.textContent = 'Done';
  pauseBtn.disabled = true;
  overallFill.style.width = '100%';
  overallTime.textContent = '00:00';
  timerText.textContent = '00:00';

  // After a moment, allow reset
  pauseBtn.removeEventListener('click', togglePause);
  setTimeout(() => {
    pauseBtn.disabled = false;
    pauseBtn.textContent = 'New Session';
    pauseBtn.addEventListener('click', () => {
      pauseBtn.addEventListener('click', togglePause);
      resetToSetup();
    }, { once: true });
  }, 2000);
}

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
  navigator.serviceWorker.register('service-worker.js');
}
