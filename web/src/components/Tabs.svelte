<script lang="ts" generics="T extends string">
  interface Props {
    options: { id: T; label: string; hint?: string }[]
    value: T
    onchange: (value: T) => void
  }

  let { options, value, onchange }: Props = $props()

  const index = $derived(Math.max(0, options.findIndex((option) => option.id === value)))
</script>

<div class="tabs" role="tablist" style:--count={options.length} style:--index={index}>
  <span class="pill"></span>
  {#each options as option (option.id)}
    <button
      role="tab"
      class:active={option.id === value}
      aria-selected={option.id === value}
      onclick={() => onchange(option.id)}
    >
      <span class="label">{option.label}</span>
      {#if option.hint}<span class="hint">{option.hint}</span>{/if}
    </button>
  {/each}
</div>

<style>
  .tabs {
    position: relative;
    display: grid;
    grid-template-columns: repeat(var(--count), 1fr);
    padding: 4px;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: var(--surface);
  }

  .pill {
    position: absolute;
    top: 4px;
    bottom: 4px;
    left: 4px;
    width: calc((100% - 8px) / var(--count));
    border-radius: var(--radius-control);
    background: color-mix(in srgb, var(--accent) 18%, var(--bg));
    border: 1px solid color-mix(in srgb, var(--accent) 60%, transparent);
    transform: translateX(calc(var(--index) * 100%));
    transition: transform var(--duration) var(--ease);
  }

  button {
    position: relative;
    flex-direction: column;
    gap: 2px;
    min-height: 56px;
    border: none;
    background: transparent;
    box-shadow: none;
    color: var(--muted);
  }

  button:hover:not(:disabled) {
    border: none;
  }

  button.active {
    color: var(--text);
  }

  .label {
    font-weight: var(--weight-medium);
  }

  .hint {
    font-size: 0.8rem;
    color: var(--muted);
  }
</style>
