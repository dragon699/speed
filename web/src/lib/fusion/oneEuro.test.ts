import { describe, expect, it } from 'vitest'
import { OneEuroFilter } from './oneEuro'
import { gaussian, random } from './testing/simulate'

const DT = 1 / 60

function filter() {
  return new OneEuroFilter({ minCutoffHz: 1, beta: 0.1, derivativeCutoffHz: 1 })
}

describe('one euro filter', () => {
  it('smooths sensor noise while holding still', () => {
    const noise = gaussian(random(5))
    const smoothed = filter()
    const outputs = Array.from({ length: 300 }, () => smoothed.update(noise() * 0.3, DT)).slice(60)
    const spread = Math.sqrt(outputs.reduce((sum, value) => sum + value * value, 0) / outputs.length)

    expect(spread).toBeLessThan(0.1)
  })

  it('follows a sudden change within about 100 ms', () => {
    const smoothed = filter()
    for (let i = 0; i < 120; i++) smoothed.update(0, DT)

    let frames = 0
    while (smoothed.update(2.5, DT) < 2.25) frames++

    expect(frames * DT).toBeLessThan(0.12)
  })
})
