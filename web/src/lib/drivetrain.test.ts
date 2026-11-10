import { describe, expect, it } from 'vitest'
import { Drivetrain, engineRpm, upshiftRpm, wheelRpm } from './drivetrain'
import { engineProfiles } from './engines'

const v8 = engineProfiles.find((profile) => profile.id === 'v8-na-50')!

function cruise(drivetrain: Drivetrain, kmh: number) {
  let state = drivetrain.update(kmh / 3.6, 0.1)
  for (let i = 0; i < 50; i++) state = drivetrain.update(kmh / 3.6, 0.1)
  return state
}

describe('drivetrain', () => {
  it('converts speed to wheel rpm', () => {
    expect(wheelRpm(27.78, 2.1)).toBeCloseTo(793.7, 0)
  })

  it('uses the engine car tyre and overall ratios', () => {
    const rpm = engineRpm(v8, 100 / 3.6, v8.gears.length)
    expect(rpm).toBeCloseTo((100 / 3.6 / v8.tireCircumference) * 60 * v8.gears[v8.gears.length - 1], 6)
  })

  it('idles when stationary', () => {
    const state = cruise(new Drivetrain(v8), 0)
    expect(state.gear).toBe(1)
    expect(state.rpm).toBeGreaterThanOrEqual(v8.idle)
    expect(state.moving).toBe(false)
  })

  it('cruises in a high gear below the cruise upshift point', () => {
    const state = cruise(new Drivetrain(v8), 100)
    expect(state.gear).toBeGreaterThanOrEqual(4)
    expect(state.targetRpm).toBeLessThan(upshiftRpm(v8, 0) + 1)
  })

  it('holds lower gears to higher rpm under full load', () => {
    const drivetrain = new Drivetrain(v8)
    let state = drivetrain.update(0, 0.1)
    for (let kmh = 0; kmh <= 100; kmh += 1) state = drivetrain.update(kmh / 3.6, 0.0926)
    expect(state.load).toBeGreaterThan(0.8)
    expect(state.targetRpm).toBeGreaterThan(4000)
  })

  it('never exceeds the limiter', () => {
    const state = cruise(new Drivetrain(v8), 400)
    expect(state.targetRpm).toBeLessThanOrEqual(v8.limiterRpm)
  })

  it('free revs to the limiter while stopped and falls back with overrun', () => {
    const drivetrain = new Drivetrain(v8)
    let state = drivetrain.update(0, 0.1, { rev: true })
    for (let i = 0; i < 30; i++) state = drivetrain.update(0, 0.1, { rev: true })
    expect(state.rpm).toBe(v8.limiterRpm)
    expect(state.limiter).toBe(true)
    state = drivetrain.update(0, 0.1)
    expect(state.overrun).toBeGreaterThan(0)
    expect(state.load).toBe(0)
    for (let i = 0; i < 40; i++) state = drivetrain.update(0, 0.1)
    expect(state.rpm).toBe(v8.idle)
  })

  it('shifts up through the gears while accelerating', () => {
    const drivetrain = new Drivetrain(v8)
    const gears = new Set<number>()
    for (let kmh = 1; kmh <= 150; kmh += 1) gears.add(drivetrain.update(kmh / 3.6, 0.0926).gear)
    expect(gears.size).toBeGreaterThan(2)
  })

  it('reports overrun while decelerating', () => {
    const drivetrain = new Drivetrain(v8)
    cruise(drivetrain, 80)
    let state = drivetrain.update(78 / 3.6, 0.1)
    for (let kmh = 76; kmh > 50; kmh -= 2) state = drivetrain.update(kmh / 3.6, 0.1)
    expect(state.overrun).toBeGreaterThan(0.1)
    expect(state.load).toBe(0)
  })

  it('follows measured acceleration within a few frames', () => {
    const drivetrain = new Drivetrain(v8)
    cruise(drivetrain, 50)

    let state = drivetrain.update(50 / 3.6, 1 / 60, { accel: 3 })
    for (let frame = 1; frame < 6; frame++) state = drivetrain.update(50 / 3.6, 1 / 60, { accel: 3 })
    expect(state.load).toBeGreaterThan(0.9)

    state = drivetrain.update(50 / 3.6, 1 / 60, { accel: -2 })
    expect(state.overrun).toBeGreaterThan(0.5)
  })

  it('does not hunt between gears at a steady speed', () => {
    const drivetrain = new Drivetrain(v8)
    cruise(drivetrain, 60)
    const gears = new Set<number>()
    for (let i = 0; i < 100; i++) gears.add(drivetrain.update((60 + Math.sin(i) * 0.5) / 3.6, 0.1).gear)
    expect(gears.size).toBe(1)
  })
})
