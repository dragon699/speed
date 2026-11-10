import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { it } from 'vitest'
import { engineSet } from '../engines'
import { renderSteady } from './analysis/testing/reference'

it.skipIf(!process.env.BENCH)('measures render speed per engine', () => {
  const lines = engineSet('core').engines.map((profile) => {
    const started = performance.now()
    renderSteady(profile, profile.redline * 0.8, 1, 3, 48000)
    const seconds = (performance.now() - started) / 1000
    return `${profile.id.padEnd(18)} ${(4 / seconds).toFixed(1)}× real time`
  })
  writeFileSync(join(tmpdir(), 'speed-bench.txt'), lines.join('\n'))
}, 300_000)
