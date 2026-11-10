import { Biquad, Random, Resonator, TAU, clamp, decay, smoothing } from './dsp'
import { resolveSound, type ResolvedSound, type TurboSound, type VoiceProfile } from './sound'

export interface Controls {
  rpm: number
  load: number
  overrun: number
  cut: number
  crackle: number
  limiterCut: boolean
}

const GAS_SPEED_HOT = 520
const GAS_SPEED_COLD = 343
const CYCLE_DEG = 720
const EXHAUST_DURATION_DEG = 240
const DISPLACEMENT = 0.25
const MUFFLER_UPDATE_SAMPLES = 32
const MAX_ATTACK_MS = 0.6
const BODY_Q = 0.8
const MUFFLER_OPEN_OCTAVES = 1.2
const RASP_BASE = 0.25
const RASP_OPEN = 0.35
const RASP_BYPASS = 0.2
const BARK_BASE = 0.35
const BARK_OPEN = 0.35

const BLOCK_MODES: [number, number, number][] = [
  [110, 2.5, 1],
  [280, 3, 0.6],
  [700, 3, 0.35]
]

interface Bank {
  header: Resonator
  pipe: Resonator
  rasp: Biquad
  muffler: Biquad
  muffler2: Biquad
  chamber: Biquad
  dc: number
  previous: number
  popDelay: number
  popAmp: number
  crack: number
  thump: number
  thumpPhase: number
  thumpFrequency: number
  crackState: number
}

function createBank(sr: number, sound: ResolvedSound, b: number): Bank {
  return {
    header: new Resonator(((2 * sound.header[b]) / GAS_SPEED_HOT) * sr, 0.45, 0.55),
    pipe: new Resonator(((2 * sound.pipe[b]) / GAS_SPEED_HOT) * sr, -0.55, 0.4),
    rasp: new Biquad().bandpass(sr, sound.rasp[1] * (1 + 0.07 * b), 0.8),
    muffler: new Biquad(),
    muffler2: new Biquad(),
    chamber: new Biquad().peak(sr, sound.chamber[0] * (1 + 0.05 * b), 1.1, sound.chamber[1]),
    dc: 0,
    previous: 0,
    popDelay: -1,
    popAmp: 0,
    crack: 0,
    thump: 0,
    thumpPhase: 0,
    thumpFrequency: 90,
    crackState: 0
  }
}

export class Voice {
  fade: number
  target = 1
  gain: number

  private sampleRate: number
  private random: Random
  private idle: number
  private redline: number
  private slots: number
  private baseAngle: Float64Array
  private angle: Float64Array
  private slotBank: Uint8Array
  private delay: Float64Array
  private cylinderGain: Float64Array
  private pulseTime: Float64Array
  private pulseDeg: Float64Array
  private pulseAmp: Float64Array
  private pulseAttack: Float64Array
  private pulseDecay: Float64Array
  private pulseBlow: Float64Array
  private pulseOn: Uint8Array
  private banks: Bank[]
  private intakeComb: Resonator
  private intakeBand: Biquad
  private intakeLow: Biquad
  private blockModes: Biquad[]
  private sound: ResolvedSound
  private turbo: TurboSound | undefined
  private whistleBand = new Biquad()
  private whooshBand: Biquad
  private bovBand = new Biquad()
  private bodyL: Biquad
  private bodyR: Biquad

  private theta = 0
  private next = 0
  private speedNudge = 0
  private open = -1
  private openSet = -1
  private mufflerCountdown = 0
  private limiterGate = 1
  private overrunGate = 1
  private overrunGateCountdown = 0
  private spool = 0
  private loadSlow = 0
  private whistlePhase = 0
  private whistleSet = -1
  private bovEnv = 0
  private bovSet = -1

  private readonly speedDecay: number
  private readonly crackDecay: number
  private readonly thumpDecay: number
  private readonly bovDecay: number
  private readonly spoolUp: number
  private readonly spoolDown: number
  private readonly slowLoad: number
  private readonly limiterSmoothing: number
  private readonly diffScale: number

  constructor(sampleRate: number, profile: VoiceProfile, seed: number, fade: number) {
    const sr = (this.sampleRate = sampleRate)
    this.random = new Random(seed)
    this.fade = fade
    this.idle = profile.idle
    this.redline = profile.redline
    this.sound = resolveSound(profile)
    this.gain = this.sound.gain
    this.turbo = this.sound.turbo

    const bankIds = [...new Set(profile.banks)].sort()
    const n = (this.slots = profile.fireAngles.length)
    const array = () => new Float64Array(n)

    this.baseAngle = Float64Array.from(profile.fireAngles)
    this.angle = Float64Array.from(profile.fireAngles)
    this.slotBank = Uint8Array.from(profile.banks.map((bank) => bankIds.indexOf(bank)))
    this.delay = Float64Array.from(this.sound.primaries.map((length) => (length / GAS_SPEED_HOT) * sr))
    this.cylinderGain = Float64Array.from(profile.fireAngles.map(() => 1 + this.random.white() * this.sound.cylinderSpread))
    this.pulseTime = array()
    this.pulseDeg = array()
    this.pulseAmp = array()
    this.pulseAttack = array()
    this.pulseDecay = array()
    this.pulseBlow = array()
    this.pulseOn = new Uint8Array(n)

    this.banks = bankIds.map((_, b) => createBank(sr, this.sound, b))

    this.intakeComb = new Resonator(((2 * 0.35) / GAS_SPEED_COLD) * sr, 0.6, 0.45)
    this.intakeBand = new Biquad().bandpass(sr, this.sound.intake[1], 1.4)
    this.intakeLow = new Biquad().lowpass(sr, 3000)
    this.blockModes = BLOCK_MODES.map(([hz, q]) => new Biquad().bandpass(sr, hz, q))
    this.whooshBand = new Biquad().bandpass(sr, 2400, 0.7)
    this.bodyL = new Biquad().peak(sr, this.sound.body[0], BODY_Q, this.sound.body[1])
    this.bodyR = new Biquad().peak(sr, this.sound.body[0], BODY_Q, this.sound.body[1])

    this.speedDecay = decay(0.05, sr)
    this.crackDecay = decay(0.0016, sr)
    this.thumpDecay = decay(0.035, sr)
    this.bovDecay = decay(0.3, sr)
    this.spoolUp = smoothing(0.45, sr)
    this.spoolDown = smoothing(0.12, sr)
    this.slowLoad = smoothing(0.18, sr)
    this.limiterSmoothing = smoothing(0.004, sr)
    this.diffScale = sr / (TAU * 500)
  }

  render(c: Controls, out: Float64Array) {
    const sr = this.sampleRate
    const random = this.random
    const rpm = c.rpm
    const load = c.load
    const rpmN = clamp(rpm / this.redline, 0, 1)

    this.updateMuffler(load)
    this.limiterGate += ((c.limiterCut ? 0.25 : 1) - this.limiterGate) * this.limiterSmoothing
    this.loadSlow += (load - this.loadSlow) * this.slowLoad

    if (--this.overrunGateCountdown <= 0) {
      this.overrunGateCountdown = (0.08 + 0.17 * random.next()) * sr
      this.overrunGate = random.next() < 0.55 ? 1 : 0.12
    }

    const dps = rpm > 30 ? ((rpm * 6) / sr) * (1 + this.speedNudge) : 0
    this.speedNudge *= this.speedDecay

    let theta = this.theta + dps
    while (dps > 0 && theta >= this.angle[this.next]) {
      const k = this.next
      this.fire(k, (theta - this.angle[k]) / dps, dps, c, rpmN)
      if (++this.next >= this.slots) {
        this.next = 0
        theta -= CYCLE_DEG
      }
    }
    this.theta = theta

    let bank0 = 0
    let bank1 = 0

    for (let k = 0; k < this.slots; k++) {
      if (!this.pulseOn[k]) continue

      const t = this.pulseTime[k]
      this.pulseTime[k] = t + 1
      if (t < 0) continue

      let blow: number
      const attack = this.pulseAttack[k]
      if (t < attack) {
        const x = t / attack
        blow = x * x * (3 - 2 * x)
      } else {
        blow = this.pulseBlow[k]
        this.pulseBlow[k] = blow * this.pulseDecay[k]
      }

      const deg = this.pulseDeg[k]
      this.pulseDeg[k] = deg + dps

      let displacement = 0
      if (deg < EXHAUST_DURATION_DEG) {
        const x = deg / EXHAUST_DURATION_DEG
        displacement = 4 * x * (1 - x) * DISPLACEMENT
      } else if (blow < 5e-4) {
        this.pulseOn[k] = 0
      }

      const pressure = (blow + displacement) * this.pulseAmp[k]
      if (this.slotBank[k] === 0) bank0 += pressure
      else bank1 += pressure
    }

    const open = this.open
    const raspGain = this.sound.rasp[0] * (RASP_BASE + RASP_OPEN * open) * (0.35 + 0.65 * load) * (0.6 + 0.6 * rpmN)
    const barkGain = this.sound.bark * (BARK_BASE + BARK_OPEN * open)
    const popGain = 0.55 + 0.6 * open

    let left = 0
    let right = 0

    for (let b = 0; b < this.banks.length; b++) {
      const bank = this.banks[b]
      let x = b === 0 ? bank0 : bank1
      x += random.white() * 0.015 * (x + 0.02)

      bank.dc += (x - bank.dc) * 0.0004
      const derivative = (x - bank.previous) * this.diffScale
      bank.previous = x

      const rasp = bank.rasp.run(random.white() * x) * raspGain
      const pop = this.renderPop(bank)
      const source = (x - bank.dc) + derivative * barkGain + rasp + pop * 0.35

      let y = source + 0.5 * bank.header.run(source) + 0.6 * bank.pipe.run(source)
      y = bank.chamber.run(bank.muffler2.run(bank.muffler.run(y))) + rasp * RASP_BYPASS * open + pop * popGain

      if (this.banks.length === 1) {
        left = right = y
      } else if (b === 0) {
        left += y * this.sound.pan
        right += y * (1 - this.sound.pan)
      } else {
        left += y * (1 - this.sound.pan)
        right += y * this.sound.pan
      }
    }

    const common = this.renderIntake(theta, load, rpmN) + this.renderBlock(bank0 + bank1, load) + this.renderTurbo(rpm, load)

    out[0] = this.bodyL.run(left + common)
    out[1] = this.bodyR.run(right + common)
  }

  private fire(k: number, fraction: number, dps: number, c: Controls, rpmN: number) {
    const sr = this.sampleRate
    const random = this.random
    const { rpm, load, overrun } = c
    const bank = this.slotBank[k]

    const idleness = clamp(1 - (rpm - this.idle) / 1500, 0, 1) * (1 - 0.8 * load)
    const variation = 0.02 + this.sound.lope * 0.15 * idleness
    const g = random.gauss()

    let amp = (0.14 + 0.86 * Math.pow(load, 0.8)) * (0.78 + 0.22 * rpmN)
    amp *= this.cylinderGain[k] * (1 + variation * g) * (1 - 0.4 * overrun)

    const popDelay = this.delay[k] + (0.002 + 0.008 * random.next()) * sr
    const eventsPerSecond = Math.max(1, ((rpm / 60) * this.slots) / 2)
    const popsPerSecond = this.sound.pops * c.crackle

    if (c.limiterCut || (c.cut > 0 && random.next() < c.cut)) {
      amp = 0.06
      if (random.next() < (c.limiterCut ? 0.06 : 0.3) * c.crackle) this.queuePop(bank, 0.5 + 0.6 * random.next(), popDelay)
    } else {
      this.speedNudge = clamp(this.speedNudge + g * variation * 0.06, -0.06, 0.06)

      if (overrun > 0.01 && popsPerSecond > 0) {
        const rate =
          Math.pow(overrun, 1.5) * this.overrunGate * popsPerSecond * (0.6 + 0.6 * rpmN) * clamp((rpm - 1700) / 1200, 0, 1)

        if (random.next() < rate / eventsPerSecond) {
          const strength = (0.3 + 0.6 * random.next()) * (random.next() < 0.12 ? 1.7 : 1)
          this.queuePop(bank, strength, popDelay)
        }
      }
    }

    const sharpness = 0.75 + 0.5 * load

    this.pulseTime[k] = fraction - this.delay[k]
    this.pulseDeg[k] = 0
    this.pulseAmp[k] = amp
    this.pulseAttack[k] = clamp(this.sound.attackDeg / sharpness / dps, 0.00015 * sr, MAX_ATTACK_MS * 0.001 * sr)
    this.pulseDecay[k] = Math.exp(-1 / clamp(this.sound.decayDeg / dps, 0.0012 * sr, 0.008 * sr))
    this.pulseBlow[k] = 1
    this.pulseOn[k] = 1
    this.angle[k] = this.baseAngle[k] + random.white() * this.sound.jitterDeg
  }

  private queuePop(b: number, amp: number, delay: number) {
    const bank = this.banks[b]

    if (bank.popDelay >= 0) {
      bank.popAmp = Math.max(bank.popAmp, amp)
      return
    }

    bank.popDelay = delay
    bank.popAmp = amp
  }

  private renderPop(bank: Bank): number {
    if (bank.popDelay >= 0 && --bank.popDelay < 0) {
      bank.crack = Math.max(bank.crack, bank.popAmp)
      bank.thump = Math.max(bank.thump, bank.popAmp)
      bank.thumpPhase = 0
      bank.thumpFrequency = 65 + 55 * this.random.next()
    }

    if (bank.crack < 1e-4 && bank.thump < 1e-4) return 0

    bank.crackState += (this.random.white() - bank.crackState) * 0.45
    bank.thumpPhase += bank.thumpFrequency / this.sampleRate

    const pop = 1.7 * bank.crackState * bank.crack + 0.9 * Math.sin(TAU * bank.thumpPhase) * bank.thump
    bank.crack *= this.crackDecay
    bank.thump *= this.thumpDecay

    return pop
  }

  private renderIntake(theta: number, load: number, rpmN: number): number {
    const period = CYCLE_DEG / this.slots
    let phase = theta % period
    if (phase < 0) phase += period

    const stroke = Math.pow(Math.sin((Math.PI * phase) / period), 4)
    const gain = this.sound.intake[0] * (0.06 + load * load * (0.4 + 0.8 * rpmN) * 1.5) * this.limiterGate
    const source = this.random.white() * 0.8 * stroke + (stroke - 0.375) * 0.8

    return this.intakeLow.run(this.intakeBand.run(source + 0.5 * this.intakeComb.run(source))) * gain
  }

  private renderBlock(combustion: number, load: number): number {
    const input = combustion * (0.4 + 0.6 * load)
    let y = 0

    for (let m = 0; m < this.blockModes.length; m++) y += this.blockModes[m].run(input) * BLOCK_MODES[m][2]

    return y * this.sound.block
  }

  private renderTurbo(rpm: number, load: number): number {
    const turbo = this.turbo
    if (!turbo) return 0

    const sr = this.sampleRate
    const target = load * clamp((rpm - turbo.spoolRpm) / turbo.spoolRange, 0, 1)
    this.spool += (target - this.spool) * (target > this.spool ? this.spoolUp : this.spoolDown)

    if (this.loadSlow - load > 0.3 && this.spool > 0.25 && this.bovEnv < 0.1) this.bovEnv = Math.min(1, this.spool * 1.4)

    const frequency = turbo.whistle[0] + (turbo.whistle[1] - turbo.whistle[0]) * this.spool
    if (Math.abs(frequency - this.whistleSet) > 12) {
      this.whistleSet = frequency
      this.whistleBand.bandpass(sr, frequency * 1.5, 8)
    }

    this.whistlePhase += frequency / sr
    if (this.whistlePhase >= 1) this.whistlePhase -= 1

    const noise = this.random.white()
    let y =
      (Math.sin(TAU * this.whistlePhase) * turbo.whine + this.whistleBand.run(noise) * turbo.hiss) *
        this.spool *
        this.spool *
        (0.3 + 0.7 * load) +
      this.whooshBand.run(noise) * turbo.whoosh * this.spool * load

    if (this.bovEnv > 1e-4) {
      const bovFrequency = 2400 * (0.55 + 0.6 * this.bovEnv)
      if (Math.abs(bovFrequency - this.bovSet) > 20) {
        this.bovSet = bovFrequency
        this.bovBand.bandpass(sr, bovFrequency, 0.9)
      }

      y += this.bovBand.run(this.random.white()) * 1.4 * this.bovEnv * turbo.bov
      this.bovEnv *= this.bovDecay
    }

    return y
  }

  private updateMuffler(load: number) {
    if (--this.mufflerCountdown > 0) return
    this.mufflerCountdown = MUFFLER_UPDATE_SAMPLES

    const target = 0.3 + 0.7 * load
    this.open = this.open < 0 ? target : this.open + (target - this.open) * 0.15

    if (Math.abs(this.open - this.openSet) < 0.003) return
    this.openSet = this.open

    const cutoff = this.sound.muffler * Math.pow(2, this.open * MUFFLER_OPEN_OCTAVES)
    for (const bank of this.banks) {
      bank.muffler.lowpass(this.sampleRate, cutoff, 0.71)
      bank.muffler2.lowpass(this.sampleRate, cutoff * 2.6, 0.5)
    }
  }
}
