<script lang="ts">
  import { clamp } from '../lib/math'

  const SWEEP_DEG = 270
  const START_DEG = 135
  const RADIUS = 180
  const CENTER = 200
  const TICK_STEP_KMH = 20
  const MAJOR_TICK_EVERY = 2

  interface Props {
    kmh: number
    maxKmh: number
  }

  let { kmh, maxKmh }: Props = $props()

  const progress = $derived(clamp(kmh / maxKmh, 0, 1))
  const ticks = $derived(
    Array.from({ length: Math.floor(maxKmh / TICK_STEP_KMH) + 1 }, (_, index) => ({
      angle: START_DEG + (index * TICK_STEP_KMH * SWEEP_DEG) / maxKmh,
      major: index % MAJOR_TICK_EVERY === 0
    }))
  )

  function point(angleDeg: number, radius: number): [number, number] {
    const radians = (angleDeg * Math.PI) / 180
    return [CENTER + radius * Math.cos(radians), CENTER + radius * Math.sin(radians)]
  }

  const [startX, startY] = point(START_DEG, RADIUS)
  const [endX, endY] = point(START_DEG + SWEEP_DEG, RADIUS)
  const arc = `M ${startX} ${startY} A ${RADIUS} ${RADIUS} 0 1 1 ${endX} ${endY}`
</script>

<div class="speedometer">
  <svg viewBox="0 0 400 400" aria-hidden="true">
    <path class="track" d={arc} pathLength="1" />
    <path class="value" d={arc} pathLength="1" style:stroke-dasharray="{progress} 1" />
    {#each ticks as tick, index (index)}
      {@const [x1, y1] = point(tick.angle, tick.major ? RADIUS - 22 : RADIUS - 16)}
      {@const [x2, y2] = point(tick.angle, RADIUS - 10)}
      <line class="tick" class:major={tick.major} {x1} {y1} {x2} {y2} style:--i={index} />
    {/each}
  </svg>

  <div class="readout">
    <span class="number">{Math.round(kmh)}</span>
    <span class="unit">km/h</span>
  </div>
</div>

<style>
  .speedometer {
    position: relative;
    width: min(62vh, 76vw);
    aspect-ratio: 1;
  }

  svg {
    width: 100%;
    height: 100%;
    overflow: visible;
  }

  path {
    fill: none;
    stroke-linecap: round;
  }

  .track {
    stroke: rgb(255 255 255 / 0.1);
    stroke-width: 3;
    stroke-dasharray: 1 1;
    animation: draw 750ms cubic-bezier(0.2, 0.8, 0.2, 1) 150ms both;
  }

  .value {
    stroke: #ffffff;
    stroke-width: 4;
    filter: drop-shadow(0 0 6px rgb(255 255 255 / 0.35));
    transition: stroke-dasharray 120ms linear;
  }

  .tick {
    stroke: rgb(255 255 255 / 0.22);
    stroke-width: 1.5;
    stroke-linecap: round;
    animation: tick-in 500ms ease-out both;
    animation-delay: calc(250ms + var(--i) * 25ms);
  }

  .tick.major {
    stroke: rgb(255 255 255 / 0.45);
    stroke-width: 2;
  }

  .readout {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    color: #ffffff;
    animation: rise 600ms cubic-bezier(0.2, 0.8, 0.2, 1) 200ms both;
  }

  .number {
    font-size: min(17vh, 20vw);
    font-weight: 200;
    line-height: 1;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }

  .unit {
    color: rgb(255 255 255 / 0.5);
    font-size: min(2.6vh, 3vw);
    font-weight: var(--weight-regular);
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }

  @keyframes draw {
    from {
      stroke-dashoffset: 1;
    }
    to {
      stroke-dashoffset: 0;
    }
  }

  @keyframes tick-in {
    from {
      opacity: 0;
    }
  }

  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(12px) scale(0.96);
    }
  }
</style>
