<script lang="ts">
  import { onDestroy } from 'svelte'
  import { slide } from 'svelte/transition'
  import { cubicOut } from 'svelte/easing'
  import StatusBoard from '../components/StatusBoard.svelte'
  import Toggle from '../components/Toggle.svelte'
  import { detectPhoneName, isValidCode, loadCode, loadKey, loadPhoneName, saveCode, savePhoneName } from '../lib/device'
  import { loadMount, saveMount, SpeedFusion, type FusionStatus } from '../lib/fusion/fusion'
  import { phoneStatus, type FusedView } from '../lib/phoneStatus'
  import { ScreenWakeLock, watchCharging } from '../lib/power.svelte'
  import { PeerLink } from '../lib/peer.svelte'
  import { FrameKind, type Frame } from '../lib/protocol'
  import { Rate } from '../lib/rate.svelte'
  import { Relay } from '../lib/relay.svelte'
  import { Gps, gpsFrames, type GpsFix } from '../lib/sensors/gps'
  import { Motion, motionFrames, type MotionSample } from '../lib/sensors/motion'

  const MOTION_TIMEOUT_MS = 2000
  const REFRESH_MS = 500

  const key = loadKey()
  const gps = new Gps()
  const gpsRate = new Rate()
  const motion = new Motion()
  const wakeLock = new ScreenWakeLock()
  const link = new PeerLink('phone', (data) => relay?.sendControl({ type: 'signal', data }))

  const storedName = loadPhoneName()

  let code = $state(loadCode() ?? '')
  let name = $state(storedName ?? '')
  let relay = $state<Relay | null>(null)
  let fix = $state<GpsFix | null>(null)
  let gpsError = $state<string | null>(null)
  let charging = $state<boolean | null>(null)
  let motionHz = $state(0)
  let motionView = $state<MotionSample | null>(null)
  let motionUnavailable = $state(false)
  let fusionStatus = $state<FusionStatus | null>(null)
  let fusedView = $state<FusedView | null>(null)
  let recordWanted = $state(false)
  let recordingSince = $state<number | null>(null)
  let recordedBytes = $state(0)
  let clock = $state(Date.now())

  let refreshTimer = 0
  let motionStartedAt = 0
  let motionSamples = 0
  let lastSample: MotionSample | null = null
  let fusion: SpeedFusion | null = null
  let sentBytes = 0

  const recording = $derived(!!relay?.state.recording)
  const statusSections = $derived(
    phoneStatus({
      hasKey: !!key,
      relay: relay?.state ?? null,
      charging,
      fix,
      gpsError,
      gpsHz: gpsRate.hz,
      motionHz,
      motionUnavailable,
      motion: motionView,
      fusion: fusionStatus,
      fused: fusedView,
      link: { state: link.state, route: link.route },
      recordWanted,
      recording,
      recordingMs: recordingSince === null ? null : clock - recordingSince,
      recordedBytes,
      screenLocked: wakeLock.held
    })
  )

  if (!storedName) detectPhoneName().then((detected) => (name ||= detected))

  gps.onFix = (next) => {
    fix = next
    gpsError = null
    gpsRate.tick()
    const offset = relay?.clockOffsetMs ?? null
    const frames = gpsFrames(next)
    if (offset !== null) frames.push({ t: next.t, kind: FrameKind.ClockOffset, value: offset })

    send(frames)
    fusion?.addFix(next)
  }

  gps.onError = (message) => (gpsError = message)

  motion.onSample = (sample) => {
    motionSamples++
    lastSample = sample

    const fused = fusion?.addMotion(sample) ?? []
    const frames = recording ? [...motionFrames(sample), ...fused] : fused

    link.send(fused)
    if (frames.length) send(frames)
  }

  $effect(() => {
    if (relay?.state.connected && relay.state.car) link.start()
    else link.stop()
  })

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

  function refresh() {
    clock = Date.now()
    motionHz = Math.round((motionSamples * 1000) / REFRESH_MS)
    motionSamples = 0
    motionView = lastSample
    motionUnavailable = !lastSample && performance.now() - motionStartedAt > MOTION_TIMEOUT_MS
    recordedBytes = sentBytes
    fusionStatus = fusion?.status ?? null
    fusedView = fusion && fusionStatus?.calibrated ? { speed: fusion.speed, accel: fusion.accel, lagMs: fusion.filter.lagMs } : null

    const snapshot = fusion?.mount.snapshot()
    if (snapshot) saveMount(snapshot)
  }

  async function start() {
    code = code.trim().toUpperCase()
    name = name.trim()
    if (!key || !isValidCode(code)) return

    saveCode(code)
    savePhoneName(name)
    relay = new Relay('phone', code, key)
    relay.onSignal = (signal) => link.handleSignal(signal)
    relay.onOpen = () => {
      reportPhone()
      if (recordWanted) reportRecording()
    }
    relay.start()
    fusion = new SpeedFusion(loadMount())
    gps.start()

    motionStartedAt = performance.now()
    motionUnavailable = !(await motion.start())
    refreshTimer = window.setInterval(refresh, REFRESH_MS)

    await watchCharging((value) => {
      charging = value
      reportPhone()
    })
    await wakeLock.acquire()
  }

  async function stop() {
    if (recordWanted) {
      recordWanted = false
      reportRecording()
    }

    clearInterval(refreshTimer)
    motion.stop()
    gps.stop()
    link.stop()
    relay?.stop()
    relay = null
    lastSample = null
    fusion = null
    fusionStatus = null
    fusedView = null
    motionView = null
    motionHz = 0
    await wakeLock.release()
  }

  function reportPhone() {
    relay?.sendControl({ type: 'phone', charging: charging ?? false, name: name || null })
  }

  function reportRecording() {
    relay?.sendControl({ type: 'record', on: recordWanted })
  }

  function handleVisibility() {
    if (relay && document.visibilityState === 'visible') wakeLock.acquire()
  }

  onDestroy(stop)
</script>

<svelte:document onvisibilitychange={handleVisibility} />

<main class="page">
  <div class="reveal" style:--i="0">
    <StatusBoard sections={statusSections} />
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
