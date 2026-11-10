import { describe, expect, it } from 'vitest'
import { ControlBridge, signedLoad } from './control'

const moving = { load: 0.5, limiter: false, moving: true }

describe('control bridge', () => {
  it('encodes overrun as negative load', () => {
    expect(signedLoad(0.4, 0)).toBe(0.4)
    expect(signedLoad(0, 0.7)).toBe(-0.7)
  })

  it('starts a shift trajectory when the gear changes while moving', () => {
    const bridge = new ControlBridge()
    bridge.setShiftTime(0.3)
    bridge.ignition(true, 0)
    bridge.update({ ...moving, rpm: 6000, gear: 2 }, 1)
    bridge.update({ ...moving, rpm: 4200, gear: 3 }, 1.02)

    expect(bridge.ctl.shift).toEqual({ active: true, up: true, fromRpm: 6000, toRpm: 4200, t0: 1.02, durationS: 0.3 })

    bridge.tick(1.2)
    expect(bridge.ctl.shift.active).toBe(true)
    bridge.tick(1.33)
    expect(bridge.ctl.shift.active).toBe(false)
  })

  it('does not shift when the gear resets while stopped', () => {
    const bridge = new ControlBridge()
    bridge.ignition(true, 0)
    bridge.update({ ...moving, rpm: 2000, gear: 3 }, 1)
    bridge.update({ load: 0, limiter: false, moving: false, rpm: 900, gear: 1 }, 2)

    expect(bridge.ctl.shift.active).toBe(false)
    expect(bridge.ctl.driveline).toBe('clutch-open')
  })

  it('counts run time from ignition', () => {
    const bridge = new ControlBridge()
    bridge.ignition(true, 5)
    bridge.tick(7.5)
    expect(bridge.ctl.runTimeS).toBe(2.5)
    bridge.ignition(false, 8)
    bridge.tick(9)
    expect(bridge.ctl.runTimeS).toBe(0)
  })

  it('applies only known settings', () => {
    const bridge = new ControlBridge()
    bridge.setSettings({ perspective: 'outside', driveMode: 'sport' })
    expect(bridge.ctl.perspective).toBe('outside')
    expect(bridge.ctl.driveMode).toBe('sport')
    expect(bridge.ctl.valve).toBe('auto')
  })
})
