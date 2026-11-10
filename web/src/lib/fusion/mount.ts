import { GOOD_ACCURACY_M, type GpsFix } from '../sensors/gps'
import type { MotionSample } from '../sensors/motion'
import { angleDeg, dot, lerp, normalize, reject, scale, sub, ZERO, type Vec3 } from './vector'

const GRAVITY_TAU_S = 0.5
const RAW_GRAVITY_TAU_S = 2
const SETTLE_S = 1
const MOVED_DEG = 20
const MOVED_HOLD_S = 1
const RESTORE_MAX_DEG = 10
const MIN_INTERVAL_S = 0.5
const MAX_INTERVAL_S = 3
const MIN_INTERVAL_SAMPLES = 5
const MIN_LEARNING_SPEED = 1
const HISTORY_S = 5
const MEMORY_EXCITATION = 40
const MIN_EXCITATION = 6
const MIN_CORRELATION = 0.8
const MIN_KEEP_CORRELATION = 0.6
const VERIFY_EXCITATION = 1.5
const MIN_RESTORED_CORRELATION = 0.5

export interface MountSnapshot {
  down: Vec3
  forward: Vec3
}

interface Sample {
  t: number
  horizontal: Vec3
}

type Matrix3 = [number, number, number, number, number, number, number, number, number]

export class MountEstimator {
  down: Vec3 | null = null
  forward: Vec3 | null = null
  resets = 0

  private gravity: Vec3 | null = null
  private settledAt: number | null = null
  private anchor: Vec3 | null = null
  private movedSince: number | null = null
  private saved: MountSnapshot | null = null
  private restored = false
  private locked = false
  private lastT: number | null = null
  private lastFix: GpsFix | null = null
  private history: Sample[] = []
  private correlation: Vec3 = ZERO
  private moment: Matrix3 = [0, 0, 0, 0, 0, 0, 0, 0, 0]
  private excitation = 0

  get progress(): number {
    if (this.restored) return 1
    return Math.min(1, this.excitation / MIN_EXCITATION)
  }

  get calibrated(): boolean {
    if (!this.forward) return false
    if (this.restored) return this.excitation < VERIFY_EXCITATION || this.correlationAlong(this.forward) >= MIN_RESTORED_CORRELATION
    return this.locked
  }

  restore(snapshot: MountSnapshot | null) {
    this.saved = snapshot
  }

  snapshot(): MountSnapshot | null {
    if (!this.calibrated || !this.down || !this.forward) return null
    return { down: this.down, forward: this.forward }
  }

  addMotion(sample: MotionSample): Vec3 | null {
    const dt = this.lastT === null ? 0 : Math.max(0, (sample.t - this.lastT) / 1000)
    this.lastT = sample.t

    const linear = this.trackGravity(sample, dt)
    if (!linear || !this.gravity || this.settledAt === null || sample.t - this.settledAt < SETTLE_S * 1000) return null

    this.down = normalize(this.gravity)
    this.watchMount(sample.t)
    if (this.forward) this.forward = normalize(reject(this.forward, this.down))

    const horizontal = reject(linear, this.down)
    this.history.push({ t: sample.t, horizontal })
    while (this.history.length && sample.t - this.history[0].t > HISTORY_S * 1000) this.history.shift()

    return horizontal
  }

  addFix(fix: GpsFix) {
    const previous = this.lastFix
    if (fix.derived || fix.accuracy > GOOD_ACCURACY_M) return

    this.lastFix = fix
    if (!previous || !this.down) return

    const seconds = (fix.t - previous.t) / 1000
    if (seconds < MIN_INTERVAL_S || seconds > MAX_INTERVAL_S) return
    if (Math.max(fix.speed, previous.speed) < MIN_LEARNING_SPEED) return

    const window = this.history.filter((sample) => sample.t >= previous.t && sample.t < fix.t)
    if (window.length < MIN_INTERVAL_SAMPLES) return

    const mean = scale(
      window.reduce<Vec3>((sum, sample) => [sum[0] + sample.horizontal[0], sum[1] + sample.horizontal[1], sum[2] + sample.horizontal[2]], ZERO),
      1 / window.length
    )

    this.learn(mean, (fix.speed - previous.speed) / seconds)
  }

  private trackGravity(sample: MotionSample, dt: number): Vec3 | null {
    if (!sample.accel) return null

    const measured = sample.linear ? sub(sample.accel, sample.linear) : sample.accel
    const tau = sample.linear ? GRAVITY_TAU_S : RAW_GRAVITY_TAU_S

    if (!this.gravity) {
      this.gravity = measured
      this.settledAt = sample.t
    } else {
      this.gravity = lerp(this.gravity, measured, 1 - Math.exp(-dt / tau))
    }

    return sample.linear ?? sub(sample.accel, this.gravity)
  }

  private watchMount(t: number) {
    const down = this.down!

    if (!this.anchor) {
      this.anchor = down
      this.applySaved(down)
      return
    }

    if (angleDeg(down, this.anchor) < MOVED_DEG) {
      this.movedSince = null
      return
    }

    this.movedSince ??= t
    if (t - this.movedSince >= MOVED_HOLD_S * 1000) this.reset(down)
  }

  private applySaved(down: Vec3) {
    if (!this.saved || angleDeg(down, this.saved.down) > RESTORE_MAX_DEG) return

    this.forward = normalize(reject(this.saved.forward, down))
    this.restored = true
  }

  private reset(down: Vec3) {
    this.anchor = down
    this.movedSince = null
    this.forward = null
    this.restored = false
    this.locked = false
    this.history = []
    this.correlation = ZERO
    this.moment = [0, 0, 0, 0, 0, 0, 0, 0, 0]
    this.excitation = 0
    this.resets++
  }

  private learn(horizontal: Vec3, gpsAccel: number) {
    const weight = gpsAccel * gpsAccel
    const keep = Math.exp(-weight / MEMORY_EXCITATION)
    const [x, y, z] = horizontal

    this.correlation = scale(this.correlation, keep).map((value, index) => value + horizontal[index] * gpsAccel) as Vec3
    this.moment = this.moment.map((value, index) => value * keep + [x * x, x * y, x * z, y * x, y * y, y * z, z * x, z * y, z * z][index]) as Matrix3
    this.excitation = this.excitation * keep + weight

    if (this.restored && this.excitation >= VERIFY_EXCITATION && this.correlationAlong(this.forward!) < MIN_RESTORED_CORRELATION) {
      this.forward = null
      this.restored = false
    }

    if (this.excitation < MIN_EXCITATION) return

    const learned = normalize(reject(this.correlation, this.down!))
    if (this.restored && this.correlationAlong(learned) < MIN_CORRELATION) return

    this.forward = learned
    this.restored = false
    this.locked = this.correlationAlong(learned) >= (this.locked ? MIN_KEEP_CORRELATION : MIN_CORRELATION)
  }

  private correlationAlong(axis: Vec3): number {
    const m = this.moment
    const projected = [0, 1, 2].reduce((sum, row) => sum + axis[row] * (m[row * 3] * axis[0] + m[row * 3 + 1] * axis[1] + m[row * 3 + 2] * axis[2]), 0)
    const denominator = Math.sqrt(projected * this.excitation)
    return denominator > 0 ? dot(this.correlation, axis) / denominator : 0
  }
}
