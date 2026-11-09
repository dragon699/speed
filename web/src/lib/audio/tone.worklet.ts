class ToneProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'frequency', defaultValue: 110, minValue: 20, maxValue: 2000, automationRate: 'k-rate' }]
  }

  private phase = 0

  process(_inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean {
    const channels = outputs[0]
    const step = parameters.frequency[0] / sampleRate

    for (let i = 0; i < channels[0].length; i++) {
      this.phase = (this.phase + step) % 1

      const angle = 2 * Math.PI * this.phase
      const sample = 0.5 * Math.sin(angle) + 0.3 * Math.sin(2 * angle) + 0.2 * Math.sin(3 * angle)

      for (const channel of channels) channel[i] = sample
    }

    return true
  }
}

registerProcessor('tone', ToneProcessor)
