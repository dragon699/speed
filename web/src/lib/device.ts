import { readStorage, writeStorage } from './storage'

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 6

export function loadKey(): string | null {
  const key = new URLSearchParams(location.hash.slice(1)).get('key')

  if (key) {
    writeStorage('key', key)
    history.replaceState(null, '', location.pathname)
  }

  return readStorage('key')
}

export function loadCode(): string | null {
  return readStorage('code')
}

export function saveCode(code: string) {
  writeStorage('code', code)
}

export function createCode(): string {
  const values = crypto.getRandomValues(new Uint8Array(CODE_LENGTH))
  return Array.from(values, (value) => CODE_ALPHABET[value % CODE_ALPHABET.length]).join('')
}

export function isValidCode(code: string): boolean {
  return /^[A-Z0-9]{4,8}$/.test(code)
}

export function loadFirstSeen(): string {
  const firstSeen = readStorage('firstSeen') ?? new Date().toISOString()
  writeStorage('firstSeen', firstSeen)
  return firstSeen
}

export function loadPhoneName(): string | null {
  return readStorage('phoneName')
}

export function savePhoneName(name: string) {
  writeStorage('phoneName', name)
}

export async function detectPhoneName(): Promise<string> {
  const userAgentData = (navigator as Navigator & {
    userAgentData?: { getHighEntropyValues(hints: string[]): Promise<{ model?: string }> }
  }).userAgentData

  try {
    const { model } = (await userAgentData?.getHighEntropyValues(['model'])) ?? {}
    return model || 'Phone'
  } catch {
    return 'Phone'
  }
}
