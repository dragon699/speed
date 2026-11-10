<script lang="ts">
  import { onDestroy } from 'svelte'
  import { cubicOut } from 'svelte/easing'
  import { Tween } from 'svelte/motion'
  import { fade, slide } from 'svelte/transition'
  import EnginePicker from '../components/EnginePicker.svelte'
  import PairingCard from '../components/PairingCard.svelte'
  import Slider from '../components/Slider.svelte'
  import Tabs from '../components/Tabs.svelte'
  import StatusBoard from '../components/StatusBoard.svelte'
  import Toggle from '../components/Toggle.svelte'
  import { EngineSound } from '../lib/audio/engine'
  import { carStatus } from '../lib/carStatus'
  import { loadCarCode, loadFirstSeen, loadKey } from '../lib/device'
  import { Drivetrain } from '../lib/drivetrain'
  import { TestDrive } from '../lib/testDrive'
  import { engineSet, engineSets, loadEngine, saveEngine, type EngineProfile, type EngineSetId } from '../lib/engines'
  import { LatencyMeter, type LatencySummary, type Path } from '../lib/latency'
  import { PeerLink } from '../lib/peer.svelte'
  import { FrameKind, type Frame } from '../lib/protocol'
  import { Rate } from '../lib/rate.svelte'
  import { Relay } from '../lib/relay.svelte'
  import { Gps, type GpsFix } from '../lib/sensors/gps'
  import { fromKmh, toKmh } from '../lib/units'

  const PHONE_STALE_MS = 2000
  const FUSED_STALE_MS = 500
  const MANUAL_MAX_KMH = 250
  const SUMMARY_INTERVAL_MS = 500
  const STOPPED_SPEED = 0.5

  const key = loadKey()
  const code = loadCarCode()
  const firstSeenLabel = new Date(loadFirstSeen()).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })

  const relay = new Relay('car', code, key)
  const engine = new EngineSound()
  const gps = new Gps()
  const gpsRate = new Rate()
  const phoneRate = new Rate()
  const fusedRate = new Rate()
  const latency = new LatencyMeter()
  const link = new PeerLink('car', (data) => relay?.sendControl({ type: 'signal', data }))

  const initialEngine = loadEngine()
  const lastInSet = new Map<EngineSetId, EngineProfile>([[initialEngine.set, initialEngine]])

  let engineProfile = $state.raw(initialEngine)
  const drivetrain = new Drivetrain(initialEngine)
  const testDrive = new TestDrive()

  let started = $state(false)
  let volume = $state(0.3)
  let now = $state(performance.now())
  let innerWidth = $state(0)
  let innerHeight = $state(0)
  let carFix = $state<GpsFix | null>(null)
  let gpsError = $state<string | null>(null)
  let phoneSpeed = $state<number | null>(null)
  let phoneFrameAt = $state(0)
  let fusedSpeed = $state<number | null>(null)
  let fusedAccel = $state(0)
  let fusedAt = $state(0)
  let latencyView = $state<LatencySummary | null>(null)
  let audioState = $state('—')
  let audioInfo = $state<string | null>(null)
  let audioError = $state<string | null>(null)
  let gear = $state(1)
  let rpm = $state(0)
  let manualEnabled = $state(false)
  let manualKmh = $state(0)
  let manualSpeed = $state(0)
  let revHeld = $state(false)
  let raf = 0
  let lastFrameAt = 0
  let lastFusedT = 0
  let lastSummaryAt = 0
  let phoneClockOffset: number | null = null

  const phoneLive = $derived(phoneSpeed !== null && now - phoneFrameAt < PHONE_STALE_MS)
  const fusedLive = $derived(phoneLive && fusedSpeed !== null && now - fusedAt < FUSED_STALE_MS)
  const sensorSpeed = $derived(fusedLive ? (fusedSpeed ?? 0) : phoneLive ? (phoneSpeed ?? 0) : (carFix?.speed ?? 0))
  const speed = $derived(manualEnabled ? manualSpeed : sensorSpeed)
  const kmh = $derived(toKmh(speed))
  const displayKmh = new Tween(0, { duration: 400, easing: cubicOut })
  const moving = $derived(speed >= STOPPED_SPEED)
  const statusSections = $derived(
    carStatus({
      relay: relay.state,
      started,
      moving,
      manual: manualEnabled,
      phoneLive,
      fusedLive,
      phoneSeen: phoneSpeed !== null,
      phoneSpeed,
      phoneHz: phoneRate.hz,
      fusedSpeed,
      fusedAccel,
      fusedHz: fusedRate.hz,
      carFix,
      carGpsHz: gpsRate.hz,
      gpsError,
      audioState,
      audioInfo,
      audioError,
      latency: latencyView,
      link: { state: link.state, route: link.route },
      viewport: `${innerWidth} × ${innerHeight} @ ${devicePixelRatio}x`,
      firstSeen: firstSeenLabel
    })
  )

  relay.onFrames = (frames) => handleFrames(frames, 'relay')
  relay.onSignal = (signal) => link.handleSignal(signal)
  link.onFrames = (frames) => handleFrames(frames, 'webrtc')

  function handleFrames(frames: Frame[], path: Path) {
    let newest = lastFusedT

    for (const frame of frames) {
      if (frame.kind === FrameKind.GpsSpeed) {
        phoneSpeed = frame.value
        phoneFrameAt = performance.now()
        phoneRate.tick()
      } else if (frame.kind === FrameKind.ClockOffset) {
        phoneClockOffset = frame.value
      } else if (frame.t > lastFusedT && frame.kind === FrameKind.FusedSpeed) {
        fusedSpeed = frame.value
        fusedAt = performance.now()
        fusedRate.tick()
        trackLatency(frame.t, path)
        newest = Math.max(newest, frame.t)
      } else if (frame.t > lastFusedT && frame.kind === FrameKind.FusedAccel) {
        fusedAccel = frame.value
        newest = Math.max(newest, frame.t)
      }
    }

    if (newest === lastFusedT) return

    lastFusedT = newest
    if (started) tick()
  }

  function trackLatency(sentAt: number, path: Path) {
    const carOffset = relay?.clockOffsetMs ?? null
    if (carOffset === null || phoneClockOffset === null) return

    latency.add(performance.timeOrigin + performance.now() + carOffset - (sentAt + phoneClockOffset), path)
  }

  gps.onFix = (fix) => {
    carFix = fix
    gpsError = null
    gpsRate.tick()
  }

  gps.onError = (message) => (gpsError = message)
  engine.onError = (message) => (audioError = message)

  async function start() {
    try {
      await engine.start(engineProfile, volume)
    } catch (err) {
      audioError = String(err)
      return
    }

    const context = engine.context!
    audioState = context.state
    audioError = null
    audioInfo = `${context.sampleRate} Hz · base ${(context.baseLatency * 1000).toFixed(0)} ms · output ${(context.outputLatency * 1000).toFixed(0)} ms`
    context.onstatechange = () => (audioState = context.state)

    gps.start()
    relay?.start()
    link.start()
    started = true
    lastFrameAt = performance.now()
    loop()
  }

  async function stop() {
    cancelAnimationFrame(raf)
    gps.stop()
    relay?.stop()
    link.stop()
    await engine.stop()
    started = false
    audioState = '—'
  }

  function loop() {
    tick()
    raf = requestAnimationFrame(loop)
  }

  function tick() {
    now = performance.now()

    const dt = (now - lastFrameAt) / 1000
    if (manualEnabled) manualSpeed = testDrive.update(fromKmh(manualKmh), dt)

    const accel = fusedLive && !manualEnabled ? fusedAccel : undefined
    const state = drivetrain.update(speed, dt, { rev: revHeld, accel })
    lastFrameAt = now
    gear = state.gear
    rpm = state.rpm

    engine.update(state)

    if (now - lastSummaryAt < SUMMARY_INTERVAL_MS) return
    lastSummaryAt = now
    latencyView = latency.summary()
  }

  function selectEngine(profile: EngineProfile) {
    engineProfile = profile
    saveEngine(profile)
    lastInSet.set(profile.set, profile)
    drivetrain.setProfile(profile)
    engine.setProfile(profile)
  }

  function selectSet(id: EngineSetId) {
    if (id === engineProfile.set) return
    selectEngine(lastInSet.get(id) ?? engineSet(id).engines[0])
  }

  function startTestDrive(enabled: boolean) {
    if (!enabled) return

    testDrive.reset(sensorSpeed)
    manualSpeed = sensorSpeed
  }

  function rev(held: boolean) {
    revHeld = held && started && !moving
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
  <section class="hero reveal" style:--i="0" style:--engine={engineProfile.color}>
    <div class="speed">{displayKmh.current.toFixed(0)}<span>km/h</span></div>
    <div class="drive">
      <div class="gear"><span>Gear</span>{gear}</div>
      <div class="rpm">{Math.round(rpm).toLocaleString('en-US')}<span>rpm</span></div>
    </div>
    <div class="side">
      {#key engineProfile.id}
        <div class="engine" in:fade={{ duration: 250 }}>{engineProfile.name}</div>
      {/key}
    </div>
    <div class="tach">
      <div class="tach-fill" style:width="{(rpm / engineProfile.redline) * 100}%"></div>
      <div class="tach-redline" style:width="{(1 - 0.9) * 100}%"></div>
    </div>
  </section>

  {#if !relay.state.phone}
    <div transition:slide={{ duration: 350 }}>
      <PairingCard {code} />
    </div>
  {/if}

  <section class="engines reveal" style:--i="1">
    <Tabs
      options={engineSets.map((set) => ({ id: set.id, label: set.label, hint: `${set.engines.length} engines` }))}
      value={engineProfile.set}
      onchange={selectSet}
    />
    <EnginePicker profiles={engineSet(engineProfile.set).engines} selected={engineProfile} onselect={selectEngine} />
  </section>

  <section class="controls reveal" style:--i="2">
    <button class:primary={!started} onclick={started ? stop : start}>{started ? 'Stop' : 'Start'}</button>
    <button
      class="rev"
      class:held={revHeld}
      disabled={!started || moving}
      onpointerdown={() => rev(true)}
      onpointerup={() => rev(false)}
      onpointerleave={() => rev(false)}
      onpointercancel={() => rev(false)}
      oncontextmenu={(event) => event.preventDefault()}
    >
      <strong>REV</strong>
      <span>hold while stopped</span>
    </button>
    <Slider label="Volume" bind:value={volume} />
  </section>

  <section class="test reveal" style:--i="3">
    <Toggle label="Manual speed (test)" bind:checked={manualEnabled} onchange={startTestDrive} />
    <Slider
      label="Target speed"
      bind:value={manualKmh}
      min={0}
      max={MANUAL_MAX_KMH}
      step={1}
      format={(value) => `${value} km/h`}
    />
  </section>

  <div class="reveal" style:--i="4">
    <StatusBoard sections={statusSections} />
  </div>
</main>

<style>
  .hero {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: end;
    gap: 16px 32px;
  }

  .drive {
    display: flex;
    align-items: flex-end;
    gap: 28px;
    padding-bottom: 8px;
  }

  .gear {
    display: flex;
    flex-direction: column;
    color: var(--engine);
    font-size: 3.2rem;
    font-weight: 700;
    line-height: 1;
    transition: color var(--duration) var(--ease);
  }

  .gear span,
  .rpm span {
    color: var(--muted);
    font-size: 0.9rem;
    font-weight: 400;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .rpm {
    display: flex;
    flex-direction: column-reverse;
    font-family: var(--font-mono);
    font-size: 2rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.1;
  }

  .tach {
    position: relative;
    grid-column: 1 / -1;
    height: 8px;
    border-radius: 999px;
    background: var(--track);
    overflow: hidden;
  }

  .tach-fill {
    height: 100%;
    border-radius: 999px;
    background: linear-gradient(to right, color-mix(in srgb, var(--engine) 55%, transparent), var(--engine));
    box-shadow: 0 0 14px color-mix(in srgb, var(--engine) 60%, transparent);
  }

  .tach-redline {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    background: repeating-linear-gradient(-45deg, var(--bad) 0 4px, transparent 4px 8px);
    opacity: 0.6;
  }

  .rev {
    flex-direction: column;
    gap: 2px;
    border-color: var(--engine);
    color: var(--engine);
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    transition:
      background-color var(--duration-fast) var(--ease),
      box-shadow var(--duration-fast) var(--ease),
      transform var(--duration-fast) var(--ease);
  }

  .rev strong {
    font-size: 1.3rem;
    letter-spacing: 0.12em;
  }

  .rev span {
    color: var(--muted);
    font-size: 0.75rem;
  }

  .rev.held {
    background: color-mix(in srgb, var(--engine) 22%, var(--surface));
    box-shadow: 0 0 24px color-mix(in srgb, var(--engine) 45%, transparent);
    transform: scale(0.97);
  }

  .engines {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .test {
    display: grid;
    grid-template-columns: 320px 1fr;
    align-items: center;
    gap: 24px;
    padding: 16px;
    border: 1px dashed var(--warn);
    border-radius: var(--radius);
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
    color: var(--engine);
    font-size: 1.6rem;
    font-weight: 600;
  }

  .controls {
    display: grid;
    grid-template-columns: 200px 200px 1fr;
    align-items: center;
    gap: 24px;
  }
</style>
