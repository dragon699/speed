<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import { engineSet } from '../lib/engines'
  import { labVariants, levelDb, startLab, type LabRun, type LabVariantId } from '../lib/audio/lab'

  const profile = engineSet('core').engines[0]

  let active = $state<LabVariantId | null>(null)
  let info = $state('—')
  let level = $state('—')
  let deviceRate = $state('—')
  let log = $state<string[]>([])
  let run: LabRun | null = null
  let startedAt = 0
  let meterTimer = 0
  const samples = new Float32Array(2048)

  function note(message: string) {
    const seconds = startedAt ? ((performance.now() - startedAt) / 1000).toFixed(1) : '0.0'
    log = [`${seconds}s  ${message}`, ...log].slice(0, 40)
  }

  function detach(current: LabRun | null) {
    clearInterval(meterTimer)
    level = '—'
    if (current) current.context.onstatechange = null
    return current?.stop()
  }

  async function stop() {
    const current = run
    run = null
    active = null
    info = '—'
    await detach(current)
  }

  function watch(started: LabRun) {
    const { meter, status } = started
    const refresh = () => {
      const parts = [meter ? `level ${levelDb(meter, samples).toFixed(0)} dB` : 'level not measured']
      if (status) parts.push(status())
      level = parts.join(' · ')
    }
    refresh()
    meterTimer = window.setInterval(refresh, 250)
  }

  async function play(id: LabVariantId) {
    if (active === id) {
      await stop()
      note(`stopped ${id}`)
      return
    }

    const previous = run
    run = null
    void detach(previous)

    startedAt = performance.now()
    active = id
    log = []
    try {
      const started = await startLab(id, profile)
      run = started
      const { context } = started
      context.onstatechange = () => note(`audio ${context.state}`)
      watch(started)
      info = `${context.sampleRate} Hz · base ${(context.baseLatency * 1000).toFixed(0)} ms · output ${(context.outputLatency * 1000).toFixed(0)} ms`
      note(`started ${id} · audio ${context.state}`)
    } catch (err) {
      active = null
      note(`failed: ${String(err)}`)
    }
  }

  function visibility() {
    note(`page ${document.visibilityState}`)
  }

  onMount(() => {
    const probe = new AudioContext()
    deviceRate = `${probe.sampleRate} Hz`
    void probe.close()
  })

  onDestroy(() => void stop())
</script>

<svelte:document onvisibilitychange={visibility} />

<main class="page lab">
  <h1>Audio lab</h1>
  <ol class="steps">
    <li>Play something in Spotify.</li>
    <li>Tap a variant and listen for a few seconds.</li>
    <li>Note whether Spotify paused or the player bottom left switched to the browser.</li>
    <li>Tap it again to stop, resume Spotify, try the next one.</li>
  </ol>

  <div class="variants">
    {#each labVariants as variant (variant.id)}
      <button class:primary={active === variant.id} onclick={() => play(variant.id)}>
        <span class="label">{variant.label}</span>
        <span class="detail">{active === variant.id ? 'Playing · tap to stop' : variant.detail}</span>
      </button>
    {/each}
  </div>

  <p class="info">Device rate {deviceRate} · {info} · {level}</p>
  <pre class="log">{log.join('\n')}</pre>
</main>

<style>
  .lab {
    max-width: 720px;
  }

  h1 {
    margin: 0;
    font-weight: var(--weight-light);
  }

  .steps {
    margin: 0;
    padding-left: 22px;
    color: var(--muted);
    line-height: 1.6;
  }

  .variants {
    display: grid;
    gap: 12px;
  }

  .variants button {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    padding: 14px 24px;
    text-align: left;
  }

  .detail {
    font-size: 0.85rem;
    opacity: 0.7;
  }

  .info {
    margin: 0;
    color: var(--muted);
    font-family: var(--font-mono);
    font-size: 0.85rem;
  }

  .log {
    min-height: 120px;
    margin: 0;
    padding: 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: var(--surface);
    color: var(--muted);
    font-size: 0.8rem;
    white-space: pre-wrap;
  }
</style>
