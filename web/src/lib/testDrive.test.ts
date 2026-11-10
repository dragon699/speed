import { describe, expect, it } from 'vitest'
import { TestDrive, maxAccel } from './testDrive'

function drive(testDrive: TestDrive, targetKmh: number, seconds: number) {
  for (let t = 0; t < seconds; t += 1 / 60) testDrive.update(targetKmh / 3.6, 1 / 60)
  return testDrive.speed * 3.6
}

describe('test drive', () => {
  it('takes realistic time to reach 100 km/h', () => {
    const testDrive = new TestDrive()
    expect(drive(testDrive, 100, 3)).toBeLessThan(60)
    expect(drive(testDrive, 100, 6)).toBeCloseTo(100, 0)
  })

  it('accelerates harder at low speed than at high speed', () => {
    expect(maxAccel(0)).toBeGreaterThan(maxAccel(60))
  })

  it('brakes back down gradually', () => {
    const testDrive = new TestDrive()
    testDrive.reset(100 / 3.6)
    expect(drive(testDrive, 0, 2)).toBeGreaterThan(50)
    expect(drive(testDrive, 0, 8)).toBe(0)
  })
})
