export type Path = 'webrtc' | 'relay'

export interface LatencySummary {
  p50: number
  p95: number
  webrtcShare: number
}

const WINDOW_MS = 10000

interface Sample {
  at: number
  ms: number
  path: Path
}

export class LatencyMeter {
  private samples: Sample[] = []

  add(ms: number, path: Path, at = performance.now()) {
    this.samples.push({ at, ms, path })
    while (this.samples.length && at - this.samples[0].at > WINDOW_MS) this.samples.shift()
  }

  summary(): LatencySummary | null {
    if (!this.samples.length) return null

    const sorted = this.samples.map((sample) => sample.ms).sort((a, b) => a - b)
    const webrtc = this.samples.filter((sample) => sample.path === 'webrtc').length

    return {
      p50: percentile(sorted, 0.5),
      p95: percentile(sorted, 0.95),
      webrtcShare: webrtc / this.samples.length
    }
  }
}

function percentile(sorted: number[], share: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))]
}
