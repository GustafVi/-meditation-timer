// ===== Audio (module-level state — NEVER put Audio objects in $state) =====
// WebKit proxies break the Audio prototype chain if stored in reactive state.

let audioUnlocked = false
let chimeTimeouts = []       // setTimeout IDs for scheduled chimes
let ambientAudio = null      // looping near-silent <audio> to keep iOS audio session alive
let intervalChimeUrl = null  // blob URL for interval chime WAV
let sessionChimeUrl = null   // blob URL for session-complete chime WAV
let ambientUrl = null        // blob URL for ambient loop WAV
let intervalChimeAudio = null // pre-created <audio> for interval chime (reused)
let sessionChimeAudio = null  // pre-created <audio> for session chime (reused)

// --- WAV generation helpers ---
function writeWavHeader(view, sampleRate, numSamples) {
  const dataSize = numSamples * 2
  const fileSize = 44 + dataSize
  const writeStr = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)) }
  writeStr(0, 'RIFF')
  view.setUint32(4, fileSize - 8, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)  // PCM
  view.setUint16(22, 1, true)  // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeStr(36, 'data')
  view.setUint32(40, dataSize, true)
}

// Generate the interval chime: singing bowl with soft attack, harmonics, long resonant decay
function generateIntervalChimeWav() {
  const sampleRate = 44100
  const duration = 3.0
  const numSamples = Math.ceil(sampleRate * duration)
  const buffer = new ArrayBuffer(44 + numSamples * 2)
  const view = new DataView(buffer)
  writeWavHeader(view, sampleRate, numSamples)

  // Fundamental + slightly inharmonic partials (natural bowl character)
  const fundamental = 432.0 // A4 at 432hz — warmer than standard 440
  const harmonics = [
    { freq: fundamental,        amp: 0.55, decay: 1.8 },
    { freq: fundamental * 2.76, amp: 0.25, decay: 2.8 }, // slightly inharmonic 2nd partial
    { freq: fundamental * 5.1,  amp: 0.10, decay: 1.2 }, // higher partial fades faster
  ]
  const attackTime = 0.025 // 25ms soft attack

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate
    const attack = Math.min(t / attackTime, 1.0)
    let sample = 0
    for (const h of harmonics) {
      sample += h.amp * Math.exp(-h.decay * t) * Math.sin(2 * Math.PI * h.freq * t)
    }
    sample *= attack * 0.38 // moderate, calm volume
    view.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, sample * 32767)), true)
  }
  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }))
}

// Generate the session-complete sound: deep gong with slow bloom and long resonant tail
function generateSessionChimeWav() {
  const sampleRate = 44100
  const duration = 6.0 // long enough for the bloom to fully unfold
  const numSamples = Math.ceil(sampleRate * duration)
  const buffer = new ArrayBuffer(44 + numSamples * 2)
  const view = new DataView(buffer)
  writeWavHeader(view, sampleRate, numSamples)

  // Deep gong: low fundamental with rich inharmonic partials
  const fundamental = 110.0 // A2 — deep, chest-resonant
  const partials = [
    { freq: fundamental,        amp: 0.50, decay: 0.6,  attackTime: 0.04 },
    { freq: fundamental * 2.21, amp: 0.35, decay: 0.9,  attackTime: 0.06 },
    { freq: fundamental * 3.60, amp: 0.20, decay: 1.4,  attackTime: 0.10 },
    { freq: fundamental * 5.40, amp: 0.12, decay: 2.0,  attackTime: 0.15 },
    { freq: fundamental * 8.93, amp: 0.06, decay: 2.8,  attackTime: 0.20 },
  ]

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate
    let sample = 0
    for (const p of partials) {
      const attack = Math.min(t / p.attackTime, 1.0)
      sample += p.amp * attack * Math.exp(-p.decay * t) * Math.sin(2 * Math.PI * p.freq * t)
    }
    sample *= 0.55
    view.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, sample * 32767)), true)
  }
  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }))
}

// Generate a near-silent looping ambient tone (very low volume sine)
function generateAmbientWav() {
  const sampleRate = 8000
  const duration = 2 // 2-second loop
  const numSamples = sampleRate * duration
  const buffer = new ArrayBuffer(44 + numSamples * 2)
  const view = new DataView(buffer)
  writeWavHeader(view, sampleRate, numSamples)
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate
    // Barely audible 100 Hz tone
    const sample = 0.002 * Math.sin(2 * Math.PI * 100 * t)
    view.setInt16(44 + i * 2, sample * 32767, true)
  }
  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }))
}

// ===== Public API =====

/** Pre-generate all audio blobs at startup. Must be called before mount. */
export function initAudio() {
  intervalChimeUrl = generateIntervalChimeWav()
  sessionChimeUrl = generateSessionChimeWav()
  ambientUrl = generateAmbientWav()
}

/** Unlock iOS audio session from a user gesture. Idempotent. */
export function unlockAudio() {
  if (audioUnlocked) return
  audioUnlocked = true
  // Prime the ambient audio element from a user gesture (required by iOS)
  if (!ambientAudio) {
    ambientAudio = new Audio(ambientUrl)
    ambientAudio.loop = true
    ambientAudio.volume = 0.01
  }
  // Play + pause to unlock the audio element for later programmatic playback
  ambientAudio.play().then(() => { ambientAudio.pause() }).catch(() => {})
}

/**
 * Create and load chime <audio> elements. Must be called synchronously
 * inside a user gesture handler (e.g. the Start button's onclick) on iOS.
 */
export function createChimeElements() {
  intervalChimeAudio = new Audio(intervalChimeUrl)
  intervalChimeAudio.volume = 1.0
  sessionChimeAudio = new Audio(sessionChimeUrl)
  sessionChimeAudio.volume = 1.0
  // Prime both elements by loading them (avoids first-play latency on iOS)
  intervalChimeAudio.load()
  sessionChimeAudio.load()
}

export function playIntervalChime() {
  if (!intervalChimeAudio) return
  intervalChimeAudio.currentTime = 0
  intervalChimeAudio.play().catch(() => {})
}

export function playSessionChime() {
  if (!sessionChimeAudio) return
  sessionChimeAudio.currentTime = 0
  sessionChimeAudio.play().catch(() => {})
}

/** Start ambient keep-alive loop (holds iOS audio session open during meditation). */
export function startKeepAlive() {
  if (!ambientAudio) {
    ambientAudio = new Audio(ambientUrl)
    ambientAudio.loop = true
    ambientAudio.volume = 0.01
  }
  ambientAudio.currentTime = 0
  ambientAudio.play().catch(() => {})
}

export function stopKeepAlive() {
  if (ambientAudio) {
    ambientAudio.pause()
    ambientAudio.currentTime = 0
  }
}

/** Resume ambient if it was paused while screen was locked. */
export function ensureAmbientPlaying() {
  if (ambientAudio && ambientAudio.paused) {
    ambientAudio.play().catch(() => {})
  }
}

/**
 * Schedule all remaining chimes via setTimeout, based on current session state.
 * Pass raw state values — this is a pure computation with side-effect of setTimeout.
 */
export function scheduleAllChimes(intervals, totalSeconds, sessionStartTime, pausedElapsed) {
  cancelScheduledChimes()
  const elapsedMs = pausedElapsed + (Date.now() - sessionStartTime)
  const totalElapsed = Math.min(Math.floor(elapsedMs / 1000), totalSeconds)
  let accumulated = 0
  for (let i = 0; i < intervals.length; i++) {
    accumulated += intervals[i].seconds
    const delaySec = accumulated - totalElapsed
    if (delaySec <= 0) continue
    if (i < intervals.length - 1) {
      chimeTimeouts.push(setTimeout(playIntervalChime, delaySec * 1000))
    } else {
      chimeTimeouts.push(setTimeout(playSessionChime, delaySec * 1000))
    }
  }
}

export function cancelScheduledChimes() {
  chimeTimeouts.forEach(id => clearTimeout(id))
  chimeTimeouts = []
}

export function setupMediaSession(toggleFn) {
  if (!('mediaSession' in navigator)) return
  navigator.mediaSession.metadata = new MediaMetadata({
    title: 'Meditation Timer',
    artist: 'Session in progress',
  })
  navigator.mediaSession.setActionHandler('play', () => { toggleFn() })
  navigator.mediaSession.setActionHandler('pause', () => { toggleFn() })
}

export function clearMediaSession() {
  if (!('mediaSession' in navigator)) return
  navigator.mediaSession.metadata = null
  navigator.mediaSession.setActionHandler('play', null)
  navigator.mediaSession.setActionHandler('pause', null)
}
