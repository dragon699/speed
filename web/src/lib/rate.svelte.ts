const SMOOTHING = 0.2

export class Rate {
  hz = $state(0)
  private last = 0

  tick(now = performance.now()) {
    if (this.last) {
      const hz = 1000 / Math.max(now - this.last, 1)
      this.hz = this.hz ? this.hz * (1 - SMOOTHING) + hz * SMOOTHING : hz
    }

    this.last = now
  }
}
