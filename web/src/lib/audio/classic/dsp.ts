import { clamp } from '../../math'

export { clamp }

export const TAU = Math.PI * 2

export function softClip(x: number): number {
  if (x >= 3) return 1
  if (x <= -3) return -1
  const x2 = x * x
  return (x * (27 + x2)) / (27 + 9 * x2)
}

export function smoothing(seconds: number, sampleRate: number): number {
  return 1 - Math.exp(-1 / (seconds * sampleRate))
}

export function decay(seconds: number, sampleRate: number): number {
  return Math.exp(-1 / (seconds * sampleRate))
}

export class Random {
  private state: number

  constructor(seed: number) {
    this.state = seed >>> 0 || 0x9e3779b9
  }

  next(): number {
    let x = this.state
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    this.state = x >>> 0
    return this.state / 4294967296
  }

  nextUint(): number {
    this.next()
    return this.state
  }

  white(): number {
    return this.next() * 2 - 1
  }

  gauss(): number {
    return (this.next() + this.next() + this.next() - 1.5) * 2
  }
}

export class Biquad {
  private b0 = 1
  private b1 = 0
  private b2 = 0
  private a1 = 0
  private a2 = 0
  private z1 = 0
  private z2 = 0

  lowpass(sampleRate: number, frequency: number, q = Math.SQRT1_2): this {
    const { cos, alpha } = this.prepare(sampleRate, frequency, q)
    return this.set((1 - cos) / 2, 1 - cos, (1 - cos) / 2, 1 + alpha, -2 * cos, 1 - alpha)
  }

  highpass(sampleRate: number, frequency: number, q = Math.SQRT1_2): this {
    const { cos, alpha } = this.prepare(sampleRate, frequency, q)
    return this.set((1 + cos) / 2, -(1 + cos), (1 + cos) / 2, 1 + alpha, -2 * cos, 1 - alpha)
  }

  bandpass(sampleRate: number, frequency: number, q: number): this {
    const { cos, alpha } = this.prepare(sampleRate, frequency, q)
    return this.set(alpha, 0, -alpha, 1 + alpha, -2 * cos, 1 - alpha)
  }

  peak(sampleRate: number, frequency: number, q: number, gainDb: number): this {
    const a = Math.pow(10, gainDb / 40)
    const { cos, alpha } = this.prepare(sampleRate, frequency, q)
    return this.set(1 + alpha * a, -2 * cos, 1 - alpha * a, 1 + alpha / a, -2 * cos, 1 - alpha / a)
  }

  run(x: number): number {
    const y = this.b0 * x + this.z1
    this.z1 = this.b1 * x - this.a1 * y + this.z2
    this.z2 = this.b2 * x - this.a2 * y
    return y
  }

  private prepare(sampleRate: number, frequency: number, q: number) {
    const w = (TAU * Math.min(frequency, sampleRate * 0.45)) / sampleRate
    return { cos: Math.cos(w), alpha: Math.sin(w) / (2 * q) }
  }

  private set(b0: number, b1: number, b2: number, a0: number, a1: number, a2: number): this {
    this.b0 = b0 / a0
    this.b1 = b1 / a0
    this.b2 = b2 / a0
    this.a1 = a1 / a0
    this.a2 = a2 / a0
    return this
  }
}

export class Resonator {
  private buffer: Float32Array
  private mask: number
  private write = 0
  private delay: number
  private feedback: number
  private damping: number
  private state = 0

  constructor(delaySamples: number, feedback: number, damping: number) {
    let size = 64
    while (size < delaySamples + 4) size *= 2
    this.buffer = new Float32Array(size)
    this.mask = size - 1
    this.delay = clamp(delaySamples, 2, size - 3)
    this.feedback = feedback
    this.damping = damping
  }

  run(x: number): number {
    const read = this.write - this.delay
    const index = Math.floor(read)
    const fraction = read - index
    const a = this.buffer[index & this.mask]
    const b = this.buffer[(index + 1) & this.mask]
    this.state += (a + (b - a) * fraction - this.state) * this.damping
    if (Math.abs(this.state) < 1e-18) this.state = 0
    this.buffer[this.write] = x + this.feedback * this.state
    this.write = (this.write + 1) & this.mask
    return this.state
  }
}
