const KEY_STORAGE = 'speed.key'
const CODE_STORAGE = 'speed.code'
const FIRST_SEEN_STORAGE = 'speed.firstSeen'

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 6

export function loadKey(): string | null {
  const key = new URLSearchParams(location.hash.slice(1)).get('key')

  if (key) {
    localStorage.setItem(KEY_STORAGE, key)
    history.replaceState(null, '', location.pathname)
  }

  return localStorage.getItem(KEY_STORAGE)
}

export function loadCode(): string | null {
  return localStorage.getItem(CODE_STORAGE)
}

export function saveCode(code: string) {
  localStorage.setItem(CODE_STORAGE, code)
}

export function createCode(): string {
  const values = crypto.getRandomValues(new Uint8Array(CODE_LENGTH))
  return Array.from(values, (value) => CODE_ALPHABET[value % CODE_ALPHABET.length]).join('')
}

export function isValidCode(code: string): boolean {
  return /^[A-Z0-9]{4,8}$/.test(code)
}

export function loadFirstSeen(): string {
  const firstSeen = localStorage.getItem(FIRST_SEEN_STORAGE) ?? new Date().toISOString()
  localStorage.setItem(FIRST_SEEN_STORAGE, firstSeen)
  return firstSeen
}
