<script lang="ts">
  import { onDestroy } from 'svelte'
  import { ToneEngine } from '../lib/audio/engine'
  import { createCode, loadCode, loadFirstSeen, loadKey, saveCode } from '../lib/device'
  import { FrameKind } from '../lib/protocol'
  import { Rate } from '../lib/rate.svelte'
  import { Relay } from '../lib/relay.svelte'
  import { Gps, type GpsFix } from '../lib/sensors/gps'

  const PHONE_STALE_MS = 2000
  const IDLE_FREQUENCY_HZ = 55
  const HZ_PER_KMH = 2

  const key = loadKey()
  const code = loadCode() ?? createCode()
  const firstSeen = loadFirstSeen()
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
  const banner = $derived(getBanner())

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

  function getBanner(): { text: string; tone: string } {
    if (!relay) return { text: 'Open the setup link on this device', tone: 'warn' }
    if (relay.state.error) return { text: relay.state.error, tone: 'warn' }
    if (!started) return { text: 'Tap Start', tone: '' }
    if (!relay.state.connected) return { text: 'Connecting…', tone: '' }
    if (!relay.state.phone) return { text: 'Waiting for phone…', tone: '' }
    if (phoneSpeed !== null && !phoneLive) return { text: 'Phone paused – using car GPS', tone: 'warn' }
    if (!relay.state.charging) return { text: 'Phone connected – place it on the charger', tone: 'warn' }
    return { text: 'Phone ready ✓', tone: 'ok' }
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

  onDestroy(stop)
</script>

<svelte:window bind:innerWidth bind:innerHeight />

<main class="page">
  <header class="banner {banner.tone}">{banner.text}</header>

  {#if relay}
    <section class="hero">
      <div class="speed">{kmh.toFixed(0)}<span>km/h</span></div>
      <div class="side">
        <div class="source">{phoneLive ? 'phone' : 'car GPS'}</div>
        <div class="code">Code <strong>{code}</strong></div>
      </div>
    </section>

    <section class="controls">
      {#if started}
        <button onclick={stop}>Stop</button>
      {:else}
        <button class="primary" onclick={start}>Start</button>
      {/if}
      <label>
        Volume
        <input type="range" min="0" max="1" step="0.05" bind:value={volume} />
      </label>
    </section>

    <dl class="panel">
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
      <dd>{audioError ?? `${audioState} · ${audioInfo}`}</dd>

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
    text-align: right;
    color: var(--muted);
    font-size: 1.2rem;
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

  label {
    display: flex;
    flex-direction: column;
    gap: 8px;
    color: var(--muted);
  }
</style>
