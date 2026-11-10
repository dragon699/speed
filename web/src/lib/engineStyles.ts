export interface EngineStyle {
  body: string
  color: string
}

export const ENGINE_STYLES: Record<string, EngineStyle> = {
  'i5-turbo-25': { body: 'hatch', color: '#3dd6c6' },
  'flat6-na-40': { body: 'gtwing', color: '#4aa8ff' },
  'v10-na-52': { body: 'wedge', color: '#9bd34a' },
  'i4-turbo-20': { body: 'hatch', color: '#f05d5e' },
  'i6-twinturbo-30': { body: 'coupe', color: '#c17cff' },
  'rotary-twin-13': { body: 'coupe', color: '#ff5f8f' },
  'flat4-turbo-25': { body: 'rally', color: '#5b8cff' },
  'v6-twinturbo-38': { body: 'coupe', color: '#a8b3c4' },
  'v8-na-50': { body: 'muscle', color: '#2f6fed' },
  'v8-na-62': { body: 'supercar', color: '#ffd34d' },
  'v8-sc-62': { body: 'muscle', color: '#ff8a5c' },
  'v12-na-65': { body: 'supercar', color: '#e5484d' },
  'v8-flatplane-45': { body: 'supercar', color: '#f2a33a' },
  'v10-na-48': { body: 'supercar', color: '#e8e8ec' },
  'v8-twinturbo-40': { body: 'hatch', color: '#b6c2d1' }
}

export const DEFAULT_STYLE: EngineStyle = { body: 'coupe', color: '#e5484d' }
