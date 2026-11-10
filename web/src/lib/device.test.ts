import { describe, expect, it } from 'vitest'
import { createCode, formatCode, isValidCode, normalizeCode } from './device'

describe('pairing codes', () => {
  it('creates long unambiguous codes', () => {
    const code = createCode()
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{12}$/)
    expect(createCode()).not.toBe(code)
  })

  it('formats codes in groups of four and reads them back', () => {
    expect(formatCode('K7M2X9PQR4TD')).toBe('K7M2-X9PQ-R4TD')
    expect(normalizeCode(' k7m2-x9pq r4td ')).toBe('K7M2X9PQR4TD')
  })

  it('accepts old short codes and rejects junk', () => {
    expect(isValidCode('T5TUUH')).toBe(true)
    expect(isValidCode('K7M2X9PQR4TD')).toBe(true)
    expect(isValidCode('AB')).toBe(false)
    expect(isValidCode('K7M2-X9PQ')).toBe(false)
  })
})
