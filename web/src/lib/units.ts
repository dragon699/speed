const MS_TO_KMH = 3.6

export function toKmh(metersPerSecond: number): number {
  return metersPerSecond * MS_TO_KMH
}

export function fromKmh(kmh: number): number {
  return kmh / MS_TO_KMH
}
