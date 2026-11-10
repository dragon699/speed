const SPEED_NOISE = 0.05
const BIAS_NOISE = 0.0005
const INITIAL_SPEED_VARIANCE = 1
const INITIAL_BIAS_VARIANCE = 0.04
const MAX_STEP_S = 0.2
const HISTORY_MS = 4000
const LAG_CANDIDATES_MS = [0, 200, 400, 600, 800, 1000, 1200]
const LAG_MEMORY = 0.97

interface Point {
  t: number
  speed: number
}

export class SpeedFilter {
  speed = 0
  bias = 0

  private p00 = INITIAL_SPEED_VARIANCE
  private p01 = 0
  private p11 = INITIAL_BIAS_VARIANCE
  private lastT: number | null = null
  private history: Point[] = []
  private lagErrors = LAG_CANDIDATES_MS.map(() => 0)

  get lagMs(): number {
    return LAG_CANDIDATES_MS[this.lagErrors.indexOf(Math.min(...this.lagErrors))]
  }

  reset(t: number, speed: number) {
    this.speed = speed
    this.bias = 0
    this.p00 = INITIAL_SPEED_VARIANCE
    this.p01 = 0
    this.p11 = INITIAL_BIAS_VARIANCE
    this.lastT = t
    this.history = [{ t, speed }]
  }

  predict(t: number, accel: number) {
    const dt = this.lastT === null ? 0 : Math.min(Math.max((t - this.lastT) / 1000, 0), MAX_STEP_S)
    this.lastT = t

    this.speed = Math.max(0, this.speed + (accel - this.bias) * dt)

    const p00 = this.p00 - 2 * dt * this.p01 + dt * dt * this.p11 + SPEED_NOISE * dt
    const p01 = this.p01 - dt * this.p11
    this.p00 = p00
    this.p01 = p01
    this.p11 += BIAS_NOISE * dt

    this.history.push({ t, speed: this.speed })
    while (this.history.length > 1 && t - this.history[0].t > HISTORY_MS) this.history.shift()
  }

  correct(t: number, measured: number, sigma: number) {
    this.trackLag(t, measured)

    const past = this.speedAt(t - this.lagMs)
    if (past === null) return

    const innovation = measured - past
    const s = this.p00 + sigma * sigma
    const k0 = this.p00 / s
    const k1 = this.p01 / s

    this.speed = Math.max(0, this.speed + k0 * innovation)
    this.bias += k1 * innovation

    const p00 = (1 - k0) * this.p00
    const p01 = (1 - k0) * this.p01
    this.p11 -= k1 * this.p01
    this.p00 = p00
    this.p01 = p01

    for (const point of this.history) point.speed += k0 * innovation
  }

  private trackLag(t: number, measured: number) {
    const errors = LAG_CANDIDATES_MS.map((lag) => this.speedAt(t - lag))
    if (errors.some((speed) => speed === null)) return

    this.lagErrors = this.lagErrors.map((error, index) => error * LAG_MEMORY + (measured - errors[index]!) ** 2)
  }

  private speedAt(t: number): number | null {
    const history = this.history
    if (!history.length || t < history[0].t) return null
    if (t >= history[history.length - 1].t) return this.speed

    let index = history.length - 1
    while (index > 0 && history[index - 1].t > t) index--

    const before = history[index - 1]
    const after = history[index]
    const share = (t - before.t) / Math.max(after.t - before.t, 1e-9)
    return before.speed + (after.speed - before.speed) * share
  }
}
