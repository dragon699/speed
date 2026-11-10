import { ControlBridge } from './control'
import type { EngineEvent, EngineMessage } from './messages'
import { DEFAULT_OUTPUT, type EngineDef, type OutputConfig } from './core/contracts'
import { TesboxDspCore } from './core/dsp/dsp-core'
import { OUTPUT_CEILING } from './core/dsp/output-stage'

class EngineProcessor extends AudioWorkletProcessor {
  private dsp: TesboxDspCore | null = null
  private bridge = new ControlBridge()
  private def: EngineDef | null = null
  private output: OutputConfig = { ...DEFAULT_OUTPUT, subwoofer: 'yes' }

  constructor() {
    super()
    this.port.onmessage = (event: MessageEvent<EngineMessage>) => this.receive(event.data)

    try {
      this.dsp = new TesboxDspCore(sampleRate)
      this.post({ type: 'ready' })
    } catch (error) {
      this.post({ type: 'error', message: String(error) })
    }
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const left = outputs[0][0]
    const right = outputs[0][1] ?? left
    const frames = left.length

    if (this.dsp && this.def) {
      this.bridge.tick(currentTime)
      this.dsp.render(this.bridge.ctl, left, right, frames, currentTime)
    } else {
      left.fill(0)
      right.fill(0)
    }

    for (let i = 0; i < frames; i++) {
      left[i] = clip(left[i])
      right[i] = clip(right[i])
    }

    return true
  }

  private receive(message: EngineMessage) {
    try {
      switch (message.type) {
        case 'engine':
          this.def = message.def
          this.bridge.setShiftTime(message.def.spec.gearbox.shiftTimeS)
          this.dsp?.configure(message.def, this.output, 'full')
          break
        case 'control':
          this.bridge.update(message, currentTime)
          break
        case 'ignition':
          this.bridge.ignition(message.on, currentTime)
          break
        case 'settings':
          this.bridge.setSettings(message)
          break
        case 'output':
          this.output = message.config
          if (this.def) this.dsp?.configure(this.def, this.output, 'full')
          break
      }
    } catch (error) {
      this.post({ type: 'error', message: String(error) })
    }
  }

  private post(event: EngineEvent) {
    this.port.postMessage(event)
  }
}

function clip(x: number): number {
  return x === x ? Math.max(-OUTPUT_CEILING, Math.min(OUTPUT_CEILING, x)) : 0
}

registerProcessor('engine', EngineProcessor)
