import type { EngineProfile } from './engines'
import { clamp } from './math'

const CRUISE_UPSHIFT_RPM = 2500
const FULL_LOAD_UPSHIFT_SHARE = 0.92
const DOWNSHIFT_SHARE = 0.55
const FULL_LOAD_ACCEL = 3
const FULL_OVERRUN_DECEL = 2.5
const OVERRUN_THRESHOLD_ACCEL = -0.3
const OVERRUN_MIN_IDLE_SHARE = 1.3
const CLUTCH_SLIP_RPM_SHARE = 1.3
const LOAD_SMOOTHING = 0.15
const MEASURED_LOAD_TAU_S = 0.03
const IDLE_LOAD = 0.12
const CRUISE_LOAD = 0.22
const STOPPED_SPEED = 0.5
const DOWNSHIFT_BLIP_S = 0.15
const DOWNSHIFT_BLIP_LOAD = 0.4
const RPM_RISE_PER_S = 12000
const RPM_FALL_PER_S = 9000
const FREE_REV_RISE_PER_S = 5000
const FREE_REV_FALL_PER_S = 3200
const LIMITER_MARGIN_RPM = 30

export interface DrivetrainState {
  gear: number
  rpm: number
  targetRpm: number
  load: number
  overrun: number
  limiter: boolean
  moving: boolean
}

export interface DrivetrainInput {
  accel?: number
  rev?: boolean
}

export function wheelRpm(speed: number, tireCircumference: number): number {
  return (speed / tireCircumference) * 60
}

export function engineRpm(profile: EngineProfile, speed: number, gear: number): number {
  return wheelRpm(speed, profile.tireCircumference) * profile.gears[gear - 1]
}

export function upshiftRpm(profile: EngineProfile, load: number): number {
  const fullLoad = profile.redline * FULL_LOAD_UPSHIFT_SHARE
  return CRUISE_UPSHIFT_RPM + (fullLoad - CRUISE_UPSHIFT_RPM) * clamp(load, 0, 1)
}

export function downshiftRpm(profile: EngineProfile, load: number): number {
  return Math.max(profile.idle * 1.6, upshiftRpm(profile, load) * DOWNSHIFT_SHARE)
}

export class Drivetrain {
  profile: EngineProfile
  state: DrivetrainState

  private lastSpeed: number | null = null
  private throttle = 0
  private blipTimer = 0

  constructor(profile: EngineProfile) {
    this.profile = profile
    this.state = {
      gear: 1,
      rpm: profile.idle,
      targetRpm: profile.idle,
      load: IDLE_LOAD,
      overrun: 0,
      limiter: false,
      moving: false
    }
  }

  setProfile(profile: EngineProfile) {
    this.profile = profile
    const rpm = clamp(this.state.rpm, profile.idle, profile.limiterRpm)
    this.state = { ...this.state, gear: Math.min(this.state.gear, profile.gears.length), rpm, targetRpm: rpm }
  }

  update(speed: number, dt: number, input: DrivetrainInput = {}): DrivetrainState {
    const accel = input.accel ?? (this.lastSpeed === null || dt <= 0 ? 0 : (speed - this.lastSpeed) / dt)
    this.lastSpeed = speed

    const targetThrottle = clamp(accel / FULL_LOAD_ACCEL, 0, 1)
    const smoothing = input.accel === undefined ? LOAD_SMOOTHING : 1 - Math.exp(-dt / MEASURED_LOAD_TAU_S)
    this.throttle += (targetThrottle - this.throttle) * smoothing
    this.blipTimer = Math.max(0, this.blipTimer - dt)

    this.state = speed < STOPPED_SPEED ? this.freeRev(dt, !!input.rev) : this.drive(speed, dt, accel)

    return this.state
  }

  private drive(speed: number, dt: number, accel: number): DrivetrainState {
    const profile = this.profile
    const previousGear = this.state.gear
    const gear = this.selectGear(speed, this.throttle)

    if (gear < previousGear) this.blipTimer = DOWNSHIFT_BLIP_S

    const targetRpm = this.clampRpm(engineRpm(profile, speed, gear), gear)
    const rpm = this.state.rpm + clamp(targetRpm - this.state.rpm, -RPM_FALL_PER_S * dt, RPM_RISE_PER_S * dt)

    const coasting = accel < OVERRUN_THRESHOLD_ACCEL && rpm > profile.idle * OVERRUN_MIN_IDLE_SHARE
    const overrun = coasting ? clamp(-accel / FULL_OVERRUN_DECEL, 0, 1) : 0

    let load = coasting ? 0 : Math.max(this.throttle, CRUISE_LOAD)
    if (this.blipTimer > 0) load = Math.max(load, DOWNSHIFT_BLIP_LOAD)

    return {
      gear,
      rpm,
      targetRpm,
      load,
      overrun,
      limiter: targetRpm >= profile.limiterRpm - LIMITER_MARGIN_RPM && load > 0.3,
      moving: true
    }
  }

  private freeRev(dt: number, rev: boolean): DrivetrainState {
    const { idle, limiterRpm } = this.profile

    if (rev) {
      const rpm = Math.min(limiterRpm, this.state.rpm + FREE_REV_RISE_PER_S * dt)
      return { gear: 1, rpm, targetRpm: rpm, load: 1, overrun: 0, limiter: rpm >= limiterRpm - LIMITER_MARGIN_RPM, moving: false }
    }

    const rpm = Math.max(idle, this.state.rpm - FREE_REV_FALL_PER_S * dt)
    const falling = rpm > idle * 1.05

    return {
      gear: 1,
      rpm,
      targetRpm: rpm,
      load: falling ? 0 : IDLE_LOAD,
      overrun: rpm > idle * OVERRUN_MIN_IDLE_SHARE ? 0.8 : 0,
      limiter: false,
      moving: false
    }
  }

  private selectGear(speed: number, load: number): number {
    const gears = this.profile.gears.length
    let gear = Math.min(this.state.gear, gears)

    while (gear < gears && engineRpm(this.profile, speed, gear) > upshiftRpm(this.profile, load)) gear++
    while (gear > 1 && engineRpm(this.profile, speed, gear) < downshiftRpm(this.profile, load)) gear--

    return gear
  }

  private clampRpm(rpm: number, gear: number): number {
    const floor = gear === 1 ? this.profile.idle * CLUTCH_SLIP_RPM_SHARE : this.profile.idle

    return clamp(rpm, floor, this.profile.limiterRpm)
  }
}
