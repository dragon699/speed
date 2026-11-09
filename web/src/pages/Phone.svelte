<script lang="ts">
  import { onDestroy } from 'svelte'
  import { slide } from 'svelte/transition'
  import { cubicOut } from 'svelte/easing'
  import StatusList from '../components/StatusList.svelte'
  import { detectPhoneName, isValidCode, loadCode, loadKey, loadPhoneName, saveCode, savePhoneName } from '../lib/device'
  import { FrameKind } from '../lib/protocol'
  import { Rate } from '../lib/rate.svelte'
  import { Relay } from '../lib/relay.svelte'
  import { Gps, type GpsFix } from '../lib/sensors/gps'
  import type { StatusItem } from '../lib/status'

  interface BatteryManager extends EventTarget {
    charging: boolean
    onchargingchange: (() => void) | null
  }

  const GOOD_ACCURACY_M = 20

  const key = loadKey()
  const gps = new Gps()
  const gpsRate = new Rate()

  const storedName = loadPhoneName()

  let code = $state(loadCode() ?? '')
  let name = $state(storedName ?? '')
  let relay = $state<Relay | null>(null)
  let fix = $state<GpsFix | null>(null)
  let gpsError = $state<string | null>(null)
  let charging = $state<boolean | null>(null)
  let screenLocked = $state(false)
  let wakeLock: WakeLockSentinel | null = null

  const statusItems = $derived(getStatusItems())

  if (!storedName) detectPhoneName().then((detected) => (name ||= detected))

  gps.onFix = (next) => {
    fix = next
    gpsError = null
    gpsRate.tick()
    relay?.sendFrame({ t: Date.now(), kind: FrameKind.GpsSpeed, value: next.speed })
  }

  gps.onError = (message) => (gpsError = message)

  function getStatusItems(): StatusItem[] {
    if (!key) return [{ icon: 'server', label: 'Server', value: 'No device key – open the setup link', tone: 'bad' }]

    const carConnected = !!relay?.state.connected && relay.state.car

    return [
      getServerItem(),
      carConnected
        ? { icon: 'car', label: 'Car', value: 'Connected', tone: 'ok' }
        : { icon: 'car', label: 'Car', value: 'Not connected', tone: 'bad' },
      charging === null
        ? { icon: 'charger', label: 'Charger', value: '—', tone: 'idle' }
        : charging
          ? { icon: 'charger', label: 'Charger', value: 'Charging', tone: 'ok' }
          : { icon: 'charger', label: 'Charger', value: 'Not charging', tone: 'warn' },
      getGpsItem(),
      !relay
        ? { icon: 'screen', label: 'Screen', value: '—', tone: 'idle' }
        : screenLocked
          ? { icon: 'screen', label: 'Screen', value: 'Kept awake', tone: 'ok' }
          : { icon: 'screen', label: 'Screen', value: 'May sleep', tone: 'warn' }
    ]
  }

  function getServerItem(): StatusItem {
    if (!relay) return { icon: 'server', label: 'Server', value: 'Enter the car code', tone: 'idle' }
    if (relay.state.error) return { icon: 'server', label: 'Server', value: relay.state.error, tone: 'bad' }
    if (!relay.state.connected) return { icon: 'server', label: 'Server', value: 'Connecting…', tone: 'wait' }
    return { icon: 'server', label: 'Server', value: 'Connected', tone: 'ok' }
  }

  function getGpsItem(): StatusItem {
    if (gpsError) return { icon: 'gps', label: 'GPS', value: gpsError, tone: 'bad' }
    if (!fix) return { icon: 'gps', label: 'GPS', value: relay ? 'Waiting for fix' : '—', tone: relay ? 'wait' : 'idle' }

    const value = `±${fix.accuracy.toFixed(0)} m · ${gpsRate.hz.toFixed(1)} Hz`
    return { icon: 'gps', label: 'GPS', value, tone: fix.accuracy <= GOOD_ACCURACY_M ? 'ok' : 'warn' }
  }

  async function start() {
    code = code.trim().toUpperCase()
    name = name.trim()
    if (!key || !isValidCode(code)) return

    saveCode(code)
    savePhoneName(name)
    relay = new Relay('phone', code, key)
    relay.onOpen = reportPhone
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
      reportPhone()
      return
    }

    const battery = await nav.getBattery()
    charging = battery.charging
    battery.onchargingchange = () => {
      charging = battery.charging
      reportPhone()
    }
    reportPhone()
  }

  function reportPhone() {
    relay?.sendControl({ type: 'phone', charging: charging ?? false, name: name || null })
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
  <div class="reveal" style:--i="0">
    <StatusList items={statusItems} />
  </div>

  {#if key}
    {#if !relay}
      <section class="form" transition:slide={{ duration: 350, easing: cubicOut }}>
        <label>
          Code
          <input class="code" type="text" maxlength="8" placeholder="CODE" bind:value={code} />
        </label>
        <label>
          Phone name
          <input type="text" maxlength="40" bind:value={name} />
        </label>
      </section>
    {/if}

    <button
      class="reveal"
      class:primary={!relay}
      style:--i="1"
      disabled={!relay && !isValidCode(code.trim().toUpperCase())}
      onclick={relay ? stop : start}
    >
      {relay ? 'Stop' : 'Start'}
    </button>

    <dl class="panel reveal" style:--i="2">
      <dt>GPS speed</dt>
      <dd>
        {#if fix}
          {(fix.speed * 3.6).toFixed(1)} km/h{fix.derived ? ' · derived' : ''}
        {:else}
          —
        {/if}
      </dd>

      <dt>Relay RTT</dt>
      <dd>{relay?.state.rttMs == null ? '—' : `${relay.state.rttMs.toFixed(0)} ms`}</dd>
    </dl>
  {/if}
</main>

<style>
  .page {
    max-width: 520px;
  }

  .form {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 8px;
    color: var(--muted);
  }
</style>
