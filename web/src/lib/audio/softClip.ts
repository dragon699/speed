const KNEE = 0.9
const CURVE_POINTS = 4096

export const CLIP_HEADROOM = 1.5

export function softClip(sample: number): number {
  const magnitude = Math.abs(sample)
  if (magnitude <= KNEE) return sample

  const room = 1 - KNEE
  return Math.sign(sample) * (KNEE + room * Math.tanh((magnitude - KNEE) / room))
}

export function softClipCurve(): Float32Array<ArrayBuffer> {
  return Float32Array.from({ length: CURVE_POINTS }, (_, index) => softClip(((index / (CURVE_POINTS - 1)) * 2 - 1) * CLIP_HEADROOM))
}
