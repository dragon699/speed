export type Tone = 'ok' | 'warn' | 'bad' | 'idle' | 'wait'

export type IconName =
  | 'server'
  | 'phone'
  | 'car'
  | 'charger'
  | 'gps'
  | 'sound'
  | 'screen'
  | 'motion'
  | 'record'
  | 'play'
  | 'pause'
  | 'timer'
  | 'link'
  | 'display'
  | 'clock'
  | 'gauge'

export interface BulletItem {
  key: string
  icon: IconName
  text: string
  detail?: string
  tone: Tone
  active?: boolean
}

export interface BulletSection {
  title: string
  items: BulletItem[]
}
