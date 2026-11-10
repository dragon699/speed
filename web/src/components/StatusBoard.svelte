<script lang="ts">
  import { fade } from 'svelte/transition'
  import Icon from './Icon.svelte'
  import type { BulletSection } from '../lib/status'

  let { sections }: { sections: BulletSection[] } = $props()
</script>

<div class="board">
  {#each sections as section (section.title)}
    <section>
      <h2>{section.title}</h2>
      <ul>
        {#each section.items as item (item.key)}
          <li class={item.tone} transition:fade={{ duration: 200 }}>
            {#key item.icon + item.tone}
              <span class="icon" in:fade={{ duration: 300 }}><Icon name={item.icon} size={18} /></span>
            {/key}
            <div class="body">
              <span class="text">
                {item.text}
                {#if item.active}<span class="active">in use</span>{/if}
              </span>
              {#if item.detail}
                <span class="detail">{item.detail}</span>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    </section>
  {/each}
</div>

<style>
  .board {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 20px 48px;
    padding: 20px 24px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow);
  }

  h2 {
    margin: 0 0 12px;
    color: var(--muted);
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  ul {
    display: grid;
    gap: 10px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: grid;
    grid-template-columns: 18px 1fr;
    align-items: start;
    gap: 12px;
  }

  .icon {
    display: flex;
    padding-top: 2px;
    color: var(--tone);
    transition: color var(--duration) var(--ease);
  }

  .body {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px 12px;
    min-width: 0;
  }

  .text {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--tone);
    font-size: 0.95rem;
    font-weight: 500;
    transition: color var(--duration) var(--ease);
  }

  .detail {
    color: var(--muted);
    font-family: var(--font-mono);
    font-size: 0.8rem;
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }

  .active {
    padding: 1px 7px;
    border: 1px solid color-mix(in srgb, var(--tone) 45%, transparent);
    border-radius: 999px;
    color: var(--tone);
    font-size: 0.68rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
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
  .wait .text {
    animation: pulse 1.4s ease-in-out infinite;
  }

  @media (max-width: 560px) {
    .board {
      grid-template-columns: 1fr;
      padding: 16px;
    }
  }
</style>
