import toneWorkletUrl from './tone.worklet.ts?worker&url'

const GLIDE_SECONDS = 0.05

export class ToneEngine {
  context: AudioContext | null = null

  private node: AudioWorkletNode | null = null
  private volume: GainNode | null = null

  async start(volume: number) {
    if (this.context) return this.context.resume()

    const context = new AudioContext({ latencyHint: 'interactive' })
    await context.audioWorklet.addModule(toneWorkletUrl)

    this.node = new AudioWorkletNode(context, 'tone', { outputChannelCount: [2] })
    this.volume = context.createGain()
    this.volume.gain.value = volume
    this.node.connect(this.volume).connect(context.destination)
    this.context = context

    await context.resume()
  }

  setFrequency(hz: number) {
    this.glide(this.node?.parameters.get('frequency'), hz)
  }

  setVolume(volume: number) {
    this.glide(this.volume?.gain, volume)
  }

  async stop() {
    await this.context?.close()

    this.context = null
    this.node = null
    this.volume = null
  }

  private glide(param: AudioParam | undefined, value: number) {
    if (!param || !this.context) return
    param.setTargetAtTime(value, this.context.currentTime, GLIDE_SECONDS)
  }
}
