import engineWorkletUrl from './engine.worklet.ts?worker&url'
import type { EngineDef } from './core/contracts'
import type { EngineProfile } from '../engines'
import type { EngineMessage } from './messages'
import { EngineSound } from './engine'
import { softClipCurve } from './softClip'

export type LabVariantId = 'tone' | 'mirror' | 'resumeFirst' | 'app' | 'fixedRate' | 'appWithLink'

export interface LabVariant {
  id: LabVariantId
  label: string
  detail: string
}

export const labVariants: LabVariant[] = [
  { id: 'tone', label: 'A · Plain tone', detail: 'One oscillator, nothing else' },
  { id: 'mirror', label: 'B · Teslasound style', detail: 'Resume on tap, compressor, fade in from silence, one synth' },
  { id: 'resumeFirst', label: 'C · Ours, resume on tap', detail: 'Our chain, but audio starts before the synth loads' },
  { id: 'app', label: 'D · Ours, as in the app', detail: 'Exactly what the car page does today' },
  { id: 'fixedRate', label: 'E · Ours at 48 kHz', detail: 'Like C, but always resampled to 48 kHz' },
  { id: 'appWithLink', label: 'F · Ours with a WebRTC link', detail: 'Like D, plus a live WebRTC data channel as with a paired phone' }
]

const FADE_S = 0.35
const MIRROR_GAIN = Math.pow(0.8, 1.6) * 1.4
const CLIP_RANGE = 4
const FIXED_RATE = 48000
const IDLE_UPDATE_MS = 50
const NODE_OPTIONS: AudioWorkletNodeOptions = { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] }

export interface LabRun {
  context: AudioContext
  meter: AnalyserNode | null
  status?: () => string
  stop: () => Promise<void>
}

export function startLab(id: LabVariantId, profile: EngineProfile): Promise<LabRun> | LabRun {
  if (id === 'tone') return startTone()
  if (id === 'mirror') return startMirror(engineDef(profile))
  if (id === 'resumeFirst') return startResumeFirst(engineDef(profile))
  if (id === 'fixedRate') return startResumeFirst(engineDef(profile), FIXED_RATE)
  if (id === 'appWithLink') return startAppWithLink(profile)
  return startApp(profile)
}

function startTone(): LabRun {
  const context = new AudioContext({ latencyHint: 'interactive' })
  void context.resume()
  const oscillator = context.createOscillator()
  oscillator.type = 'sawtooth'
  oscillator.frequency.value = 55
  const gain = context.createGain()
  gain.gain.value = 0.15
  oscillator.connect(gain)
  oscillator.start()
  return output(context, gain)
}

function startMirror(def: EngineDef): LabRun {
  const context = new AudioContext({ latencyHint: 'interactive' })
  const compressor = context.createDynamicsCompressor()
  compressor.threshold.value = -12
  compressor.knee.value = 8
  compressor.ratio.value = 5
  compressor.attack.value = 0.003
  compressor.release.value = 0.2
  const master = context.createGain()
  master.gain.value = 0
  const clipIn = context.createGain()
  clipIn.gain.value = 1 / CLIP_RANGE
  const clip = context.createWaveShaper()
  clip.curve = mirrorClipCurve()
  clip.oversample = 'none'
  compressor.connect(master).connect(clipIn).connect(clip)

  const resumed = context.resume()
  const loaded = context.audioWorklet.addModule(engineWorkletUrl).then(() => {
    const node = new AudioWorkletNode(context, 'engine', NODE_OPTIONS)
    node.connect(compressor)
    igniteEngine(node, def)
  })

  void Promise.all([resumed, loaded]).then(() => {
    const now = context.currentTime
    master.gain.setValueAtTime(0, now)
    master.gain.linearRampToValueAtTime(MIRROR_GAIN, now + FADE_S)
  })

  return output(context, clip)
}

function startResumeFirst(def: EngineDef, sampleRate?: number): LabRun {
  const context = new AudioContext({ latencyHint: 'interactive', sampleRate })
  void context.resume()
  const limiter = context.createWaveShaper()
  limiter.curve = softClipCurve()
  limiter.oversample = '2x'
  const volume = context.createGain()
  volume.gain.value = 1 / 1.5
  volume.connect(limiter)

  void context.audioWorklet.addModule(engineWorkletUrl).then(() => {
    const node = new AudioWorkletNode(context, 'engine', NODE_OPTIONS)
    node.connect(volume)
    igniteEngine(node, def)
  })

  return output(context, limiter)
}

async function startApp(profile: EngineProfile): Promise<LabRun> {
  const sound = new EngineSound()
  await sound.start(profile, 1)
  const rpm = profile.idle
  const timer = window.setInterval(() => sound.update({ gear: 0, rpm, targetRpm: rpm, load: 0, overrun: 0, limiter: false, moving: false }), IDLE_UPDATE_MS)
  return {
    context: sound.context!,
    meter: null,
    stop: () => {
      clearInterval(timer)
      return sound.stop()
    }
  }
}

async function startAppWithLink(profile: EngineProfile): Promise<LabRun> {
  const run = await startApp(profile)
  const peers = await openLoopback()
  return {
    ...run,
    status: () => `link ${peers[0].connectionState}`,
    stop: async () => {
      for (const peer of peers) peer.close()
      await run.stop()
    }
  }
}

async function openLoopback(): Promise<RTCPeerConnection[]> {
  const iceServers = [{ urls: 'stun:stun.l.google.com:19302' }]
  const offerer = new RTCPeerConnection({ iceServers })
  const answerer = new RTCPeerConnection({ iceServers })
  offerer.onicecandidate = (event) => event.candidate && void answerer.addIceCandidate(event.candidate)
  answerer.onicecandidate = (event) => event.candidate && void offerer.addIceCandidate(event.candidate)

  const channel = offerer.createDataChannel('frames', { ordered: false, maxRetransmits: 0 })
  const timer = window.setInterval(() => channel.readyState === 'open' && channel.send(new Uint8Array(32)), 50)
  offerer.onconnectionstatechange = () => offerer.connectionState === 'closed' && clearInterval(timer)

  await offerer.setLocalDescription(await offerer.createOffer())
  await answerer.setRemoteDescription(offerer.localDescription!)
  await answerer.setLocalDescription(await answerer.createAnswer())
  await offerer.setRemoteDescription(answerer.localDescription!)
  return [offerer, answerer]
}

function output(context: AudioContext, last: AudioNode): LabRun {
  const meter = context.createAnalyser()
  meter.fftSize = 2048
  last.connect(context.destination)
  last.connect(meter)
  return { context, meter, stop: () => context.close() }
}

export function levelDb(meter: AnalyserNode, buffer: Float32Array<ArrayBuffer>): number {
  meter.getFloatTimeDomainData(buffer)
  let sum = 0
  for (const sample of buffer) sum += sample * sample
  return 10 * Math.log10(sum / buffer.length + 1e-12)
}

function igniteEngine(node: AudioWorkletNode, def: EngineDef) {
  const post = (message: EngineMessage) => node.port.postMessage(message)
  post({ type: 'engine', def })
  post({ type: 'ignition', on: true })
  post({ type: 'control', rpm: def.spec.rpm.idle, load: 0, gear: 0, limiter: false, moving: false })
}

function engineDef(profile: EngineProfile): EngineDef {
  if (profile.sound.kind !== 'core') throw new Error('Lab needs a DSP engine')
  return profile.sound.def
}

function mirrorClipCurve(): Float32Array<ArrayBuffer> {
  const knee = 0.9
  const ceiling = 0.98
  const span = ceiling - knee
  const points = 4097
  const curve = new Float32Array(points)
  for (let i = 0; i < points; i++) {
    const x = ((i / (points - 1)) * 2 - 1) * CLIP_RANGE
    const a = Math.abs(x)
    const y = a <= knee ? a : knee + span * Math.tanh((a - knee) / span)
    curve[i] = x < 0 ? -y : y
  }
  return curve
}
