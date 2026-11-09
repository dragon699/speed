<script lang="ts">
  import { onDestroy } from 'svelte'
  import { cubicOut } from 'svelte/easing'
  import { Tween } from 'svelte/motion'
  import Slider from '../components/Slider.svelte'
  import StatusList from '../components/StatusList.svelte'
  import { ToneEngine } from '../lib/audio/engine'
  import { createCode, loadCode, loadFirstSeen, loadKey, saveCode } from '../lib/device'
  import { loadEngine } from '../lib/engines'
  import { FrameKind } from '../lib/protocol'
  import { Rate } from '../lib/rate.svelte'
  import { Relay } from '../lib/relay.svelte'
  import { Gps, type GpsFix } from '../lib/sensors/gps'
  import type { StatusItem } from '../lib/status'

  const PHONE_STALE_MS = 2000
  const IDLE_FREQUENCY_HZ = 55
  const HZ_PER_KMH = 2

  const key = loadKey()
  const code = loadCode() ?? createCode()
  const firstSeen = loadFirstSeen()
  const engineProfile = loadEngine()
  saveCode(code)

  const relay = key ? new Relay('car', code, key) : null
  const engine = new ToneEngine()
  const gps = new Gps()
  const gpsRate = new Rate()
  const phoneRate = new Rate()

  let started = $state(false)
  let volume = $state(0.3)
  let now = $state(performance.now())
  let innerWidth = $state(0)
  let innerHeight = $state(0)
  let carFix = $state<GpsFix | null>(null)
  let gpsError = $state<string | null>(null)
  let phoneSpeed = $state<number | null>(null)
  let phoneFrameAt = $state(0)
  let phoneFrameAgeMs = $state<number | null>(null)
  let audioState = $state('—')
  let audioInfo = $state('—')
  let audioError = $state<string | null>(null)
  let raf = 0

  const phoneLive = $derived(phoneSpeed !== null && now - phoneFrameAt < PHONE_STALE_MS)
  const speed = $derived(phoneLive ? (phoneSpeed ?? 0) : (carFix?.speed ?? 0))
  const kmh = $derived(speed * 3.6)
  const displayKmh = new Tween(0, { duration: 400, easing: cubicOut })
  const statusItems = $derived(getStatusItems())

  if (relay) {
    relay.onFrame = (frame) => {
      if (frame.kind !== FrameKind.GpsSpeed) return

      phoneSpeed = frame.value
      phoneFrameAt = performance.now()
      phoneFrameAgeMs = Date.now() - frame.t
      phoneRate.tick()
    }
  }

  gps.onFix = (fix) => {
    carFix = fix
    gpsError = null
    gpsRate.tick()
  }

  gps.onError = (message) => (gpsError = message)

  function getStatusItems(): StatusItem[] {
    if (!relay) return [{ icon: 'server', label: 'Server', value: 'No device key – open the setup link', tone: 'bad' }]

    const state = relay.state
    const phoneConnected = state.connected && state.phone

    return [
      getServerItem(),
      phoneConnected
        ? { icon: 'phone', label: 'Phone', value: state.phoneName ?? 'Connected', tone: 'ok' }
        : { icon: 'phone', label: 'Phone', value: 'Not connected', tone: 'bad' },
      !phoneConnected
        ? { icon: 'charger', label: 'Charger', value: '—', tone: 'idle' }
        : state.charging
          ? { icon: 'charger', label: 'Charger', value: 'Charging', tone: 'ok' }
          : { icon: 'charger', label: 'Charger', value: 'Not charging', tone: 'warn' },
      getSpeedItem(),
      getSoundItem()
    ]
  }

  function getServerItem(): StatusItem {
    const state = relay!.state

    if (state.error) return { icon: 'server', label: 'Server', value: state.error, tone: 'bad' }
    if (!started) return { icon: 'server', label: 'Server', value: 'Tap Start', tone: 'idle' }
    if (!state.connected) return { icon: 'server', label: 'Server', value: 'Connecting…', tone: 'wait' }
    return { icon: 'server', label: 'Server', value: 'Connected', tone: 'ok' }
  }

  function getSpeedItem(): StatusItem {
    if (phoneLive) return { icon: 'gps', label: 'Speed', value: 'Phone GPS', tone: 'ok' }
    if (phoneSpeed !== null) return { icon: 'gps', label: 'Speed', value: 'Car GPS – phone paused', tone: 'warn' }
    if (carFix) return { icon: 'gps', label: 'Speed', value: 'Car GPS', tone: 'warn' }
    if (gpsError) return { icon: 'gps', label: 'Speed', value: gpsError, tone: 'bad' }
    return { icon: 'gps', label: 'Speed', value: started ? 'Waiting for GPS' : '—', tone: started ? 'wait' : 'idle' }
  }

  function getSoundItem(): StatusItem {
    if (audioError) return { icon: 'sound', label: 'Sound', value: audioError, tone: 'bad' }
    if (audioState === 'running') return { icon: 'sound', label: 'Sound', value: 'Playing', tone: 'ok' }
    if (started) return { icon: 'sound', label: 'Sound', value: audioState, tone: 'wait' }
    return { icon: 'sound', label: 'Sound', value: 'Off', tone: 'idle' }
  }

  async function start() {
    try {
      await engine.start(volume)
    } catch (err) {
      audioError = String(err)
      return
    }

    const context = engine.context!
    audioState = context.state
    audioError = null
    audioInfo = `${context.sampleRate} Hz · base ${(context.baseLatency * 1000).toFixed(1)} ms · output ${(context.outputLatency * 1000).toFixed(1)} ms`
    context.onstatechange = () => (audioState = context.state)

    gps.start()
    relay?.start()
    started = true
    loop()
  }

  async function stop() {
    cancelAnimationFrame(raf)
    gps.stop()
    relay?.stop()
    await engine.stop()
    started = false
    audioState = '—'
  }

  function loop() {
    now = performance.now()
    engine.setFrequency(IDLE_FREQUENCY_HZ + kmh * HZ_PER_KMH)
    raf = requestAnimationFrame(loop)
  }

  function formatMs(value: number | null | undefined): string {
    return value == null ? '—' : `${value.toFixed(0)} ms`
  }

  $effect(() => {
    engine.setVolume(volume)
  })

  $effect(() => {
    displayKmh.target = kmh
  })

  onDestroy(stop)
</script>

<svelte:window bind:innerWidth bind:innerHeight />

<main class="page">
  {#if relay}
    <section class="hero reveal" style:--i="0">
      <div class="speed">{displayKmh.current.toFixed(0)}<span>km/h</span></div>
      <div class="side">
        <div class="engine">{engineProfile.name}</div>
        <div class="code">Code <strong>{code}</strong></div>
      </div>
    </section>
  {/if}

  <div class="reveal" style:--i="1">
    <StatusList items={statusItems} />
  </div>

  {#if relay}
    <section class="controls reveal" style:--i="2">
      <button class:primary={!started} onclick={started ? stop : start}>{started ? 'Stop' : 'Start'}</button>
      <Slider label="Volume" bind:value={volume} />
    </section>

    <dl class="panel reveal" style:--i="3">
      <dt>Car GPS</dt>
      <dd>
        {#if carFix}
          {(carFix.speed * 3.6).toFixed(1)} km/h · ±{carFix.accuracy.toFixed(0)} m · {gpsRate.hz.toFixed(1)} Hz{carFix.derived ? ' · derived' : ''}
        {:else}
          {gpsError ?? '—'}
        {/if}
      </dd>

      <dt>Phone</dt>
      <dd>
        {#if phoneSpeed !== null}
          {(phoneSpeed * 3.6).toFixed(1)} km/h · {phoneRate.hz.toFixed(1)} Hz · age {formatMs(phoneFrameAgeMs)}
        {:else}
          —
        {/if}
      </dd>

      <dt>Relay RTT</dt>
      <dd>{formatMs(relay.state.rttMs)}</dd>

      <dt>Audio</dt>
      <dd>{audioState} · {audioInfo}</dd>

      <dt>Viewport</dt>
      <dd>{innerWidth} × {innerHeight} @ {devicePixelRatio}x</dd>

      <dt>Stored since</dt>
      <dd>{firstSeen}</dd>
    </dl>
  {/if}
</main>

<style>
  .hero {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 24px;
  }

  .speed {
    font-size: 7rem;
    font-weight: 700;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  .speed span {
    margin-left: 12px;
    font-size: 1.5rem;
    font-weight: 400;
    color: var(--muted);
  }

  .side {
    display: flex;
    flex-direction: column;
    gap: 8px;
    text-align: right;
    color: var(--muted);
    font-size: 1.2rem;
  }

  .engine {
    color: var(--text);
    font-size: 1.6rem;
    font-weight: 600;
  }

  .code strong {
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 2rem;
    letter-spacing: 0.15em;
  }

  .controls {
    display: grid;
    grid-template-columns: 200px 1fr;
    align-items: center;
    gap: 24px;
  }
</style>
