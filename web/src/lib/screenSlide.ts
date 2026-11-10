import { cubicInOut } from 'svelte/easing'
import { fly, type FlyParams } from 'svelte/transition'

const DURATION_MS = 350

export function screenSlide(node: Element, direction: 1 | -1) {
  const params: FlyParams = { y: direction * window.innerHeight, duration: DURATION_MS, easing: cubicInOut, opacity: 0 }
  return fly(node, params)
}
