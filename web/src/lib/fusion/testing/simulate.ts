import type { GpsFix } from '../../sensors/gps'
import type { MotionSample } from '../../sensors/motion'
import { add, type Vec3 } from '../vector'

const GRAVITY = 9.81
const MOTION_HZ = 60
const GPS_INTERVAL_S = 1
const JERK_TAU_S = 0.3

export type Segment = [seconds: number, longitudinal: number, lateral: number]

export type Rotation = [Vec3, Vec3, Vec3]

export interface SimulationOptions {
  seed?: number
  segments?: Segment[]
  rotation?: Rotation
  movedAt?: number
  movedRotation?: Rotation
  bias?: Vec3
  accelNoise?: number
  gpsNoise?: number
  gpsDelayS?: number
  gpsLagTauS?: number
}

export type SimulationEvent = { at: number; motion: MotionSample } | { at: number; fix: GpsFix }

export interface Simulation {
  events: SimulationEvent[]
  truth: (t: number) => number
  rotationAt: (t: number) => Rotation
  duration: number
}

export const DRIVE: Segment[] = [
  [6, 0, 0],
  [8, 2.5, 0],
  [6, 0, 0],
  [4, 0, 2.5],
  [5, -2, 0],
  [6, 1.5, 0],
  [8, 0, -1.5],
  [4, 3, 0],
  [10, 0, 0],
  [8, -3, 0],
  [3, -2.4, 0],
  [8, 0, 0],
  [7, 3, 0],
  [5, -1.5, 1],
  [10, 1, 0],
  [6, 0, -2],
  [6, -3, 0],
  [8, 0, 0],
  [6, 2, 0],
  [10, 0, 0],
  [5, 1.5, 0],
  [8, -2.5, 0],
  [6, 0, 0]
]

export function random(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

export function gaussian(next: () => number): () => number {
  return () => Math.sqrt(-2 * Math.log(Math.max(next(), 1e-12))) * Math.cos(2 * Math.PI * next())
}

export function rotation(yawDeg: number, pitchDeg: number, rollDeg: number): Rotation {
  const [y, p, r] = [yawDeg, pitchDeg, rollDeg].map((deg) => (deg * Math.PI) / 180)
  const [cy, sy, cp, sp, cr, sr] = [Math.cos(y), Math.sin(y), Math.cos(p), Math.sin(p), Math.cos(r), Math.sin(r)]

  return [
    [cy * cp, cy * sp * sr - sy * cr, cy * sp * cr + sy * sr],
    [sy * cp, sy * sp * sr + cy * cr, sy * sp * cr - cy * sr],
    [-sp, cp * sr, cp * cr]
  ]
}

export function apply(matrix: Rotation, vector: Vec3): Vec3 {
  return matrix.map((row) => row[0] * vector[0] + row[1] * vector[1] + row[2] * vector[2]) as Vec3
}

export function compose(a: Rotation, b: Rotation): Rotation {
  return a.map((row) => [0, 1, 2].map((column) => row[0] * b[0][column] + row[1] * b[1][column] + row[2] * b[2][column])) as Rotation
}

export function deviceForward(matrix: Rotation): Vec3 {
  return apply(matrix, [1, 0, 0])
}

export function simulate(options: SimulationOptions = {}): Simulation {
  const next = random(options.seed ?? 1)
  const noise = gaussian(next)
  const segments = options.segments ?? DRIVE
  const mounted = options.rotation ?? rotation(37, 64, -12)
  const moved = options.movedRotation ?? rotation(-118, 20, 30)
  const rotationAt = (t: number) => (options.movedAt !== undefined && t >= options.movedAt ? moved : mounted)
  const bias = options.bias ?? [0.06, -0.04, 0.03]
  const accelNoise = options.accelNoise ?? 0.3
  const gpsNoise = options.gpsNoise ?? 0.15
  const gpsDelay = options.gpsDelayS ?? 0.4
  const gpsLagTau = options.gpsLagTauS ?? 0.3
  const duration = segments.reduce((sum, segment) => sum + segment[0], 0)

  const dt = 1 / MOTION_HZ
  const speeds: number[] = []
  const events: SimulationEvent[] = []
  let speed = 0
  let lagged = 0
  let longitudinal = 0
  let lateral = 0
  let nextFix = GPS_INTERVAL_S * next()
  let segmentIndex = 0
  let segmentEnd = segments[0][0]

  for (let step = 0; step * dt < duration; step++) {
    const t = step * dt
    while (t >= segmentEnd && segmentIndex < segments.length - 1) segmentEnd += segments[++segmentIndex][0]

    const [, targetLong, targetLat] = segments[segmentIndex]
    const smoothing = 1 - Math.exp(-dt / JERK_TAU_S)
    longitudinal += (targetLong - longitudinal) * smoothing
    lateral += (targetLat - lateral) * smoothing

    const actual = speed <= 0 && longitudinal < 0 ? 0 : longitudinal
    const sideways = speed > 1 ? lateral : 0
    speed = Math.max(0, speed + actual * dt)
    lagged += (speed - lagged) * (1 - Math.exp(-dt / gpsLagTau))
    speeds.push(speed)

    const matrix = rotationAt(t)
    const carAccel: Vec3 = [actual, sideways, 0]
    const jitter = (): Vec3 => [noise() * accelNoise, noise() * accelNoise, noise() * accelNoise]
    const linear = add(add(apply(matrix, carAccel), bias), jitter())
    const accel = add(apply(matrix, [actual, sideways, GRAVITY]), add(bias, jitter()))

    events.push({ at: t * 1000, motion: { t: t * 1000, accel, linear, rotation: [0, 0, 0] } })

    if (t >= nextFix) {
      const measured = Math.max(0, lagged + noise() * gpsNoise)
      events.push({ at: (t + gpsDelay) * 1000, fix: { t: t * 1000, speed: measured, accuracy: 4, derived: false } })
      nextFix += GPS_INTERVAL_S * (0.95 + 0.1 * next())
    }
  }

  events.sort((a, b) => a.at - b.at)

  return {
    events,
    truth: (t: number) => speeds[Math.min(speeds.length - 1, Math.max(0, Math.round((t / 1000) * MOTION_HZ)))],
    rotationAt,
    duration
  }
}
