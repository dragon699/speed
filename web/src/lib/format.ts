import { toKmh } from './units'

export function formatMs(value: number | null | undefined): string {
  return value == null ? '—' : `${value.toFixed(0)} ms`
}

export function formatSpeed(metersPerSecond: number): string {
  return `${toKmh(metersPerSecond).toFixed(1)} km/h`
}

export function formatBytes(bytes: number): string {
  return bytes < 1e6 ? `${Math.round(bytes / 1e3)} kB` : `${(bytes / 1e6).toFixed(1)} MB`
}

export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export function formatMagnitude(vector: readonly number[] | null | undefined, unit: string): string {
  return vector ? `${Math.hypot(...vector).toFixed(2)} ${unit}` : '—'
}
