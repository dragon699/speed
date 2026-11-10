import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { it } from 'vitest'
import { renderSteady } from './audio/analysis/testing/reference'
import { Drivetrain } from './drivetrain'
import { engineProfiles, engineSet } from './engines'
import { TestDrive } from './testDrive'
import { fromKmh } from './units'

const FILE = join(tmpdir(), 'speed-golden.json')

function audioHash(index: number, rpm: number, load: number) {
  const audio = renderSteady(engineSet('core').engines[index], rpm, load, 0.5, 48000)
  return createHash('sha256').update(Buffer.from(audio.buffer)).digest('hex').slice(0, 16)
}

function drivetrainHash(index: number) {
  const drivetrain = new Drivetrain(engineProfiles[index])
  const testDrive = new TestDrive()
  const hash = createHash('sha256')
  const targets = [0, 150, 150, 40, 40, 0]
  for (const [step, target] of targets.entries()) {
    for (let i = 0; i < 300; i++) {
      const speed = testDrive.update(fromKmh(target), 1 / 60)
      const state = drivetrain.update(speed, 1 / 60, { rev: step === 5 && i < 120 })
      hash.update(JSON.stringify(state))
    }
  }
  return hash.digest('hex').slice(0, 16)
}

it.skipIf(!process.env.GOLDEN)('golden snapshot', () => {
  const snapshot: Record<string, string> = {}
  engineSet('core').engines.forEach((profile, index) => {
    snapshot[`${profile.id}/idle`] = audioHash(index, profile.idle, 0.12)
    snapshot[`${profile.id}/full`] = audioHash(index, profile.redline * 0.8, 1)
    snapshot[`${profile.id}/overrun`] = audioHash(index, profile.redline * 0.5, -1)
  })
  engineProfiles.forEach((profile, index) => {
    snapshot[`${profile.id}/drivetrain`] = drivetrainHash(index)
  })

  if (process.env.GOLDEN === 'write' || !existsSync(FILE)) {
    writeFileSync(FILE, JSON.stringify(snapshot, null, 2))
    console.log(`golden written to ${FILE}`)
    return
  }

  const expected = JSON.parse(readFileSync(FILE, 'utf8')) as Record<string, string>
  const changed = Object.keys(snapshot).filter((key) => snapshot[key] !== expected[key])
  writeFileSync(join(tmpdir(), 'speed-golden-diff.json'), JSON.stringify(changed, null, 2))
  if (changed.length) throw new Error(`golden mismatch: ${changed.join(', ')}`)
})
