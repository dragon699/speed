<script lang="ts">
  interface Props {
    label: string
    value: number
    min?: number
    max?: number
    step?: number
    unity?: number
    format?: (value: number) => string
  }

  let {
    label,
    value = $bindable(),
    min = 0,
    max = 1,
    step = 0.01,
    unity,
    format = (value: number) => `${Math.round(value * 100)}%`
  }: Props = $props()

  const share = (point: number) => ((point - min) / (max - min)) * 100
  const fill = $derived(share(value))
  const unityShare = $derived(unity === undefined ? 100 : share(unity))
  const boosted = $derived(unity !== undefined && value > unity)
</script>

<label class="slider">
  <span class="head">
    <span>{label}</span>
    <span class="value" class:boosted>{format(value)}</span>
  </span>
  <span class="track">
    <input type="range" class:boosted {min} {max} {step} bind:value style:--fill="{fill}%" style:--unity="{unityShare}%" />
    {#if unity !== undefined}
      <span class="unity" style:left="{unityShare}%"></span>
    {/if}
  </span>
</label>

<style>
  .slider {
    display: flex;
    flex-direction: column;
    gap: 4px;
    color: var(--muted);
  }

  .head {
    display: flex;
    justify-content: space-between;
  }

  .value {
    color: var(--text);
    font-variant-numeric: tabular-nums;
    transition: color var(--duration) var(--ease);
  }

  .value.boosted {
    color: var(--bad);
  }

  .track {
    position: relative;
    display: block;
  }

  .unity {
    position: absolute;
    top: 50%;
    width: 2px;
    height: 18px;
    border-radius: 1px;
    background: var(--muted);
    opacity: 0.7;
    pointer-events: none;
    transform: translate(-50%, -50%);
  }
</style>
