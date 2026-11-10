import classicWorkletUrl from './classic/classic.worklet.ts?worker&url'
import engineWorkletUrl from './engine.worklet.ts?worker&url'
import type { DrivetrainState } from '../drivetrain'
import type { EngineProfile } from '../engines'
import type { SynthMessage } from './classic/synth'
import { signedLoad, type EngineSettings } from './control'
import type { EngineEvent, EngineMessage } from './messages'
import { MAX_SAMPLE_RATE } from './core/contracts'
import { MIN_SAMPLE_RATE } from './core/dsp/dsp-core'

const GLIDE_SECONDS = 0.05
const CLASSIC_UPSHIFT_CUT_MS = 80
const NODE_OPTIONS: AudioWorkletNodeOptions = { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] }

type Kind = EngineProfile['sound']['kind']

export class EngineSound {
  context: AudioContext | null = null
  onError: ((message: string) => void) | null = null

  private core: AudioWorkletNode | null = null
  private classic: AudioWorkletNode | null = null
  private volume: GainNode | null = null
  private kind: Kind = 'core'
  private lastGear = 0
  private cutUntil = 0

  async start(profile: EngineProfile, volume: number) {
    if (this.context) return this.context.resume()

    const context = createContext()
    await Promise.all([context.audioWorklet.addModule(engineWorkletUrl), context.audioWorklet.addModule(classicWorkletUrl)])

    this.core = new AudioWorkletNode(context, 'engine', NODE_OPTIONS)
    this.core.port.onmessage = (event: MessageEvent<EngineEvent>) => {
      if (event.data.type === 'error') this.onError?.(event.data.message)
    }
    this.classic = new AudioWorkletNode(context, 'classic-engine', NODE_OPTIONS)
    this.volume = context.createGain()
    this.volume.gain.value = volume
    this.volume.connect(context.destination)
    this.context = context

    this.setProfile(profile)
    this.postCore({ type: 'ignition', on: true })

    await context.resume()
  }

  setProfile(profile: EngineProfile) {
    this.route(profile.sound.kind)

    if (profile.sound.kind === 'core') this.postCore({ type: 'engine', def: profile.sound.def })
    else this.postClassic({ type: 'profile', profile: profile.sound.voice })
  }

  setSettings(settings: Partial<EngineSettings>) {
    this.postCore({ type: 'settings', ...settings })
  }

  update(state: DrivetrainState) {
    if (this.kind === 'core') {
      this.postCore({
        type: 'control',
        rpm: state.targetRpm,
        load: signedLoad(state.load, state.overrun),
        gear: state.gear,
        limiter: state.limiter,
        moving: state.moving
      })
      return
    }

    const now = performance.now()
    if (state.moving && this.lastGear > 0 && state.gear > this.lastGear) this.cutUntil = now + CLASSIC_UPSHIFT_CUT_MS
    this.lastGear = state.gear

    const cut = now < this.cutUntil
    this.postClassic({
      type: 'control',
      rpm: state.rpm,
      load: cut ? 0 : state.load,
      overrun: state.overrun,
      cut: cut ? 1 : 0,
      limiter: state.limiter
    })
  }

  setVolume(volume: number) {
    if (!this.volume || !this.context) return
    this.volume.gain.setTargetAtTime(volume, this.context.currentTime, GLIDE_SECONDS)
  }

  async stop() {
    this.postCore({ type: 'ignition', on: false })
    await this.context?.close()

    this.context = null
    this.core = null
    this.classic = null
    this.volume = null
    this.lastGear = 0
  }

  private route(kind: Kind) {
    this.kind = kind
    if (!this.volume || !this.core || !this.classic) return

    const active = kind === 'core' ? this.core : this.classic
    const inactive = kind === 'core' ? this.classic : this.core

    inactive.disconnect()
    active.disconnect()
    active.connect(this.volume)
  }

  private postCore(message: EngineMessage) {
    this.core?.port.postMessage(message)
  }

  private postClassic(message: SynthMessage) {
    this.classic?.port.postMessage(message)
  }
}

function createContext(): AudioContext {
  const context = new AudioContext({ latencyHint: 'interactive' })
  if (context.sampleRate >= MIN_SAMPLE_RATE && context.sampleRate <= MAX_SAMPLE_RATE) return context

  void context.close()
  return new AudioContext({ latencyHint: 'interactive', sampleRate: MAX_SAMPLE_RATE })
}
