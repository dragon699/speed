export const THIRD_OCTAVES = [
  40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000
]

export const FLATNESS_OCTAVES = [125, 250, 500, 1000, 2000, 4000]

const FFT_SIZE = 16384
const BAND_CLIP_DB = 25
const ORDER_CLIP_DB = 30

export interface Features {
  bands: number[]
  orders: number[]
  flatness: number[]
  crest: number
  cycleHz: number
}

export interface FeatureWeights {
  bands: number
  orders: number
  flatness: number
  crest: number
}

export const DEFAULT_WEIGHTS: FeatureWeights = { bands: 1, orders: 0.5, flatness: 10, crest: 2 }

export function fft(re: Float64Array, im: Float64Array) {
  const n = re.length

  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j], re[i]]
      ;[im[i], im[j]] = [im[j], im[i]]
    }
  }

  for (let length = 2; length <= n; length <<= 1) {
    const angle = (-2 * Math.PI) / length
    const half = length / 2

    for (let i = 0; i < n; i += length) {
      for (let k = 0; k < half; k++) {
        const wr = Math.cos(angle * k)
        const wi = Math.sin(angle * k)
        const a = i + k
        const b = a + half
        const vr = re[b] * wr - im[b] * wi
        const vi = re[b] * wi + im[b] * wr

        re[b] = re[a] - vr
        im[b] = im[a] - vi
        re[a] += vr
        im[a] += vi
      }
    }
  }
}

export function powerSpectrum(signal: Float32Array, size = FFT_SIZE): Float64Array {
  const power = new Float64Array(size / 2)
  const window = new Float64Array(size)
  let frames = 0

  for (let i = 0; i < size; i++) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1))

  for (let start = 0; start + size <= signal.length; start += size / 2) {
    const re = new Float64Array(size)
    const im = new Float64Array(size)

    for (let i = 0; i < size; i++) re[i] = signal[start + i] * window[i]
    fft(re, im)
    for (let k = 0; k < power.length; k++) power[k] += re[k] * re[k] + im[k] * im[k]
    frames++
  }

  for (let k = 0; k < power.length; k++) power[k] /= Math.max(frames, 1)

  return power
}

function peakAround(power: Float64Array, bin: number, radius: number): number {
  let peak = 0

  for (let k = Math.max(1, Math.round(bin) - radius); k <= Math.min(power.length - 1, Math.round(bin) + radius); k++) {
    peak = Math.max(peak, power[k])
  }

  return peak
}

export function detectCycleHz(power: Float64Array, sampleRate: number, expectedHz: number, harmonics: number): number {
  const binHz = sampleRate / (2 * power.length)
  let best = expectedHz
  let bestScore = -Infinity

  for (let candidate = expectedHz * 0.94; candidate <= expectedHz * 1.06; candidate += binHz / harmonics / 2) {
    let score = 0
    for (let h = 1; h <= harmonics; h++) score += Math.log(peakAround(power, (candidate * h) / binHz, 0) + 1e-20)
    if (score > bestScore) {
      bestScore = score
      best = candidate
    }
  }

  return best
}

function bandLevels(power: Float64Array, sampleRate: number): number[] {
  const binHz = sampleRate / (2 * power.length)
  const energy = THIRD_OCTAVES.map((center) => {
    const low = center / Math.pow(2, 1 / 6)
    const high = center * Math.pow(2, 1 / 6)
    let sum = 0
    for (let k = Math.ceil(low / binHz); k < Math.min(power.length, high / binHz); k++) sum += power[k]
    return sum
  })
  const total = energy.reduce((a, b) => a + b, 0) || 1

  return energy.map((e) => 10 * Math.log10(e / total + 1e-12))
}

function orderLevels(power: Float64Array, sampleRate: number, cycleHz: number, harmonics: number): number[] {
  const binHz = sampleRate / (2 * power.length)
  const levels: number[] = []

  for (let h = 1; h <= harmonics; h++) levels.push(10 * Math.log10(peakAround(power, (cycleHz * h) / binHz, 1) + 1e-20))

  const max = Math.max(...levels)

  return levels.map((level) => level - max)
}

function flatness(power: Float64Array, sampleRate: number): number[] {
  const binHz = sampleRate / (2 * power.length)

  return FLATNESS_OCTAVES.map((center) => {
    let logSum = 0
    let sum = 0
    let count = 0

    for (let k = Math.ceil(center / Math.SQRT2 / binHz); k < Math.min(power.length, (center * Math.SQRT2) / binHz); k++) {
      logSum += Math.log(power[k] + 1e-20)
      sum += power[k]
      count++
    }

    return count ? Math.exp(logSum / count) / (sum / count + 1e-20) : 0
  })
}

function crestFactor(signal: Float32Array): number {
  const sorted = Float32Array.from(signal, Math.abs).sort()
  let sumSquares = 0

  for (const value of signal) sumSquares += value * value

  const rms = Math.sqrt(sumSquares / signal.length) || 1
  return sorted[Math.floor(sorted.length * 0.999)] / rms
}

export function analyze(signal: Float32Array, sampleRate: number, rpm: number, cylinders: number, detect = false): Features {
  const power = powerSpectrum(signal)
  const harmonics = cylinders * 2
  const expected = rpm / 120
  const cycleHz = detect ? detectCycleHz(power, sampleRate, expected, harmonics) : expected

  return {
    bands: bandLevels(power, sampleRate),
    orders: orderLevels(power, sampleRate, cycleHz, harmonics),
    flatness: flatness(power, sampleRate),
    crest: crestFactor(signal),
    cycleHz
  }
}

function meanAbsDiff(a: number[], b: number[], clip: number): number {
  let sum = 0

  for (let i = 0; i < a.length; i++) sum += Math.min(Math.abs(a[i] - b[i]), clip)

  return sum / a.length
}

export function distance(ours: Features, reference: Features, weights: FeatureWeights = DEFAULT_WEIGHTS) {
  const parts = {
    bands: meanAbsDiff(ours.bands, reference.bands, BAND_CLIP_DB),
    orders: meanAbsDiff(ours.orders, reference.orders, ORDER_CLIP_DB),
    flatness: meanAbsDiff(ours.flatness, reference.flatness, 1),
    crest: Math.abs(ours.crest - reference.crest)
  }

  return {
    ...parts,
    total:
      parts.bands * weights.bands + parts.orders * weights.orders + parts.flatness * weights.flatness + parts.crest * weights.crest
  }
}
