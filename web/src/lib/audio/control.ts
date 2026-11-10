import type { DriveMode, DspControl, Perspective, ValveMode } from './core/contracts'

export interface EngineInput {
  rpm: number
  load: number
  gear: number
  limiter: boolean
  moving: boolean
}

export interface EngineSettings {
  perspective: Perspective
  valve: ValveMode
  driveMode: DriveMode
}

export function signedLoad(load: number, overrun: number): number {
  return overrun > 0 ? -overrun : load
}

export class ControlBridge {
  readonly ctl: DspControl = {
    rpm: 0,
    load: 0,
    gear: 0,
    driveline: 'clutch-open',
    limiter: false,
    shift: { active: false, up: false, fromRpm: 0, toRpm: 0, t0: 0, durationS: 0 },
    ignitionOn: false,
    runTimeS: 0,
    valve: 'auto',
    perspective: 'cabin',
    driveMode: 'comfort',
    warm: true
  }

  private shiftTimeS = 0.2
  private ignitionAt = 0
  private lastGear = 0
  private lastRpm = 0

  setShiftTime(seconds: number) {
    this.shiftTimeS = seconds
  }

  setSettings(settings: Partial<EngineSettings>) {
    if (settings.perspective) this.ctl.perspective = settings.perspective
    if (settings.valve) this.ctl.valve = settings.valve
    if (settings.driveMode) this.ctl.driveMode = settings.driveMode
  }

  ignition(on: boolean, nowS: number) {
    this.ctl.ignitionOn = on
    this.ignitionAt = nowS
    this.lastGear = 0
    this.ctl.shift.active = false
  }

  update(input: EngineInput, nowS: number) {
    const ctl = this.ctl

    if (input.moving && this.lastGear > 0 && input.gear !== this.lastGear) {
      const shift = ctl.shift
      shift.active = true
      shift.up = input.gear > this.lastGear
      shift.fromRpm = this.lastRpm
      shift.toRpm = input.rpm
      shift.t0 = nowS
      shift.durationS = this.shiftTimeS
    }

    ctl.rpm = input.rpm
    ctl.load = input.load
    ctl.gear = input.gear
    ctl.limiter = input.limiter
    ctl.driveline = input.moving ? 'engaged' : 'clutch-open'

    this.lastGear = input.gear
    this.lastRpm = input.rpm
  }

  tick(nowS: number) {
    const ctl = this.ctl

    if (ctl.shift.active && nowS - ctl.shift.t0 >= ctl.shift.durationS) ctl.shift.active = false
    ctl.runTimeS = ctl.ignitionOn ? Math.max(0, nowS - this.ignitionAt) : 0
  }
}
