<script lang="ts">
  import { fade } from 'svelte/transition'
  import Icon from './Icon.svelte'
  import type { StatusItem } from '../lib/status'

  let { items }: { items: StatusItem[] } = $props()
</script>

<ul class="status">
  {#each items as item (item.label)}
    <li class={item.tone}>
      {#key item.tone}
        <span class="icon" in:fade={{ duration: 300 }}><Icon name={item.icon} /></span>
      {/key}
      <span class="label">{item.label}</span>
      {#key item.tone}
        <span class="value" in:fade={{ duration: 300 }}>{item.value}</span>
      {/key}
    </li>
  {/each}
</ul>

<style>
  .status {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow);
    overflow: hidden;
  }

  li {
    position: relative;
    display: grid;
    grid-template-columns: 44px 140px 1fr;
    align-items: center;
    gap: 12px;
    min-height: 56px;
    padding: 8px 20px;
    font-size: 1.2rem;
    transition: background-color var(--duration) var(--ease);
  }

  li::before {
    content: '';
    position: absolute;
    inset: 0 auto 0 0;
    width: 4px;
    background: var(--tone);
    transition: background-color var(--duration) var(--ease);
  }

  li + li {
    border-top: 1px solid var(--border);
  }

  .icon {
    display: flex;
    color: var(--tone);
    transition: color var(--duration) var(--ease);
  }

  .label {
    color: var(--muted);
  }

  .value {
    color: var(--tone);
    overflow-wrap: anywhere;
    font-variant-numeric: tabular-nums;
    transition: color var(--duration) var(--ease);
  }

  .ok {
    --tone: var(--ok);
  }

  .warn {
    --tone: var(--warn);
  }

  .bad {
    --tone: var(--bad);
  }

  .idle {
    --tone: var(--muted);
  }

  .wait {
    --tone: var(--warn);
  }

  .wait .icon,
  .wait .value {
    animation: pulse 1.4s ease-in-out infinite;
  }

  @media (max-width: 560px) {
    li {
      grid-template-columns: 28px 76px 1fr;
      gap: 10px;
      min-height: 52px;
      padding: 8px 14px;
      font-size: 1.05rem;
    }

    .icon :global(svg) {
      width: 22px;
      height: 22px;
    }
  }
</style>
