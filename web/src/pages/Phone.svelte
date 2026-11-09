<script lang="ts">
  import { onDestroy } from 'svelte'
  import { slide } from 'svelte/transition'
  import { cubicOut } from 'svelte/easing'
  import StatusList from '../components/StatusList.svelte'
  import Toggle from '../components/Toggle.svelte'
  import { detectPhoneName, isValidCode, loadCode, loadKey, loadPhoneName, saveCode, savePhoneName } from '../lib/device'
  import { FrameKind, type Frame } from '../lib/protocol'
  import { Rate } from '../lib/rate.svelte'
  import { Relay } from '../lib/relay.svelte'
  import { Gps, type GpsFix } from '../lib/sensors/gps'
  import { Motion, magnitude, type MotionSample } from '../lib/sensors/motion'
  import type { StatusItem } from '../lib/status'

  interface BatteryManager extends EventTarget {
    charging: boolean
    onchargingchange: (() => void) | null
  }

  const GOOD_ACCURACY_M = 20
  const MOTION_TIMEOUT_MS = 2000
  const REFRESH_MS = 500

  const key = loadKey()
  const gps = new Gps()
  const gpsRate = new Rate()
  const motion = new Motion()

  const storedName = loadPhoneName()

  let code = $state(loadCode() ?? '')
  let name = $state(storedName ?? '')
  let relay = $state<Relay | null>(null)
  let fix = $state<GpsFix | null>(null)
  let gpsError = $state<string | null>(null)
  let charging = $state<boolean | null>(null)
  let screenLocked = $state(false)
  let motionHz = $state(0)
  let motionView = $state<MotionSample | null>(null)
  let motionUnavailable = $state(false)
  let recordWanted = $state(false)
  let recordingSince = $state<number | null>(null)
  let recordedBytes = $state(0)
  let clock = $state(Date.now())

  let wakeLock: WakeLockSentinel | null = null
  let refreshTimer = 0
  let motionStartedAt = 0
  let motionSamples = 0
  let lastSample: MotionSample | null = null
  let sentBytes = 0

  const recording = $derived(!!relay?.state.recording)
  const statusItems = $derived(getStatusItems())

  if (!storedName) detectPhoneName().then((detected) => (name ||= detected))

  gps.onFix = (next) => {
    fix = next
    gpsError = null
    gpsRate.tick()
    send([
      { t: next.t, kind: FrameKind.GpsSpeed, value: next.speed },
      { t: next.t, kind: FrameKind.GpsAccuracy, value: next.accuracy }
    ])
  }

  gps.onError = (message) => (gpsError = message)

  motion.onSample = (sample) => {
    motionSamples++
    lastSample = sample

    if (recording) send(toFrames(sample))
  }

  $effect(() => {
    if (recording && recordingSince === null) {
      recordingSince = Date.now()
      sentBytes = 0
      recordedBytes = 0
    } else if (!recording && recordingSince !== null) {
      recordingSince = null
    }
  })

  function send(frames: Frame[]) {
    const bytes = relay?.sendFrames(frames) ?? 0
    if (recording) sentBytes += bytes
  }

  function toFrames(sample: MotionSample): Frame[] {
    const frames: Frame[] = []
    const add = (kinds: FrameKind[], vector: number[] | null) =>
      vector?.forEach((value, index) => frames.push({ t: sample.t, kind: kinds[index], value }))

    add([FrameKind.AccelX, FrameKind.AccelY, FrameKind.AccelZ], sample.accel)
    add([FrameKind.LinearAccelX, FrameKind.LinearAccelY, FrameKind.LinearAccelZ], sample.linear)
    add([FrameKind.RotationAlpha, FrameKind.RotationBeta, FrameKind.RotationGamma], sample.rotation)

    return frames
  }

  function refresh() {
    clock = Date.now()
    motionHz = Math.round((motionSamples * 1000) / REFRESH_MS)
    motionSamples = 0
    motionView = lastSample
    motionUnavailable = !lastSample && performance.now() - motionStartedAt > MOTION_TIMEOUT_MS
    recordedBytes = sentBytes
  }

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
      getMotionItem(),
      getRecordingItem(),
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

  function getMotionItem(): StatusItem {
    if (!relay) return { icon: 'motion', label: 'Motion', value: '—', tone: 'idle' }
    if (motionUnavailable) return { icon: 'motion', label: 'Motion', value: 'Unavailable', tone: 'bad' }
    if (!motionHz) return { icon: 'motion', label: 'Motion', value: 'Waiting', tone: 'wait' }
    return { icon: 'motion', label: 'Motion', value: `${motionHz} Hz`, tone: 'ok' }
  }

  function getRecordingItem(): StatusItem {
    if (!recordWanted) return { icon: 'record', label: 'Recording', value: 'Off', tone: 'idle' }
    if (!recording || recordingSince === null) return { icon: 'record', label: 'Recording', value: 'Starting…', tone: 'wait' }

    const value = `${formatDuration(clock - recordingSince)} · ${formatBytes(recordedBytes)}`
    return { icon: 'record', label: 'Recording', value, tone: 'ok' }
  }

  function formatBytes(bytes: number): string {
    return bytes < 1e6 ? `${Math.round(bytes / 1e3)} kB` : `${(bytes / 1e6).toFixed(1)} MB`
  }

  function formatDuration(ms: number): string {
    const seconds = Math.max(0, Math.floor(ms / 1000))
    const minutes = Math.floor(seconds / 60)
    return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
  }

  function formatVector(vector: number[] | null | undefined, unit: string): string {
    if (!vector) return '—'
    return `${magnitude(vector as [number, number, number]).toFixed(2)} ${unit}`
  }

  async function start() {
    code = code.trim().toUpperCase()
    name = name.trim()
    if (!key || !isValidCode(code)) return

    saveCode(code)
    savePhoneName(name)
    relay = new Relay('phone', code, key)
    relay.onOpen = () => {
      reportPhone()
      if (recordWanted) reportRecording()
    }
    relay.start()
    gps.start()

    motionStartedAt = performance.now()
    motionUnavailable = !(await motion.start())
    refreshTimer = window.setInterval(refresh, REFRESH_MS)

    await watchBattery()
    await lockScreen()
  }

  async function stop() {
    if (recordWanted) {
      recordWanted = false
      reportRecording()
    }

    clearInterval(refreshTimer)
    motion.stop()
    gps.stop()
    relay?.stop()
    relay = null
    lastSample = null
    motionView = null
    motionHz = 0
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

  function reportRecording() {
    relay?.sendControl({ type: 'record', on: recordWanted })
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
    {:else}
      <div transition:slide={{ duration: 350, easing: cubicOut }}>
        <Toggle
          label="Record drive"
          bind:checked={recordWanted}
          disabled={!relay.state.connected}
          onchange={reportRecording}
        />
      </div>
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

      <dt>Accel</dt>
      <dd>{formatVector(motionView?.accel, 'm/s²')}</dd>

      <dt>Linear accel</dt>
      <dd>{formatVector(motionView?.linear, 'm/s²')}</dd>

      <dt>Rotation</dt>
      <dd>{formatVector(motionView?.rotation, '°/s')}</dd>

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
