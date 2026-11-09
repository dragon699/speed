<script lang="ts">
  import { onDestroy } from 'svelte'
  import { isValidCode, loadCode, loadKey, saveCode } from '../lib/device'
  import { FrameKind } from '../lib/protocol'
  import { Rate } from '../lib/rate.svelte'
  import { Relay } from '../lib/relay.svelte'
  import { Gps, type GpsFix } from '../lib/sensors/gps'

  interface BatteryManager extends EventTarget {
    charging: boolean
    onchargingchange: (() => void) | null
  }

  const key = loadKey()
  const gps = new Gps()
  const gpsRate = new Rate()

  let code = $state(loadCode() ?? '')
  let relay = $state<Relay | null>(null)
  let fix = $state<GpsFix | null>(null)
  let gpsError = $state<string | null>(null)
  let charging = $state<boolean | null>(null)
  let screenLocked = $state(false)
  let wakeLock: WakeLockSentinel | null = null

  const banner = $derived(getBanner())

  gps.onFix = (next) => {
    fix = next
    gpsError = null
    gpsRate.tick()
    relay?.sendFrame({ t: Date.now(), kind: FrameKind.GpsSpeed, value: next.speed })
  }

  gps.onError = (message) => (gpsError = message)

  function getBanner(): { text: string; tone: string } {
    if (!key) return { text: 'Open the setup link on this device', tone: 'warn' }
    if (!relay) return { text: 'Enter the code shown in the car', tone: '' }
    if (relay.state.error) return { text: relay.state.error, tone: 'warn' }
    if (!relay.state.connected) return { text: 'Connecting…', tone: '' }
    if (!relay.state.car) return { text: 'Waiting for car…', tone: '' }
    if (!relay.state.charging) return { text: 'Place me on the charger', tone: 'warn' }
    return { text: 'Connected to car ✓', tone: 'ok' }
  }

  async function start() {
    code = code.trim().toUpperCase()
    if (!key || !isValidCode(code)) return

    saveCode(code)
    relay = new Relay('phone', code, key)
    relay.onOpen = reportCharging
    relay.start()
    gps.start()

    await watchBattery()
    await lockScreen()
  }

  async function stop() {
    gps.stop()
    relay?.stop()
    relay = null
    await wakeLock?.release()
    wakeLock = null
    screenLocked = false
  }

  async function watchBattery() {
    const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryManager> }

    if (!nav.getBattery) {
      charging = true
      reportCharging()
      return
    }

    const battery = await nav.getBattery()
    charging = battery.charging
    battery.onchargingchange = () => {
      charging = battery.charging
      reportCharging()
    }
    reportCharging()
  }

  function reportCharging() {
    if (charging !== null) relay?.sendControl({ type: 'phone', charging })
  }

  async function lockScreen() {
    try {
      wakeLock = await navigator.wakeLock.request('screen')
      screenLocked = true
      wakeLock.onrelease = () => (screenLocked = false)
    } catch {
      screenLocked = false
    }
  }

  function handleVisibility() {
    if (relay && document.visibilityState === 'visible') lockScreen()
  }

  onDestroy(stop)
</script>

<svelte:document onvisibilitychange={handleVisibility} />

<main class="page">
  <header class="banner {banner.tone}">{banner.text}</header>

  {#if key}
    {#if relay}
      <button onclick={stop}>Stop</button>
    {:else}
      <input type="text" maxlength="8" placeholder="CODE" bind:value={code} />
      <button class="primary" disabled={!isValidCode(code.trim().toUpperCase())} onclick={start}>Start</button>
    {/if}

    <dl class="panel">
      <dt>GPS</dt>
      <dd>
        {#if fix}
          {(fix.speed * 3.6).toFixed(1)} km/h · ±{fix.accuracy.toFixed(0)} m · {gpsRate.hz.toFixed(1)} Hz{fix.derived ? ' · derived' : ''}
        {:else}
          {gpsError ?? '—'}
        {/if}
      </dd>

      <dt>Charging</dt>
      <dd>{charging === null ? '—' : charging ? 'yes' : 'no'}</dd>

      <dt>Screen lock</dt>
      <dd>{screenLocked ? 'held' : 'off'}</dd>

      <dt>Relay RTT</dt>
      <dd>{relay?.state.rttMs == null ? '—' : `${relay.state.rttMs.toFixed(0)} ms`}</dd>
    </dl>
  {/if}
</main>

<style>
  .page {
    max-width: 520px;
  }
</style>
