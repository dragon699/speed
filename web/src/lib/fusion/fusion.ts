import { FrameKind, type Frame } from '../protocol'
import { GOOD_ACCURACY_M, type GpsFix } from '../sensors/gps'
import type { MotionSample } from '../sensors/motion'
import { readStorage, writeStorage } from '../storage'
import { MountEstimator, type MountSnapshot } from './mount'
import { OneEuroFilter } from './oneEuro'
import { SpeedFilter } from './speedFilter'
import { dot } from './vector'

const ACCEL_FILTER = { minCutoffHz: 1, beta: 0.1, derivativeCutoffHz: 1 }
const GPS_SPEED_SIGMA = 0.4
const DERIVED_SIGMA_FACTOR = 3

export interface FusionStatus {
  calibrated: boolean
  progress: number
  resets: number
}

export class SpeedFusion {
  readonly mount = new MountEstimator()
  readonly filter = new SpeedFilter()

  private accelFilter = new OneEuroFilter(ACCEL_FILTER)

  private active = false
  private lastFix: GpsFix | null = null
  private lastT: number | null = null

  constructor(snapshot: MountSnapshot | null = null) {
    this.mount.restore(snapshot)
  }

  get status(): FusionStatus {
    return { calibrated: this.active, progress: this.mount.progress, resets: this.mount.resets }
  }

  get speed(): number {
    return this.filter.speed
  }

  get accel(): number {
    return this.accelFilter.value
  }

  addFix(fix: GpsFix) {
    this.mount.addFix(fix)
    this.lastFix = fix

    if (this.active) this.filter.correct(fix.t, fix.speed, gpsSigma(fix))
  }

  addMotion(sample: MotionSample): Frame[] {
    const dt = this.lastT === null ? 0 : Math.max(0, (sample.t - this.lastT) / 1000)
    this.lastT = sample.t

    const horizontal = this.mount.addMotion(sample)
    const forward = this.mount.forward

    if (!horizontal || !forward || !this.mount.calibrated) {
      this.active = false
      return []
    }

    if (!this.active) {
      this.filter.reset(sample.t, this.lastFix?.speed ?? 0)
      this.accelFilter.reset()
      this.active = true
    }

    const measured = dot(horizontal, forward)
    this.filter.predict(sample.t, measured)
    this.accelFilter.update(measured - this.filter.bias, dt)

    return [
      { t: sample.t, kind: FrameKind.FusedSpeed, value: this.filter.speed },
      { t: sample.t, kind: FrameKind.FusedAccel, value: this.accelFilter.value }
    ]
  }
}

export function loadMount(): MountSnapshot | null {
  try {
    const snapshot = JSON.parse(readStorage('mount') ?? 'null') as MountSnapshot | null
    return snapshot?.down?.length === 3 && snapshot.forward?.length === 3 ? snapshot : null
  } catch {
    return null
  }
}

export function saveMount(snapshot: MountSnapshot) {
  writeStorage('mount', JSON.stringify(snapshot))
}

function gpsSigma(fix: GpsFix): number {
  const sigma = GPS_SPEED_SIGMA * Math.max(1, fix.accuracy / GOOD_ACCURACY_M)
  return fix.derived ? sigma * DERIVED_SIGMA_FACTOR : sigma
}
