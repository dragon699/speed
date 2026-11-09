export const FrameKind = {
  GpsSpeed: 0,
  ForwardAccel: 1,
  FusedSpeed: 2,
  FusedAccel: 3
} as const

export type FrameKind = (typeof FrameKind)[keyof typeof FrameKind]

export const FRAME_SIZE = 13

export interface Frame {
  t: number
  kind: FrameKind
  value: number
}

export type ClientMessage =
  | { type: 'hello'; key: string }
  | { type: 'ping'; t: number }
  | { type: 'phone'; charging: boolean }

export type ServerMessage =
  | { type: 'status'; car: boolean; phone: boolean; charging: boolean }
  | { type: 'pong'; t: number }

export function encodeFrame(frame: Frame): ArrayBuffer {
  const buffer = new ArrayBuffer(FRAME_SIZE)
  const view = new DataView(buffer)

  view.setFloat64(0, frame.t, true)
  view.setUint8(8, frame.kind)
  view.setFloat32(9, frame.value, true)

  return buffer
}

export function decodeFrame(buffer: ArrayBuffer): Frame | null {
  if (buffer.byteLength !== FRAME_SIZE) return null

  const view = new DataView(buffer)

  return {
    t: view.getFloat64(0, true),
    kind: view.getUint8(8) as FrameKind,
    value: view.getFloat32(9, true)
  }
}
