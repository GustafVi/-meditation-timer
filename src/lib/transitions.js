import { cubicOut } from 'svelte/easing'

export function screenEnter(node, { duration = 280 } = {}) {
  return {
    duration,
    css: t => {
      const e = cubicOut(t)
      return `opacity:${e}; transform:translateY(${(1 - e) * 6}px)`
    }
  }
}

export function screenExit(_, { duration = 220 } = {}) {
  return { duration, css: t => `opacity:${t}` }
}
