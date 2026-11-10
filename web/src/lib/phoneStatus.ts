import { formatBytes, formatDuration, formatMagnitude, formatMs, formatSpeed } from './format'
import type { FusionStatus } from './fusion/fusion'
import { linkLabel } from './linkLabel'
import type { LinkRoute, LinkState } from './peer.svelte'
import type { RelayState } from './relay.svelte'
import { GOOD_ACCURACY_M, type GpsFix } from './sensors/gps'
import type { MotionSample } from './sensors/motion'
import type { BulletItem, BulletSection, Tone } from './status'

export interface FusedView {
  speed: number
  accel: number
  lagMs: number
}

export interface PhoneStatusInput {
  relay: RelayState | null
  charging: boolean | null
  fix: GpsFix | null
  gpsError: string | null
  gpsHz: number
  motionHz: number
  motionUnavailable: boolean
  motion: MotionSample | null
  fusion: FusionStatus | null
  fused: FusedView | null
  link: { state: LinkState; route: LinkRoute | null }
  recordWanted: boolean
  recording: boolean
  recordingMs: number | null
  recordedBytes: number
  screenLocked: boolean
}

export function phoneStatus(input: PhoneStatusInput): BulletSection[] {
  return [
    { title: 'Status', items: statusItems(input) },
    { title: 'Sensors', items: sensorItems(input) }
  ]
}

function statusItems(input: PhoneStatusInput): BulletItem[] {
  const relay = input.relay
  const carConnected = !!relay?.connected && relay.car

  return [
    streamItem(relay, carConnected),
    serverItem(relay),
    !relay
      ? { key: 'car', icon: 'car', text: 'Car —', tone: 'idle' }
      : carConnected
        ? { key: 'car', icon: 'car', text: 'Car connected', tone: 'ok' }
        : { key: 'car', icon: 'car', text: 'Car not connected', tone: 'bad' },
    linkItem(input),
    recordingItem(input),
    !relay
      ? { key: 'screen', icon: 'screen', text: 'Screen —', tone: 'idle' }
      : input.screenLocked
        ? { key: 'screen', icon: 'screen', text: 'Screen kept awake', tone: 'ok' }
        : { key: 'screen', icon: 'screen', text: 'Screen may sleep', tone: 'warn' }
  ]
}

function sensorItems(input: PhoneStatusInput): BulletItem[] {
  return [
    gpsItem(input),
    motionItem(input),
    rawItem(input),
    input.charging === null
      ? { key: 'charger', icon: 'charger', text: 'Charger —', tone: 'idle' }
      : input.charging
        ? { key: 'charger', icon: 'charger', text: 'Charging', tone: 'ok' }
        : { key: 'charger', icon: 'charger', text: 'Not charging', tone: 'warn' }
  ]
}

function streamItem(relay: RelayState | null, carConnected: boolean): BulletItem {
  if (!relay) return { key: 'stream', icon: 'pause', text: 'Enter the car code', tone: 'idle' }
  if (carConnected) return { key: 'stream', icon: 'play', text: 'Sending to car', tone: 'ok' }
  return { key: 'stream', icon: 'pause', text: 'Waiting for car', tone: 'wait' }
}

function serverItem(relay: RelayState | null): BulletItem {
  const item = { key: 'server', icon: 'server' } as const

  if (!relay) return { ...item, text: 'Server —', tone: 'idle' }
  if (relay.error) return { ...item, text: relay.error, tone: 'bad' }
  if (!relay.connected) return { ...item, text: 'Connecting to server…', tone: 'wait' }
  return { ...item, text: 'Server connected', detail: `RTT ${formatMs(relay.rttMs)}`, tone: 'ok' }
}

function linkItem(input: PhoneStatusInput): BulletItem {
  const tones: Record<LinkState, Tone> = { off: 'idle', connecting: 'wait', open: 'ok', failed: 'warn', unsupported: 'warn' }
  return { key: 'link', icon: 'link', text: `WebRTC ${linkLabel(input.link.state, input.link.route)}`, tone: tones[input.link.state] }
}

function recordingItem(input: PhoneStatusInput): BulletItem {
  const item = { key: 'record', icon: 'record' } as const

  if (input.relay?.connected && !input.relay.canRecord) {
    return { ...item, text: 'Recording unavailable', detail: 'needs the device key in the car or phone', tone: 'idle' }
  }
  if (!input.recordWanted) return { ...item, text: 'Recording off', tone: 'idle' }
  if (!input.recording || input.recordingMs === null) return { ...item, text: 'Recording starting…', tone: 'wait' }
  return { ...item, text: `Recording ${formatDuration(input.recordingMs)}`, detail: formatBytes(input.recordedBytes), tone: 'ok' }
}

function gpsItem(input: PhoneStatusInput): BulletItem {
  const item = { key: 'gps', icon: 'gps', text: 'GPS' } as const
  const fix = input.fix

  if (input.gpsError) return { ...item, detail: input.gpsError, tone: 'bad' }
  if (!fix) return input.relay ? { ...item, detail: 'Waiting for fix', tone: 'wait' } : { ...item, tone: 'idle' }

  const detail = `${formatSpeed(fix.speed)} · ±${fix.accuracy.toFixed(0)} m · ${input.gpsHz.toFixed(1)} Hz${fix.derived ? ' · derived' : ''}`
  return { ...item, detail, tone: fix.accuracy <= GOOD_ACCURACY_M ? 'ok' : 'warn' }
}

function motionItem(input: PhoneStatusInput): BulletItem {
  const item = { key: 'motion', icon: 'motion' } as const

  if (!input.relay) return { ...item, text: 'Motion sensors', tone: 'idle' }
  if (input.motionUnavailable) return { ...item, text: 'Motion sensors unavailable', tone: 'bad' }
  if (!input.motionHz) return { ...item, text: 'Motion sensors', detail: 'Waiting', tone: 'wait' }

  if (input.fusion?.calibrated && input.fused) {
    const { speed, accel, lagMs } = input.fused
    return { ...item, text: 'Speed fusion on', detail: `${formatSpeed(speed)} · ${accel.toFixed(1)} m/s² · GPS lag ${lagMs} ms`, tone: 'ok' }
  }

  const progress = Math.round((input.fusion?.progress ?? 0) * 100)
  return { ...item, text: `Learning mount ${progress}%`, detail: 'drive normally', tone: 'wait' }
}

function rawItem(input: PhoneStatusInput): BulletItem {
  const motion = input.motion
  const item = { key: 'raw', icon: 'gauge', text: 'Raw' } as const

  if (!motion) return { ...item, tone: 'idle' }
  return {
    ...item,
    detail: `${input.motionHz} Hz · accel ${formatMagnitude(motion.accel, 'm/s²')} · linear ${formatMagnitude(motion.linear, 'm/s²')} · rotation ${formatMagnitude(motion.rotation, '°/s')}`,
    tone: 'idle'
  }
}
