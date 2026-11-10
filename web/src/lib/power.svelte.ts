interface BatteryManager extends EventTarget {
  charging: boolean
  onchargingchange: (() => void) | null
}

export async function watchCharging(onChange: (charging: boolean) => void) {
  const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryManager> }

  if (!nav.getBattery) {
    onChange(true)
    return
  }

  const battery = await nav.getBattery()
  battery.onchargingchange = () => onChange(battery.charging)
  onChange(battery.charging)
}

export class ScreenWakeLock {
  held = $state(false)

  private sentinel: WakeLockSentinel | null = null

  async acquire() {
    try {
      this.sentinel = await navigator.wakeLock.request('screen')
      this.held = true
      this.sentinel.onrelease = () => (this.held = false)
    } catch {
      this.held = false
    }
  }

  async release() {
    await this.sentinel?.release()
    this.sentinel = null
    this.held = false
  }
}
