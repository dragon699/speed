import { describe, expect, it } from 'vitest'
import { SpeedFusion } from './fusion'
import { DRIVE, compose, deviceForward, rotation, simulate, type Simulation, type SimulationOptions } from './testing/simulate'
import { angleDeg } from './vector'

interface Point {
  t: number
  truth: number
  fused: number | null
  gps: number
  calibrated: boolean
}

function run(simulation: Simulation, fusion = new SpeedFusion()): Point[] {
  const points: Point[] = []
  let gps = 0

  for (const event of simulation.events) {
    if ('fix' in event) {
      fusion.addFix(event.fix)
      gps = event.fix.speed
      continue
    }

    fusion.addMotion(event.motion)
    const calibrated = fusion.status.calibrated
    points.push({ t: event.motion.t, truth: simulation.truth(event.motion.t), fused: calibrated ? fusion.speed : null, gps, calibrated })
  }

  return points
}

function rmse(points: Point[], pick: (point: Point) => number): number {
  return Math.sqrt(points.reduce((sum, point) => sum + (pick(point) - point.truth) ** 2, 0) / points.length)
}

function firstCalibrated(points: Point[]): number {
  return (points.find((point) => point.calibrated)?.t ?? Infinity) / 1000
}

function launchDelay(points: Point[], from: number, threshold: number, pick: (point: Point) => number | null): number {
  const after = points.filter((point) => point.t >= from * 1000)
  const truth = after.find((point) => point.truth >= threshold)!.t
  const measured = after.find((point) => (pick(point) ?? 0) >= threshold)!.t
  return (measured - truth) / 1000
}

function drive(options: SimulationOptions = {}) {
  const simulation = simulate(options)
  const fusion = new SpeedFusion()
  return { simulation, fusion, points: run(simulation, fusion) }
}

describe('speed fusion', () => {
  it('learns which way the phone faces from the first accelerations', () => {
    const { simulation, fusion, points } = drive()

    expect(firstCalibrated(points)).toBeLessThan(25)
    expect(angleDeg(fusion.mount.forward!, deviceForward(simulation.rotationAt(0)))).toBeLessThan(8)
  })

  it.each([1, 2, 3, 4, 5])('works for any mounting angle (seed %i)', (seed) => {
    const next = Math.sin(seed * 12.9898) * 43758.5453
    const yaw = (next - Math.floor(next)) * 360 - 180
    const { simulation, fusion, points } = drive({ seed, rotation: rotation(yaw, seed * 17 - 40, seed * 23 - 60) })

    expect(firstCalibrated(points)).toBeLessThan(40)
    expect(angleDeg(fusion.mount.forward!, deviceForward(simulation.rotationAt(0)))).toBeLessThan(10)
  })

  it('tracks speed much closer than raw GPS', () => {
    const { points } = drive()
    const calibrated = points.filter((point) => point.calibrated)

    expect(rmse(calibrated, (point) => point.fused!)).toBeLessThan(0.5 * rmse(calibrated, (point) => point.gps))
    expect(rmse(calibrated, (point) => point.fused!)).toBeLessThan(0.45)
  })

  it('reacts to a launch from a stop much sooner than GPS', () => {
    const { points } = drive()
    const launchAt = DRIVE.slice(0, 12).reduce((sum, segment) => sum + segment[0], 0)

    expect(launchDelay(points, launchAt, 3, (point) => point.fused)).toBeLessThan(0.25)
    expect(launchDelay(points, launchAt, 3, (point) => point.gps)).toBeGreaterThan(0.8)
  })

  it('stays at zero while stopped', () => {
    const { points } = drive()
    const stopStart = DRIVE.slice(0, 11).reduce((sum, segment) => sum + segment[0], 0) + 2
    const stopped = points.filter((point) => point.t >= stopStart * 1000 && point.t < (stopStart + 5) * 1000)

    expect(Math.max(...stopped.map((point) => point.fused ?? 0))).toBeLessThan(0.5)
  })

  it('learns the accelerometer bias', () => {
    const { fusion, points } = drive({ bias: [0.25, -0.2, 0.15] })
    const calibrated = points.filter((point) => point.calibrated)

    expect(rmse(calibrated, (point) => point.fused!)).toBeLessThan(0.8)
    expect(Math.abs(fusion.filter.bias)).toBeGreaterThan(0.05)
  })

  it('estimates how far GPS lags behind', () => {
    expect(drive({ gpsDelayS: 0, gpsLagTauS: 0.05 }).fusion.filter.lagMs).toBeLessThanOrEqual(200)
    expect(drive({ gpsDelayS: 1, gpsLagTauS: 0.8 }).fusion.filter.lagMs).toBeGreaterThanOrEqual(400)
  })

  it('falls back to GPS when the phone is moved and relearns the new mount', () => {
    const movedAt = 70
    const { simulation, fusion, points } = drive({ movedAt })
    const afterMove = points.filter((point) => point.t > (movedAt + 2) * 1000)

    expect(fusion.mount.resets).toBe(1)
    expect(afterMove[0].calibrated).toBe(false)
    expect(afterMove.some((point) => point.calibrated)).toBe(true)
    expect(angleDeg(fusion.mount.forward!, deviceForward(simulation.rotationAt(movedAt + 1)))).toBeLessThan(10)
  })

  it('locks back in when the phone goes back into its holder', () => {
    const movedAt = 70
    const returnedAt = 85
    const { points } = drive({ movedAt, returnedAt })
    const justMoved = points.find((point) => point.t > (movedAt + 2) * 1000)!
    const back = points.find((point) => point.t > (returnedAt + 2) * 1000 && point.calibrated)!

    expect(justMoved.calibrated).toBe(false)
    const settled = points.filter((point) => point.t > back.t + 2000 && point.t < back.t + 8000)

    expect(back.t / 1000 - returnedAt).toBeLessThan(3)
    expect(settled.every((point) => point.calibrated)).toBe(true)
    expect(rmse(settled, (point) => point.fused!)).toBeLessThan(0.6)
  })

  it('reuses the saved mount right away on the next drive', () => {
    const first = drive()
    const snapshot = first.fusion.mount.snapshot()
    const second = run(simulate({ seed: 9 }), new SpeedFusion(snapshot))

    expect(firstCalibrated(second)).toBeLessThan(1.5)
  })

  it('drops a saved mount that no longer matches', () => {
    const first = drive()
    const snapshot = first.fusion.mount.snapshot()!
    const turned = compose(rotation(37, 64, -12), rotation(120, 0, 0))
    const fusion = new SpeedFusion(snapshot)
    run(simulate({ seed: 9, rotation: turned }), fusion)

    expect(angleDeg(fusion.mount.forward!, deviceForward(turned))).toBeLessThan(10)
  })
})

