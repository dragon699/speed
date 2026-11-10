import { readStorage, writeStorage } from './storage'

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 12
const CODE_GROUP = 4

export function takeHashParam(name: string): string | null {
  const params = new URLSearchParams(location.hash.slice(1))
  const value = params.get(name)
  if (value === null) return null

  params.delete(name)
  const rest = params.toString()
  history.replaceState(null, '', `${location.pathname}${location.search}${rest ? `#${rest}` : ''}`)

  return value
}

export function loadKey(): string | null {
  const key = takeHashParam('key')
  if (key) writeStorage('key', key)

  return readStorage('key')
}

export function loadCarCode(): string {
  const stored = readStorage('carCode')
  if (stored && stored.length >= CODE_LENGTH && isValidCode(stored)) return stored

  const code = createCode()
  writeStorage('carCode', code)
  return code
}

export function takeLinkedCode(): string | null {
  const linked = takeHashParam('code')
  const code = linked === null ? null : normalizeCode(linked)
  return code && isValidCode(code) ? code : null
}

export function loadPhoneCode(): string | null {
  return readStorage('code')
}

export function savePhoneCode(code: string) {
  writeStorage('code', code)
}

export function createCode(): string {
  const values = crypto.getRandomValues(new Uint8Array(CODE_LENGTH))
  return Array.from(values, (value) => CODE_ALPHABET[value % CODE_ALPHABET.length]).join('')
}

export function normalizeCode(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase()
}

export function formatCode(code: string): string {
  return code.match(new RegExp(`.{1,${CODE_GROUP}}`, 'g'))?.join('-') ?? code
}

export function isValidCode(code: string): boolean {
  return /^[A-Z0-9]{4,16}$/.test(code)
}

export function pairingUrl(code: string): string {
  return `${location.origin}/phone#code=${code}`
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
