<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import { cubicOut } from 'svelte/easing'
  import { fade, fly } from 'svelte/transition'
  import EnginePicker from './EnginePicker.svelte'
  import { screenSlide } from '../lib/screenSlide'
  import { MAX_VOLUME, UNITY_VOLUME } from '../lib/volume'
  import Slider from './Slider.svelte'
  import Speedometer from './Speedometer.svelte'
  import type { EngineProfile } from '../lib/engines'

  const MAX_KMH = 240
  const IDLE_MS = 30000

  interface Props {
    kmh: number
    manual: boolean
    manualKmh: number
    manualMaxKmh: number
    volume: number
    profiles: EngineProfile[]
    selected: EngineProfile
    onselect: (profile: EngineProfile) => void
    onstop: () => void
  }

  let { kmh, manual, manualKmh = $bindable(), manualMaxKmh, volume = $bindable(), profiles, selected, onselect, onstop }: Props = $props()

  let expanded = $state(false)
  let idle = $state(false)
  let shift = $state(0)
  let dial: HTMLDivElement
  let idleTimer = 0

  function wake() {
    idle = false
    shift = 0
    clearTimeout(idleTimer)
    idleTimer = window.setTimeout(rest, IDLE_MS)
  }

  function rest() {
    const box = dial.firstElementChild!.getBoundingClientRect()
    shift = window.innerHeight / 2 - (box.top + box.height / 2)
    idle = true
    expanded = false
  }

  onMount(wake)
  onDestroy(() => clearTimeout(idleTimer))

  function choose(profile: EngineProfile) {
    onselect(profile)
    expanded = false
  }
</script>

<svelte:window onpointerdown={wake} onpointermove={wake} onkeydown={wake} />

<div class="drive" transition:screenSlide={1}>
  <div class="dial" bind:this={dial} style:transform="translateY({shift}px)">
    <Speedometer {kmh} maxKmh={MAX_KMH} />
  </div>

  <div class="controls">
    <div class="hideable" class:idle in:fly={{ y: 24, duration: 450, delay: 250, easing: cubicOut }}>
      {#if manual}
        <div class="slider" transition:fly={{ y: 16, duration: 450, easing: cubicOut }}>
          <Slider
            label="Target speed"
            bind:value={manualKmh}
            min={0}
            max={manualMaxKmh}
            step={1}
            format={(value) => `${value} km/h`}
          />
        </div>
      {/if}
      <div class="slider">
        <Slider label="Volume" bind:value={volume} max={MAX_VOLUME} unity={UNITY_VOLUME} />
      </div>
      <button class="stop" onclick={onstop}>Stop</button>
    </div>
  </div>

  {#if expanded}
    <button class="backdrop" aria-label="Hide engines" onclick={() => (expanded = false)} transition:fade={{ duration: 300 }}></button>
  {/if}

  <div class="sheet" class:expanded class:idle in:fly={{ y: 80, duration: 500, delay: 300, easing: cubicOut }}>
    {#if !expanded}
      <button class="peek" aria-label="Show engines" onclick={() => (expanded = true)}></button>
    {/if}
    <EnginePicker {profiles} {selected} onselect={choose} />
  </div>
</div>

<style>
  .drive {
    --peek: 120px;
    position: fixed;
    inset: 0;
    z-index: 10;
    display: grid;
    grid-template-rows: 1fr auto var(--peek);
    justify-items: center;
    gap: 20px;
    padding-top: 4vh;
    background: #000000;
    overflow: hidden;
  }

  .dial {
    display: grid;
    place-items: center;
    min-height: 0;
    transition: transform var(--duration-slow) var(--ease);
  }

  .controls {
    display: grid;
    justify-items: center;
    gap: 22px;
  }

  .hideable {
    display: grid;
    justify-items: center;
    gap: 22px;
    transition:
      opacity var(--duration-slow) var(--ease),
      transform var(--duration-slow) var(--ease);
  }

  .hideable.idle {
    opacity: 0;
    pointer-events: none;
    transform: translateY(16px);
  }

  .slider {
    --text: #ffffff;
    --muted: rgb(255 255 255 / 0.5);
    --accent: #ffffff;
    --track: rgb(255 255 255 / 0.14);
    --thumb: #000000;
    width: min(560px, 80vw);
    color: var(--text);
    font-size: 0.95rem;
  }

  .stop {
    min-height: 40px;
    padding: 0 26px;
    border: 1px solid rgb(255 255 255 / 0.25);
    background: transparent;
    color: rgb(255 255 255 / 0.8);
    font-size: 0.9rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    box-shadow: none;
  }

  .stop:hover:not(:disabled) {
    border-color: rgb(255 255 255 / 0.6);
    background: rgb(255 255 255 / 0.06);
    color: #ffffff;
  }

  .backdrop {
    position: absolute;
    inset: 0;
    z-index: 1;
    min-height: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: rgb(0 0 0 / 0.6);
  }

  .sheet {
    position: absolute;
    bottom: 0;
    left: 50%;
    z-index: 2;
    width: min(1200px, 94vw);
    max-height: 70vh;
    padding: 16px 16px 24px;
    overflow: hidden;
    opacity: 0.5;
    transform: translate(-50%, calc(100% - var(--peek)));
    -webkit-mask-image: linear-gradient(to bottom, #000 0, transparent var(--peek));
    mask-image: linear-gradient(to bottom, #000 0, transparent var(--peek));
    transition:
      transform var(--duration-slow) var(--ease),
      opacity var(--duration-slow) var(--ease);
  }

  .sheet.expanded {
    overflow-y: auto;
    opacity: 1;
    transform: translate(-50%, 0);
    border-top: 1px solid rgb(255 255 255 / 0.12);
    border-radius: 18px 18px 0 0;
    background: #000000;
    -webkit-mask-image: none;
    mask-image: none;
  }

  .sheet.idle {
    opacity: 0;
    pointer-events: none;
    transform: translate(-50%, 100%);
  }

  .peek {
    position: absolute;
    inset: 0;
    z-index: 1;
    min-height: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
  }

  .peek:hover:not(:disabled) {
    background: transparent;
  }

  .sheet:not(.expanded):hover {
    opacity: 0.7;
  }
</style>
