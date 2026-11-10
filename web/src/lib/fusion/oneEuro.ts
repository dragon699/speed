export interface OneEuroOptions {
  minCutoffHz: number
  beta: number
  derivativeCutoffHz: number
}

export class OneEuroFilter {
  value = 0

  private derivative = 0
  private initialized = false
  private options: OneEuroOptions

  constructor(options: OneEuroOptions) {
    this.options = options
  }

  reset(value = 0) {
    this.value = value
    this.derivative = 0
    this.initialized = false
  }

  update(input: number, dt: number): number {
    if (!this.initialized || dt <= 0) {
      this.value = input
      this.initialized = true
      return input
    }

    const { minCutoffHz, beta, derivativeCutoffHz } = this.options
    const rawDerivative = (input - this.value) / dt
    this.derivative += (rawDerivative - this.derivative) * alpha(derivativeCutoffHz, dt)

    const cutoff = minCutoffHz + beta * Math.abs(this.derivative)
    this.value += (input - this.value) * alpha(cutoff, dt)

    return this.value
  }
}

function alpha(cutoffHz: number, dt: number): number {
  const tau = 1 / (2 * Math.PI * cutoffHz)
  return 1 / (1 + tau / dt)
}
