import type { EngineDef, OutputConfig } from './core/contracts'
import type { EngineInput, EngineSettings } from './control'

export type EngineMessage =
  | { type: 'engine'; def: EngineDef }
  | ({ type: 'control' } & EngineInput)
  | { type: 'ignition'; on: boolean }
  | ({ type: 'settings' } & Partial<EngineSettings>)
  | { type: 'output'; config: OutputConfig }

export type EngineEvent = { type: 'ready' } | { type: 'error'; message: string }
