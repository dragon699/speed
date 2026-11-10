import { describe, expect, it } from 'vitest'
import { LatencyMeter } from './latency'

describe('latency meter', () => {
  it('reports median, p95 and the share of WebRTC deliveries', () => {
    const meter = new LatencyMeter()
    for (let i = 1; i <= 100; i++) meter.add(i, i % 4 === 0 ? 'relay' : 'webrtc', 1000 + i)

    expect(meter.summary()).toEqual({ p50: 51, p95: 96, webrtcShare: 0.75 })
  })

  it('forgets samples older than ten seconds', () => {
    const meter = new LatencyMeter()
    meter.add(500, 'relay', 0)
    meter.add(80, 'webrtc', 11000)

    expect(meter.summary()).toEqual({ p50: 80, p95: 80, webrtcShare: 1 })
  })

  it('has nothing to report before the first sample', () => {
    expect(new LatencyMeter().summary()).toBeNull()
  })
})
