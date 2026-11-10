export interface TurboSound {
  spoolRpm: number
  spoolRange: number
  whistle: [number, number]
  whine: number
  hiss: number
  whoosh: number
  bov: number
}

export interface SoundProfile {
  primaries?: number[]
  header?: number[]
  pipe?: number[]
  muffler?: number
  chamber?: [number, number]
  rasp?: [number, number]
  bark?: number
  lope?: number
  cylinderSpread?: number
  jitterDeg?: number
  attackDeg?: number
  decayDeg?: number
  intake?: [number, number]
  block?: number
  body?: [number, number]
  pops?: number
  pan?: number
  gain?: number
  turbo?: TurboSound
}

export interface VoiceProfile {
  fireAngles: number[]
  banks: number[]
  idle: number
  redline: number
  sound: SoundProfile
}

export interface ResolvedSound extends Required<Omit<SoundProfile, 'turbo'>> {
  turbo?: TurboSound
}

const DEFAULTS = {
  primary: 0.6,
  header: 0.5,
  pipe: 2.2,
  muffler: 800,
  chamber: [120, 4] as [number, number],
  rasp: [1.6, 2200] as [number, number],
  bark: 0.75,
  lope: 0.2,
  cylinderSpread: 0.04,
  jitterDeg: 1,
  attackDeg: 12,
  decayDeg: 38,
  intake: [0.3, 600] as [number, number],
  block: 0.5,
  body: [320, 5] as [number, number],
  pops: 14,
  pan: 0.7,
  gain: 1.4
}

export function bankCount(profile: VoiceProfile): number {
  return new Set(profile.banks).size
}

export function resolveSound(profile: VoiceProfile): ResolvedSound {
  const s = profile.sound
  const banks = bankCount(profile)
  const perBank = (values: number[] | undefined, fallback: number) =>
    Array.from({ length: banks }, (_, b) => values?.[b] ?? fallback)

  return {
    primaries: profile.fireAngles.map((_, k) => s.primaries?.[k] ?? DEFAULTS.primary),
    header: perBank(s.header, DEFAULTS.header),
    pipe: perBank(s.pipe, DEFAULTS.pipe),
    muffler: s.muffler ?? DEFAULTS.muffler,
    chamber: s.chamber ?? DEFAULTS.chamber,
    rasp: s.rasp ?? DEFAULTS.rasp,
    bark: s.bark ?? DEFAULTS.bark,
    lope: s.lope ?? DEFAULTS.lope,
    cylinderSpread: s.cylinderSpread ?? DEFAULTS.cylinderSpread,
    jitterDeg: s.jitterDeg ?? DEFAULTS.jitterDeg,
    attackDeg: s.attackDeg ?? DEFAULTS.attackDeg,
    decayDeg: s.decayDeg ?? DEFAULTS.decayDeg,
    intake: s.intake ?? DEFAULTS.intake,
    block: s.block ?? DEFAULTS.block,
    body: s.body ?? DEFAULTS.body,
    pops: s.pops ?? DEFAULTS.pops,
    pan: s.pan ?? DEFAULTS.pan,
    gain: s.gain ?? DEFAULTS.gain,
    turbo: s.turbo
  }
}
