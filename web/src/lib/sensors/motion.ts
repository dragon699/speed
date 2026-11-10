import { FrameKind, type Frame } from '../protocol'

export type Vector = [number, number, number]

export interface MotionSample {
  t: number
  accel: Vector | null
  linear: Vector | null
  rotation: Vector | null
}

type PermissionRequest = () => Promise<'granted' | 'denied'>

export class Motion {
  onSample: ((sample: MotionSample) => void) | null = null

  private listening = false
  private handler = (event: DeviceMotionEvent) => this.handle(event)

  async start(): Promise<boolean> {
    if (this.listening) return true
    if (!('DeviceMotionEvent' in window)) return false

    const requestPermission = (DeviceMotionEvent as unknown as { requestPermission?: PermissionRequest }).requestPermission
    if (requestPermission && (await requestPermission()) !== 'granted') return false

    window.addEventListener('devicemotion', this.handler)
    this.listening = true

    return true
  }

  stop() {
    window.removeEventListener('devicemotion', this.handler)
    this.listening = false
  }

  private handle(event: DeviceMotionEvent) {
    const rotation = event.rotationRate

    this.onSample?.({
      t: performance.timeOrigin + event.timeStamp,
      accel: toVector(event.accelerationIncludingGravity),
      linear: toVector(event.acceleration),
      rotation:
        rotation && rotation.alpha !== null && rotation.beta !== null && rotation.gamma !== null
          ? [rotation.alpha, rotation.beta, rotation.gamma]
          : null
    })
  }
}

export function motionFrames(sample: MotionSample): Frame[] {
  const frames: Frame[] = []
  const add = (kinds: FrameKind[], vector: Vector | null) =>
    vector?.forEach((value, index) => frames.push({ t: sample.t, kind: kinds[index], value }))

  add([FrameKind.AccelX, FrameKind.AccelY, FrameKind.AccelZ], sample.accel)
  add([FrameKind.LinearAccelX, FrameKind.LinearAccelY, FrameKind.LinearAccelZ], sample.linear)
  add([FrameKind.RotationAlpha, FrameKind.RotationBeta, FrameKind.RotationGamma], sample.rotation)

  return frames
}

function toVector(value: DeviceMotionEventAcceleration | null): Vector | null {
  if (!value || value.x === null || value.y === null || value.z === null) return null
  return [value.x, value.y, value.z]
}
