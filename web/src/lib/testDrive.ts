const MAX_ACCEL = 4.5
const MIN_ACCEL = 0.8
const ACCEL_FADE_SPEED = 70
const MAX_BRAKE = 5
const APPROACH_RATE = 1.5
const SNAP_SPEED = 0.02

export function maxAccel(speed: number): number {
  return MAX_ACCEL - (MAX_ACCEL - MIN_ACCEL) * Math.min(speed / ACCEL_FADE_SPEED, 1)
}

export class TestDrive {
  speed = 0

  reset(speed: number) {
    this.speed = speed
  }

  update(target: number, dt: number): number {
    const difference = target - this.speed

    if (Math.abs(difference) < SNAP_SPEED) {
      this.speed = target
      return this.speed
    }

    const desired = difference * APPROACH_RATE
    const accel = difference > 0 ? Math.min(desired, maxAccel(this.speed)) : Math.max(desired, -MAX_BRAKE)
    const step = accel * dt

    this.speed = Math.abs(step) >= Math.abs(difference) ? target : this.speed + step

    return this.speed
  }
}
