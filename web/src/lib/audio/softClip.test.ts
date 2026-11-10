import { describe, expect, it } from 'vitest'
import { CLIP_HEADROOM, softClip, softClipCurve } from './softClip'

describe('soft clip', () => {
  it('leaves normal levels untouched', () => {
    expect(softClip(0.5)).toBe(0.5)
    expect(softClip(-0.9)).toBe(-0.9)
  })

  it('rounds off peaks and never exceeds full scale', () => {
    expect(softClip(1.1)).toBeGreaterThan(0.9)
    expect(softClip(1.1)).toBeLessThan(1)
    expect(Math.max(...softClipCurve().map(Math.abs))).toBeLessThanOrEqual(1)
  })

  it('maps the curve input range to the headroom', () => {
    const curve = softClipCurve()
    expect(curve[curve.length - 1]).toBeCloseTo(softClip(CLIP_HEADROOM), 6)
    expect(curve[Math.floor(curve.length / 2)]).toBeCloseTo(0, 3)
  })
})
