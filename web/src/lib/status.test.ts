import { describe, expect, it } from 'vitest'
import { carStatus, type CarStatusInput } from './carStatus'
import { phoneStatus, type PhoneStatusInput } from './phoneStatus'
import type { RelayState } from './relay.svelte'

const relay = (overrides: Partial<RelayState> = {}): RelayState => ({
  connected: true,
  car: true,
  phone: true,
  charging: true,
  phoneName: 'Galaxy S26 Ultra',
  recording: false,
  canRecord: true,
  rttMs: 20,
  error: null,
  ...overrides
})

const car = (overrides: Partial<CarStatusInput> = {}): CarStatusInput => ({
  relay: relay(),
  started: true,
  moving: true,
  manual: false,
  phoneLive: true,
  fusedLive: false,
  phoneSeen: true,
  phoneSpeed: 20,
  phoneHz: 1,
  phoneMotion: null,
  fusedSpeed: null,
  fusedAccel: 0,
  fusedHz: 0,
  carFix: { t: 0, speed: 19.5, accuracy: 6, derived: false },
  carGpsHz: 1,
  gpsError: null,
  audioState: 'running',
  audioInfo: '48000 Hz',
  audioError: null,
  latency: { p50: 90, p95: 180, webrtcShare: 1 },
  link: { state: 'open', route: 'direct' },
  viewport: '1920 × 1200 @ 1x',
  firstSeen: '9 Nov 2026, 21:12',
  ...overrides
})

const phone = (overrides: Partial<PhoneStatusInput> = {}): PhoneStatusInput => ({
  relay: relay(),
  charging: true,
  fix: { t: 0, speed: 0, accuracy: 8, derived: false },
  gpsError: null,
  gpsHz: 1,
  motionHz: 60,
  motionUnavailable: false,
  motion: { t: 0, accel: [0, 9.8, 0], linear: [0, 0, 0], rotation: [0, 0, 0] },
  fusion: { calibrated: true, progress: 1, resets: 0 },
  fused: { speed: 10, accel: 0.5, lagMs: 200 },
  link: { state: 'open', route: 'direct' },
  recordWanted: false,
  recording: false,
  recordingMs: null,
  recordedBytes: 0,
  screenLocked: true,
  ...overrides
})

const section = (input: CarStatusInput, title: string) =>
  Object.fromEntries(
    carStatus(input)
      .find((entry) => entry.title === title)!
      .items.map((item) => [item.key, `${item.text} (${item.tone})${item.active ? ' [in use]' : ''}`])
  )

describe('car status', () => {
  it('shows driving, a healthy link and phone GPS in use', () => {
    expect(section(car(), 'Status')).toEqual({
      drive: 'Driving (ok)',
      server: 'Server connected (ok)',
      sound: 'Sound playing (ok)',
      latency: 'Phone → car 90 ms (ok)',
      link: 'WebRTC direct (same Wi-Fi) (ok)',
      record: 'Recording available (idle)',
      viewport: '1920 × 1200 @ 1x (idle)',
      stored: 'Stored since 9 Nov 2026, 21:12 (idle)'
    })
    expect(section(car(), 'Sensors')).toEqual({
      car: 'GPS (ok)',
      phone: 'GPS (ok) [in use]',
      charger: 'Charging (ok)'
    })
  })

  it('shows whether this session can record drives', () => {
    expect(section(car({ relay: relay({ recording: true }) }), 'Status').record).toBe('Recording drive (ok)')
    expect(section(car({ relay: relay({ canRecord: false }) }), 'Status').record).toBe('Recording unavailable (idle)')
  })

  it('waits while stopped and before start', () => {
    expect(section(car({ moving: false }), 'Status').drive).toBe('Waiting (wait)')
    expect(section(car({ started: false }), 'Status').drive).toBe('Not started (idle)')
  })

  it('shows how far the phone is in learning its mount', () => {
    expect(section(car({ phoneMotion: 0.4 }), 'Sensors').phone).toBe('GPS · sensors learning 40% (ok) [in use]')
    expect(section(car({ phoneMotion: -1 }), 'Sensors').phone).toBe('GPS · no motion sensors (ok) [in use]')
  })

  it('says sensors and GPS when phone motion fusion is live', () => {
    expect(section(car({ fusedLive: true, fusedSpeed: 20 }), 'Sensors').phone).toBe('Sensors and GPS (ok) [in use]')
  })

  it('falls back to car GPS when the phone disconnects', () => {
    const sensors = section(car({ relay: relay({ phone: false }), phoneLive: false }), 'Sensors')
    expect(sensors.phone).toBe('Disconnected (bad)')
    expect(sensors.car).toBe('GPS (ok) [in use]')
    expect(sensors.charger).toBe('Charger — (idle)')
  })

  it('marks manual test speed as the source in use', () => {
    const sensors = section(car({ manual: true }), 'Sensors')
    expect(sensors.manual).toBe('Manual speed (test) (warn) [in use]')
    expect(sensors.phone).toBe('GPS (ok)')
  })

  it('flags a slow phone to car delay', () => {
    expect(section(car({ latency: { p50: 520, p95: 900, webrtcShare: 0 } }), 'Status').latency).toBe('Phone → car 520 ms (bad)')
  })
})

const all = (sections: ReturnType<typeof carStatus>, withDetail = false) =>
  Object.fromEntries(
    sections.flatMap((entry) => entry.items).map((item) => [item.key, `${item.text}${withDetail && item.detail ? ` · ${item.detail}` : ''} (${item.tone})`])
  )

describe('phone status', () => {
  it('shows a healthy phone sending to the car', () => {
    expect(all(phoneStatus(phone()))).toEqual({
      stream: 'Sending to car (ok)',
      server: 'Server connected (ok)',
      car: 'Car connected (ok)',
      link: 'WebRTC direct (same Wi-Fi) (ok)',
      record: 'Recording off (idle)',
      screen: 'Screen kept awake (ok)',
      gps: 'GPS (ok)',
      motion: 'Speed fusion on (ok)',
      raw: 'Raw (idle)',
      charger: 'Charging (ok)'
    })
  })

  it('reports recording progress', () => {
    const items = all(phoneStatus(phone({ recordWanted: true, recording: true, recordingMs: 75000, recordedBytes: 2_400_000 })), true)
    expect(items.record).toBe('Recording 1:15 · 2.4 MB (ok)')
  })

  it('says recording is unavailable without a device key in the session', () => {
    expect(all(phoneStatus(phone({ relay: relay({ canRecord: false }), recordWanted: true }))).record).toBe('Recording unavailable (idle)')
  })

  it('waits for the relay to confirm recording', () => {
    expect(all(phoneStatus(phone({ recordWanted: true }))).record).toBe('Recording starting… (wait)')
  })

  it('flags poor GPS accuracy', () => {
    const fix = { t: 0, speed: 0, accuracy: 45, derived: false }
    expect(all(phoneStatus(phone({ fix })), true).gps).toBe('GPS · 0.0 km/h · ±45 m · 1.0 Hz (warn)')
  })

  it('shows motion learning progress until the mount is known', () => {
    const learning = all(phoneStatus(phone({ fusion: { calibrated: false, progress: 0.4, resets: 0 }, fused: null })))
    expect(learning.motion).toBe('Learning mount 40% (wait)')
  })

  it('waits for the car', () => {
    expect(all(phoneStatus(phone({ relay: relay({ car: false }) }))).stream).toBe('Waiting for car (wait)')
  })

  it('shows idle rows before start', () => {
    const items = all(phoneStatus(phone({ relay: null })))
    expect(items.stream).toBe('Enter the car code (idle)')
    expect(items.server).toBe('Server — (idle)')
    expect(items.screen).toBe('Screen — (idle)')
  })
})
