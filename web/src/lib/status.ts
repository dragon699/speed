export type Tone = 'ok' | 'warn' | 'bad' | 'idle' | 'wait'

export type IconName = 'server' | 'phone' | 'car' | 'charger' | 'gps' | 'sound' | 'screen' | 'motion' | 'record'

export interface StatusItem {
  icon: IconName
  label: string
  value: string
  tone: Tone
}
