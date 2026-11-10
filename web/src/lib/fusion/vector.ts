export type Vec3 = [number, number, number]

export const ZERO: Vec3 = [0, 0, 0]

export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

export function scale(a: Vec3, factor: number): Vec3 {
  return [a[0] * factor, a[1] * factor, a[2] * factor]
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

export function norm(a: Vec3): number {
  return Math.sqrt(dot(a, a))
}

export function normalize(a: Vec3): Vec3 {
  const length = norm(a)
  return length > 0 ? scale(a, 1 / length) : ZERO
}

export function lerp(a: Vec3, b: Vec3, amount: number): Vec3 {
  return add(a, scale(sub(b, a), amount))
}

export function reject(a: Vec3, unit: Vec3): Vec3 {
  return sub(a, scale(unit, dot(a, unit)))
}

export function angleDeg(a: Vec3, b: Vec3): number {
  const cosine = dot(normalize(a), normalize(b))
  return (Math.acos(Math.min(1, Math.max(-1, cosine))) * 180) / Math.PI
}
