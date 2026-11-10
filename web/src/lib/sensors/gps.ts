import { FrameKind, type Frame } from '../protocol'

export interface GpsFix {
  t: number
  speed: number
  accuracy: number
  derived: boolean
}

const EARTH_RADIUS_M = 6371000

export const GOOD_ACCURACY_M = 20

export function gpsFrames(fix: GpsFix): Frame[] {
  return [
    { t: fix.t, kind: FrameKind.GpsSpeed, value: fix.speed },
    { t: fix.t, kind: FrameKind.GpsAccuracy, value: fix.accuracy }
  ]
}

export class Gps {
  onFix: ((fix: GpsFix) => void) | null = null
  onError: ((message: string) => void) | null = null

  private watchId: number | null = null
  private previous: GeolocationPosition | null = null

  start() {
    if (this.watchId !== null) return

    this.watchId = navigator.geolocation.watchPosition(
      (position) => this.handle(position),
      (error) => this.onError?.(error.message),
      { enableHighAccuracy: true, maximumAge: 0 }
    )
  }

  stop() {
    if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId)

    this.watchId = null
    this.previous = null
  }

  private handle(position: GeolocationPosition) {
    const speed = position.coords.speed

    this.onFix?.({
      t: position.timestamp,
      speed: speed ?? this.derive(position),
      accuracy: position.coords.accuracy,
      derived: speed === null
    })

    this.previous = position
  }

  private derive(position: GeolocationPosition): number {
    if (!this.previous) return 0

    const seconds = (position.timestamp - this.previous.timestamp) / 1000
    if (seconds <= 0) return 0

    return distance(this.previous.coords, position.coords) / seconds
  }
}

function distance(a: GeolocationCoordinates, b: GeolocationCoordinates): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180
  const dLat = toRadians(b.latitude - a.latitude)
  const dLon = toRadians(b.longitude - a.longitude)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(dLon / 2) ** 2

  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h))
}
