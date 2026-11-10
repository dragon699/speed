import { formatMs, formatSpeed } from './format'
import type { LatencySummary } from './latency'
import { linkLabel } from './linkLabel'
import type { LinkRoute, LinkState } from './peer.svelte'
import type { RelayState } from './relay.svelte'
import { GOOD_ACCURACY_M, type GpsFix } from './sensors/gps'
import type { BulletItem, BulletSection, Tone } from './status'

const GOOD_LATENCY_MS = 150
const SLOW_LATENCY_MS = 400

export interface CarStatusInput {
  relay: RelayState | null
  started: boolean
  moving: boolean
  manual: boolean
  phoneLive: boolean
  fusedLive: boolean
  phoneSeen: boolean
  phoneSpeed: number | null
  phoneHz: number
  fusedSpeed: number | null
  fusedAccel: number
  fusedHz: number
  carFix: GpsFix | null
  carGpsHz: number
  gpsError: string | null
  audioState: string
  audioInfo: string | null
  audioError: string | null
  latency: LatencySummary | null
  link: { state: LinkState; route: LinkRoute | null }
  viewport: string
  firstSeen: string
}

type Source = 'manual' | 'fused' | 'phone' | 'car'

export function carStatus(input: CarStatusInput): BulletSection[] {
  if (!input.relay) {
    return [{ title: 'Status', items: [{ key: 'key', icon: 'server', text: 'No device key – open the setup link', tone: 'bad' }] }]
  }

  return [
    { title: 'Status', items: statusItems(input, input.relay) },
    { title: 'Sensors', items: sensorItems(input, input.relay) }
  ]
}

export function speedSource(input: Pick<CarStatusInput, 'manual' | 'fusedLive' | 'phoneLive'>): Source {
  if (input.manual) return 'manual'
  if (input.fusedLive) return 'fused'
  if (input.phoneLive) return 'phone'
  return 'car'
}

function statusItems(input: CarStatusInput, relay: RelayState): BulletItem[] {
  return [
    driveItem(input),
    serverItem(relay, input.started),
    soundItem(input),
    latencyItem(input.latency),
    linkItem(input.link),
    { key: 'viewport', icon: 'display', text: input.viewport, tone: 'idle' },
    { key: 'stored', icon: 'clock', text: `Stored since ${input.firstSeen}`, tone: 'idle' }
  ]
}

function sensorItems(input: CarStatusInput, relay: RelayState): BulletItem[] {
  const source = speedSource(input)
  const phoneConnected = relay.connected && relay.phone

  const items: BulletItem[] = [
    { ...carGpsItem(input), active: source === 'car' && input.started },
    { ...phoneItem(input, relay), active: source === 'fused' || source === 'phone' },
    !phoneConnected
      ? { key: 'charger', icon: 'charger', text: 'Charger —', tone: 'idle' }
      : relay.charging
        ? { key: 'charger', icon: 'charger', text: 'Charging', tone: 'ok' }
        : { key: 'charger', icon: 'charger', text: 'Not charging', tone: 'warn' }
  ]

  if (input.manual) items.push({ key: 'manual', icon: 'gauge', text: 'Manual speed (test)', tone: 'warn', active: true })

  return items
}

function driveItem(input: CarStatusInput): BulletItem {
  if (!input.started) return { key: 'drive', icon: 'pause', text: 'Not started', tone: 'idle' }
  if (input.moving) return { key: 'drive', icon: 'play', text: input.manual ? 'Driving (test)' : 'Driving', tone: 'ok' }
  return { key: 'drive', icon: 'pause', text: 'Waiting', tone: 'wait' }
}

function serverItem(relay: RelayState, started: boolean): BulletItem {
  const item = { key: 'server', icon: 'server' } as const

  if (relay.error) return { ...item, text: relay.error, tone: 'bad' }
  if (!started) return { ...item, text: 'Server – tap Start', tone: 'idle' }
  if (!relay.connected) return { ...item, text: 'Connecting to server…', tone: 'wait' }
  return { ...item, text: 'Server connected', detail: `RTT ${formatMs(relay.rttMs)}`, tone: 'ok' }
}

function soundItem(input: CarStatusInput): BulletItem {
  const item = { key: 'sound', icon: 'sound', detail: input.audioInfo ?? undefined } as const

  if (input.audioError) return { ...item, text: input.audioError, tone: 'bad' }
  if (input.audioState === 'running') return { ...item, text: 'Sound playing', tone: 'ok' }
  if (input.started) return { ...item, text: `Sound ${input.audioState}`, tone: 'wait' }
  return { key: 'sound', icon: 'sound', text: 'Sound off', tone: 'idle' }
}

function latencyItem(latency: LatencySummary | null): BulletItem {
  if (!latency) return { key: 'latency', icon: 'timer', text: 'Phone → car —', tone: 'idle' }

  return {
    key: 'latency',
    icon: 'timer',
    text: `Phone → car ${formatMs(latency.p50)}`,
    detail: `p95 ${formatMs(latency.p95)} · ${Math.round(latency.webrtcShare * 100)}% via WebRTC`,
    tone: latencyTone(latency.p50)
  }
}

function latencyTone(ms: number): Tone {
  if (ms <= GOOD_LATENCY_MS) return 'ok'
  if (ms <= SLOW_LATENCY_MS) return 'warn'
  return 'bad'
}

function linkItem(link: CarStatusInput['link']): BulletItem {
  const tones: Record<LinkState, Tone> = { off: 'idle', connecting: 'wait', open: 'ok', failed: 'warn', unsupported: 'warn' }
  return { key: 'link', icon: 'link', text: `WebRTC ${linkLabel(link.state, link.route)}`, tone: tones[link.state] }
}

function carGpsItem(input: CarStatusInput): BulletItem {
  const item = { key: 'car', icon: 'car' } as const
  const fix = input.carFix

  if (input.gpsError) return { ...item, text: 'GPS', detail: input.gpsError, tone: 'bad' }
  if (!fix) return { ...item, text: 'GPS', detail: input.started ? 'Waiting for fix' : undefined, tone: input.started ? 'wait' : 'idle' }

  const detail = `${formatSpeed(fix.speed)} · ±${fix.accuracy.toFixed(0)} m · ${input.carGpsHz.toFixed(1)} Hz${fix.derived ? ' · derived' : ''}`
  return { ...item, text: 'GPS', detail, tone: fix.accuracy <= GOOD_ACCURACY_M ? 'ok' : 'warn' }
}

function phoneItem(input: CarStatusInput, relay: RelayState): BulletItem {
  const item = { key: 'phone', icon: 'phone' } as const
  const name = relay.phoneName ?? 'Phone'

  if (!relay.connected || !relay.phone) return { ...item, text: 'Disconnected', tone: 'bad' }
  if (input.fusedLive && input.fusedSpeed !== null) {
    return { ...item, text: 'Sensors and GPS', detail: `${name} · ${formatSpeed(input.fusedSpeed)} · ${input.fusedAccel.toFixed(1)} m/s² · ${input.fusedHz.toFixed(0)} Hz`, tone: 'ok' }
  }
  if (input.phoneLive && input.phoneSpeed !== null) return { ...item, text: 'GPS', detail: `${name} · ${formatSpeed(input.phoneSpeed)} · ${input.phoneHz.toFixed(1)} Hz`, tone: 'ok' }
  if (input.phoneSeen) return { ...item, text: 'Paused', detail: name, tone: 'warn' }
  return { ...item, text: 'Connected', detail: `${name} · waiting for GPS`, tone: 'wait' }
}
