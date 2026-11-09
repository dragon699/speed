<script lang="ts">
  interface Props {
    label: string
    value: number
    min?: number
    max?: number
    step?: number
    format?: (value: number) => string
  }

  let {
    label,
    value = $bindable(),
    min = 0,
    max = 1,
    step = 0.01,
    format = (value: number) => `${Math.round(value * 100)}%`
  }: Props = $props()

  const fill = $derived(((value - min) / (max - min)) * 100)
</script>

<label class="slider">
  <span class="head">
    <span>{label}</span>
    <span class="value">{format(value)}</span>
  </span>
  <input type="range" {min} {max} {step} bind:value style:--fill="{fill}%" />
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
  }
</style>
