import { EngineSynth, type SynthMessage } from './synth'

class ClassicEngineProcessor extends AudioWorkletProcessor {
  private synth = new EngineSynth(sampleRate)

  constructor() {
    super()
    this.port.onmessage = (event: MessageEvent<SynthMessage>) => this.synth.message(event.data)
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const output = outputs[0]
    this.synth.process(output[0], output[1] ?? output[0])
    return true
  }
}

registerProcessor('classic-engine', ClassicEngineProcessor)
