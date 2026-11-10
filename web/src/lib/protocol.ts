export const FrameKind = {
  GpsSpeed: 0,
  ForwardAccel: 1,
  FusedSpeed: 2,
  FusedAccel: 3,
  AccelX: 4,
  AccelY: 5,
  AccelZ: 6,
  LinearAccelX: 7,
  LinearAccelY: 8,
  LinearAccelZ: 9,
  RotationAlpha: 10,
  RotationBeta: 11,
  RotationGamma: 12,
  GpsAccuracy: 13,
  ClockOffset: 14
} as const

export type FrameKind = (typeof FrameKind)[keyof typeof FrameKind]

export const FRAME_SIZE = 13

export const CloseCode = {
  Unauthorized: 4401,
  Replaced: 4409,
  Full: 4429
} as const

export interface PeerSignal {
  description?: RTCSessionDescriptionInit
  candidate?: RTCIceCandidateInit | null
}

export interface Frame {
  t: number
  kind: FrameKind
  value: number
}

export type ClientMessage =
  | { type: 'hello'; key: string }
  | { type: 'ping'; t: number }
  | { type: 'phone'; charging: boolean; name: string | null }
  | { type: 'record'; on: boolean }
  | { type: 'signal'; data: PeerSignal }

export type ServerMessage =
  | {
      type: 'status'
      car: boolean
      phone: boolean
      charging: boolean
      phone_name: string | null
      recording: boolean
    }
  | { type: 'pong'; t: number; server: number }
  | { type: 'signal'; data: PeerSignal }

export function encodeFrames(frames: Frame[]): ArrayBuffer {
  const buffer = new ArrayBuffer(frames.length * FRAME_SIZE)
  const view = new DataView(buffer)

  frames.forEach((frame, index) => {
    const offset = index * FRAME_SIZE
    view.setFloat64(offset, frame.t, true)
    view.setUint8(offset + 8, frame.kind)
    view.setFloat32(offset + 9, frame.value, true)
  })

  return buffer
}

export function decodeFrames(buffer: ArrayBuffer): Frame[] {
  if (buffer.byteLength % FRAME_SIZE !== 0) return []

  const view = new DataView(buffer)
  const frames: Frame[] = []

  for (let offset = 0; offset < buffer.byteLength; offset += FRAME_SIZE) {
    frames.push({
      t: view.getFloat64(offset, true),
      kind: view.getUint8(offset + 8) as FrameKind,
      value: view.getFloat32(offset + 9, true)
    })
  }

  return frames
}
