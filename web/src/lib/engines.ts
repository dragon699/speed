import classicJson from './audio/classic/engines.json'
import type { SoundProfile, VoiceProfile } from './audio/classic/sound'
import type { EngineDef, EngineSpec } from './audio/core/contracts'
import { ENGINES } from './audio/core/engines'
import { rollingCircumferenceM } from './audio/core/tyre'
import { DEFAULT_STYLE, ENGINE_STYLES } from './engineStyles'
import { readStorage, writeStorage } from './storage'

export type EngineSoundSource = { kind: 'core'; def: EngineDef } | { kind: 'classic'; voice: VoiceProfile }

export type EngineSetId = 'classic' | 'core'

export interface EngineProfile {
  id: string
  set: EngineSetId
  name: string
  inspiredBy: string
  body: string
  color: string
  layout: string
  displacement: number
  aspiration: string
  cylinders: number
  fireAngles: number[]
  banks: number[]
  cycleDeg: number
  idle: number
  redline: number
  limiterRpm: number
  gears: number[]
  tireCircumference: number
  shiftTimeS: number
  sound: EngineSoundSource
}

export interface EngineSet {
  id: EngineSetId
  label: string
  engines: EngineProfile[]
}

interface ClassicEngine {
  id: string
  name: string
  inspiredBy: string
  body: string
  color: string
  layout: string
  displacement: number
  aspiration: string
  cylinders: number
  fireAngles: number[]
  banks: number[]
  idle: number
  redline: number
  gears: number[]
  finalDrive: number
  sound: SoundProfile
}

const CLASSIC_TIRE_CIRCUMFERENCE_M = 2.1
const CLASSIC_SHIFT_TIME_S = 0.08

export function layoutLabel(spec: EngineSpec): string {
  const { type, bankAngleDeg, crank } = spec.layout
  const count = spec.combustion.length

  if (type === 'rotary') return 'Twin-rotor'
  if (type === 'inline') return `Inline-${count}`
  if (type === 'flat') return `Flat-${count}`
  if (crank !== 'n/a') return `V${count} · ${crank}`
  return `${bankAngleDeg}° V${count}`
}

export function aspirationLabel(spec: EngineSpec): string {
  const { type, turbo } = spec.aspiration

  if (type === 'supercharger') return 'supercharged'
  if (type === 'turbo') return turbo && turbo.count > 1 ? 'twin-turbo' : 'turbo'
  return 'NA'
}

export function toEngineProfile(def: EngineDef): EngineProfile {
  const { spec } = def
  const style = ENGINE_STYLES[def.id] ?? DEFAULT_STYLE

  return {
    id: def.id,
    set: 'core',
    name: def.name,
    inspiredBy: def.inspiredBy,
    body: style.body,
    color: style.color,
    layout: layoutLabel(spec),
    displacement: spec.layout.displacementL,
    aspiration: aspirationLabel(spec),
    cylinders: spec.combustion.length,
    fireAngles: spec.combustion.map((entry) => entry.angleDeg),
    banks: spec.combustion.map((entry) => entry.bank),
    cycleDeg: spec.cycleDeg,
    idle: spec.rpm.idle,
    redline: spec.rpm.redline,
    limiterRpm: spec.rpm.limiter.rpm,
    gears: spec.gearbox.overallRatios,
    tireCircumference: rollingCircumferenceM(spec.gearbox.drivenTyre),
    shiftTimeS: spec.gearbox.shiftTimeS,
    sound: { kind: 'core', def }
  }
}

export function toClassicProfile(engine: ClassicEngine): EngineProfile {
  return {
    id: engine.id,
    set: 'classic',
    name: engine.name,
    inspiredBy: engine.inspiredBy,
    body: engine.body,
    color: engine.color,
    layout: engine.layout,
    displacement: engine.displacement,
    aspiration: engine.aspiration,
    cylinders: engine.cylinders,
    fireAngles: engine.fireAngles,
    banks: engine.banks,
    cycleDeg: 720,
    idle: engine.idle,
    redline: engine.redline,
    limiterRpm: engine.redline,
    gears: engine.gears.map((ratio) => ratio * engine.finalDrive),
    tireCircumference: CLASSIC_TIRE_CIRCUMFERENCE_M,
    shiftTimeS: CLASSIC_SHIFT_TIME_S,
    sound: {
      kind: 'classic',
      voice: { fireAngles: engine.fireAngles, banks: engine.banks, idle: engine.idle, redline: engine.redline, sound: engine.sound }
    }
  }
}

export const engineSets: EngineSet[] = [
  { id: 'classic', label: 'Custom', engines: (classicJson as unknown as ClassicEngine[]).map(toClassicProfile) },
  { id: 'core', label: 'DSP', engines: ENGINES.map(toEngineProfile) }
]

export const engineProfiles: EngineProfile[] = engineSets.flatMap((set) => set.engines)

export function engineSet(id: EngineSetId): EngineSet {
  return engineSets.find((set) => set.id === id) ?? engineSets[0]
}

export function loadEngine(): EngineProfile {
  const id = readStorage('engine')
  return engineProfiles.find((profile) => profile.id === id) ?? engineSet('core').engines[0]
}

export function saveEngine(profile: EngineProfile) {
  writeStorage('engine', profile.id)
}
