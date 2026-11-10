import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { EngineProfile } from '../../../engines'
import { ControlBridge } from '../../control'
import { QUANTUM, type OutputConfig } from '../../core/contracts'
import { TesboxDspCore } from '../../core/dsp/dsp-core'

export const SAMPLE_RATE = 44100
export const SAMPLES_DIR = fileURLToPath(new URL('../../../../../../samples/stuntrally3', import.meta.url))

const OUTPUT: OutputConfig = { subwoofer: 'yes', hpCornerHz: 40, volumeTrimDb: 0 }
const WARMUP_S = 1

export interface Reference {
  engineId: string
  folder: string
  prefix: string
  rpms: number[]
}

export const REFERENCES: Reference[] = [
  { engineId: 'v8-na-62', folder: 'v8-crossplane-b', prefix: 'b-v8', rpms: [1000, 2000, 3000, 4000, 5000, 6000] },
  { engineId: 'v8-flatplane-45', folder: 'v8-flatplane-twinturbo', prefix: 'v8f', rpms: [1000, 2000, 3000, 4000, 6000, 8000] },
  { engineId: 'i6-twinturbo-30', folder: 'inline6-512hp', prefix: 'b-i6r', rpms: [1000, 2000, 3000, 4000, 5000, 6000] },
  { engineId: 'flat4-turbo-25', folder: 'boxer4-mid', prefix: 'su-mid', rpms: [1000, 2000, 3000, 4000, 5000, 6000] }
]

export function samplesAvailable(): boolean {
  return existsSync(SAMPLES_DIR)
}

export function readWav(path: string): Float32Array {
  const buffer = readFileSync(path)
  let offset = 12

  while (offset < buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4)
    const size = buffer.readUInt32LE(offset + 4)

    if (id === 'data') {
      const out = new Float32Array(size / 2)
      for (let i = 0; i < out.length; i++) out[i] = buffer.readInt16LE(offset + 8 + i * 2) / 32768
      return out
    }

    offset += 8 + size + (size % 2)
  }

  throw new Error(`${path}: no data chunk`)
}

export function referenceAudio(reference: Reference, rpm: number): Float32Array {
  return readWav(`${SAMPLES_DIR}/${reference.folder}/${reference.prefix}-${rpm / 1000}.wav`)
}

export function renderSteady(profile: EngineProfile, rpm: number, load: number, seconds: number, sampleRate = SAMPLE_RATE): Float32Array {
  if (profile.sound.kind !== 'core') throw new Error(`${profile.id} is not a core engine`)

  const dsp = new TesboxDspCore(sampleRate)
  const bridge = new ControlBridge()
  const left = new Float32Array(QUANTUM)
  const right = new Float32Array(QUANTUM)
  const out = new Float32Array(Math.floor(seconds * sampleRate))
  const warmupBlocks = Math.ceil((WARMUP_S * sampleRate) / QUANTUM)

  dsp.configure(profile.sound.def, OUTPUT, 'full')
  bridge.ignition(true, -10)
  bridge.update({ rpm, load, gear: 3, limiter: false, moving: true }, 0)

  let written = 0
  for (let block = 0; written < out.length; block++) {
    const now = (block * QUANTUM) / sampleRate
    bridge.tick(now)
    dsp.render(bridge.ctl, left, right, QUANTUM, now)
    if (block < warmupBlocks) continue
    for (let i = 0; i < QUANTUM && written < out.length; i++) out[written++] = (left[i] + right[i]) / 2
  }

  return out
}
