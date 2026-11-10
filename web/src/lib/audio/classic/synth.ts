import { Biquad, Random, clamp, decay, smoothing, softClip } from './dsp'
import type { VoiceProfile } from './sound'
import { Voice, type Controls } from './voice'

export interface ControlMessage {
  type: 'control'
  rpm: number
  load: number
  overrun: number
  cut: number
  limiter: boolean
  crackle?: number
}

export interface ProfileMessage {
  type: 'profile'
  profile: VoiceProfile
}

export type SynthMessage = ControlMessage | ProfileMessage

const MAX_VOICES = 3
const LEVELER_THRESHOLD = 0.28
const PEAK_CEILING = 0.92
const LIMITER_RPM_DIP = 220
const LIMITER_CUT_SHARE = 0.42
const OUTPUT_TRIM = 0.6
const LOW_CUT_HZ = 40

export class EngineSynth {
  private sampleRate: number
  private voices: Voice[] = []
  private seeds = new Random(0x2545f491)
  private limiterRandom = new Random(0x51ed2701)
  private target = { rpm: 0, load: 0, overrun: 0, cut: 0, limiter: false, crackle: 1 }
  private controls: Controls = { rpm: 0, load: 0, overrun: 0, cut: 0, crackle: 1, limiterCut: false }
  private frame = new Float64Array(2)
  private output = new Float64Array(2)
  private limiterPhase = 0
  private limiterRate = 11
  private level = 0
  private peak = 0
  private highpassL: Biquad[]
  private highpassR: Biquad[]

  private readonly kRpm: number
  private readonly kLoad: number
  private readonly kOverrun: number
  private readonly kLevelAttack: number
  private readonly kLevelRelease: number
  private readonly peakRelease: number
  private readonly fadeStep: number

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate
    this.kRpm = smoothing(0.03, sampleRate)
    this.kLoad = smoothing(0.04, sampleRate)
    this.kOverrun = smoothing(0.08, sampleRate)
    this.kLevelAttack = smoothing(0.03, sampleRate)
    this.kLevelRelease = smoothing(0.35, sampleRate)
    this.peakRelease = decay(0.3, sampleRate)
    this.fadeStep = 1 / (0.45 * sampleRate)
    this.highpassL = [new Biquad().highpass(sampleRate, LOW_CUT_HZ), new Biquad().highpass(sampleRate, LOW_CUT_HZ)]
    this.highpassR = [new Biquad().highpass(sampleRate, LOW_CUT_HZ), new Biquad().highpass(sampleRate, LOW_CUT_HZ)]
  }

  message(message: SynthMessage) {
    if (message.type === 'profile') {
      this.addVoice(message.profile)
    } else {
      this.target.rpm = message.rpm
      this.target.load = clamp(message.load, 0, 1)
      this.target.overrun = clamp(message.overrun, 0, 1)
      this.target.cut = clamp(message.cut, 0, 1)
      this.target.limiter = message.limiter
      this.target.crackle = message.crackle ?? this.target.crackle
    }
  }

  process(left: Float32Array, right: Float32Array) {
    const n = left.length

    for (let i = 0; i < n; i++) {
      this.renderSample()
      left[i] = this.output[0]
      right[i] = this.output[1]
    }

    if (this.voices.length > 1) this.voices = this.voices.filter((voice) => voice.target > 0 || voice.fade > 0)
  }

  private addVoice(profile: VoiceProfile) {
    const first = this.voices.length === 0

    if (first) {
      this.controls.rpm = this.target.rpm || profile.idle
    }

    for (const voice of this.voices) voice.target = 0
    this.voices.push(new Voice(this.sampleRate, profile, this.seeds.nextUint(), first ? 1 : 0))

    if (this.voices.length > MAX_VOICES) this.voices.splice(0, this.voices.length - MAX_VOICES)
  }

  private renderSample() {
    const c = this.controls
    const t = this.target

    c.rpm += (t.rpm - c.rpm) * this.kRpm
    c.load += (t.load - c.load) * this.kLoad
    c.overrun += (t.overrun - c.overrun) * this.kOverrun
    c.cut = t.cut
    c.crackle = t.crackle

    let wobble = 0
    if (t.limiter) {
      this.limiterPhase += this.limiterRate / this.sampleRate
      if (this.limiterPhase >= 1) {
        this.limiterPhase -= 1
        this.limiterRate = 9 + 5 * this.limiterRandom.next()
      }
      c.limiterCut = this.limiterPhase < LIMITER_CUT_SHARE
      wobble = c.limiterCut
        ? this.limiterPhase / LIMITER_CUT_SHARE
        : 1 - (this.limiterPhase - LIMITER_CUT_SHARE) / (1 - LIMITER_CUT_SHARE)
    } else {
      c.limiterCut = false
    }

    const rpm = c.rpm
    c.rpm = rpm - LIMITER_RPM_DIP * wobble

    let l = 0
    let r = 0

    for (const voice of this.voices) {
      if (voice.fade !== voice.target) {
        voice.fade = voice.target > voice.fade
          ? Math.min(voice.target, voice.fade + this.fadeStep)
          : Math.max(voice.target, voice.fade - this.fadeStep)
      }
      if (voice.fade <= 0 && voice.target <= 0) continue

      voice.render(c, this.frame)
      const gain = voice.fade * voice.fade * (3 - 2 * voice.fade) * voice.gain
      l += this.frame[0] * gain
      r += this.frame[1] * gain
    }

    c.rpm = rpm

    l = this.highpassL[1].run(this.highpassL[0].run(l))
    r = this.highpassR[1].run(this.highpassR[0].run(r))

    const level = Math.max(Math.abs(l), Math.abs(r))
    this.level += (level - this.level) * (level > this.level ? this.kLevelAttack : this.kLevelRelease)
    if (this.level > LEVELER_THRESHOLD) {
      const reduction = Math.pow(LEVELER_THRESHOLD / this.level, 0.45)
      l *= reduction
      r *= reduction
    }

    l = softClip(l)
    r = softClip(r)

    const peak = Math.max(Math.abs(l), Math.abs(r))
    this.peak = peak > this.peak ? peak : this.peak * this.peakRelease
    const ceiling = this.peak > PEAK_CEILING ? PEAK_CEILING / this.peak : 1

    this.output[0] = l * ceiling * OUTPUT_TRIM
    this.output[1] = r * ceiling * OUTPUT_TRIM
  }
}
