import profiles from '../engines.json'

export type EngineProfile = (typeof profiles)[number]

const ENGINE_STORAGE = 'speed.engine'

export const engineProfiles: EngineProfile[] = profiles

export function loadEngine(): EngineProfile {
  const id = localStorage.getItem(ENGINE_STORAGE)
  return engineProfiles.find((profile) => profile.id === id) ?? engineProfiles[0]
}
