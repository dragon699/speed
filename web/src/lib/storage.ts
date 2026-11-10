export const STORAGE_KEYS = {
  key: 'speed.key',
  code: 'speed.code',
  firstSeen: 'speed.firstSeen',
  phoneName: 'speed.phoneName',
  engine: 'speed.engine',
  mount: 'speed.mount',
  theme: 'speed.theme'
} as const

type StorageKey = keyof typeof STORAGE_KEYS

export function readStorage(key: StorageKey): string | null {
  try {
    return localStorage.getItem(STORAGE_KEYS[key])
  } catch {
    return null
  }
}

export function writeStorage(key: StorageKey, value: string) {
  try {
    localStorage.setItem(STORAGE_KEYS[key], value)
  } catch {
    return
  }
}
