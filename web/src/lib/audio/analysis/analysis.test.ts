import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { it } from 'vitest'
import { engineProfiles } from '../../engines'
import { analyze, distance, THIRD_OCTAVES } from './features'
import { REFERENCES, SAMPLE_RATE, referenceAudio, renderSteady, samplesAvailable } from './testing/reference'

const OUT = join(tmpdir(), 'speed-synth-analysis.txt')
const LOAD = Number(process.env.ANALYSIS_LOAD ?? 0.7)
const OCTAVE_COLUMNS = [63, 125, 250, 500, 1000, 2000, 4000]

it.skipIf(!samplesAvailable())('compares every referenced engine with engine-sim', () => {
  const lines = [`load ${LOAD}   octave bands: ${OCTAVE_COLUMNS.join(' ')}`, '']

  for (const reference of REFERENCES) {
    const profile = engineProfiles.find((p) => p.id === reference.engineId)!
    const totals = { bands: 0, orders: 0, flatness: 0, crest: 0, total: 0 }
    lines.push(`== ${profile.name} vs ${reference.folder}`)

    for (const rpm of reference.rpms) {
      const target = analyze(referenceAudio(reference, rpm), SAMPLE_RATE, rpm, profile.cylinders, true)
      const ours = analyze(renderSteady(profile, rpm, LOAD, 2), SAMPLE_RATE, rpm, profile.cylinders)
      const d = distance(ours, target)
      const octave = (bands: number[]) =>
        OCTAVE_COLUMNS.map((center) => bands[THIRD_OCTAVES.indexOf(center)].toFixed(0).padStart(5)).join('')

      for (const key of Object.keys(totals) as (keyof typeof totals)[]) totals[key] += d[key] / reference.rpms.length
      lines.push(`  ${String(rpm).padStart(5)} ref  ${octave(target.bands)}   crest ${target.crest.toFixed(1)}`)
      lines.push(`  ${String(rpm).padStart(5)} ours ${octave(ours.bands)}   crest ${ours.crest.toFixed(1)}   distance ${d.total.toFixed(1)}`)
    }

    lines.push(
      `  mean distance ${totals.total.toFixed(1)} (bands ${totals.bands.toFixed(1)} dB, orders ${totals.orders.toFixed(1)} dB, flatness ${totals.flatness.toFixed(2)}, crest ${totals.crest.toFixed(2)})`,
      ''
    )
  }

  writeFileSync(OUT, lines.join('\n'))
  console.log(`analysis written to ${OUT}`)
}, 300_000)
