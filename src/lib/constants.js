export const CIRCUMFERENCE = 2 * Math.PI * 90 // 565.48

export const SEGMENT_COLORS = [
  '#b89dde', '#e8b870', '#7c5abf', '#6de8b4',
  '#de9db8', '#70b8e8', '#cbb8f0', '#b8de70',
]

export const DATA_VERSION = 1

export const BUILTIN_PRESETS = [
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
]

export function formatTime(sec) {
  const m = Math.floor(sec / 60).toString().padStart(2, '0')
  const s = (sec % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}
