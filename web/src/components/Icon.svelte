<script lang="ts">
  import type { IconName } from '../lib/status'

  let { name, size = 28 }: { name: IconName; size?: number } = $props()
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  {#if name === 'server'}
    <rect x="3" y="4" width="18" height="7" rx="1.5" />
    <rect x="3" y="13" width="18" height="7" rx="1.5" />
    <path d="M7 7.5h.01M7 16.5h.01" />
  {:else if name === 'phone'}
    <rect x="7" y="2" width="10" height="20" rx="2" />
    <path d="M11 18h2" />
  {:else if name === 'car'}
    <path d="M3 16v-3l2.2-5.2A2 2 0 0 1 7 6.5h10a2 2 0 0 1 1.8 1.3L21 13v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" />
    <path d="M3 13h18" />
    <circle cx="7.5" cy="17" r="1.8" />
    <circle cx="16.5" cy="17" r="1.8" />
  {:else if name === 'charger'}
    <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
  {:else if name === 'gps'}
    <circle cx="12" cy="12" r="7" />
    <circle cx="12" cy="12" r="2.5" />
    <path d="M12 1v4M12 19v4M1 12h4M19 12h4" />
  {:else if name === 'sound'}
    <path d="M11 5 6 9H3v6h3l5 4V5Z" />
    <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
  {:else if name === 'motion'}
    <path d="M3 12h3l3-8 6 16 3-8h3" />
  {:else if name === 'record'}
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="4" fill="currentColor" />
  {:else if name === 'screen'}
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  {:else if name === 'play'}
    <path d="M7 4.5v15l12-7.5-12-7.5Z" fill="currentColor" />
  {:else if name === 'pause'}
    <rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor" />
    <rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor" />
  {:else if name === 'timer'}
    <circle cx="12" cy="13" r="8" />
    <path d="M12 9v4l2.5 2.5M9.5 2h5" />
  {:else if name === 'link'}
    <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3.2-3.2a4.5 4.5 0 0 0-6.4-6.4L11.6 6" />
    <path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3.2 3.2a4.5 4.5 0 0 0 6.4 6.4l1.6-1.6" />
  {:else if name === 'display'}
    <rect x="2.5" y="4" width="19" height="13" rx="2" />
    <path d="M8 21h8M12 17v4" />
  {:else if name === 'clock'}
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  {:else if name === 'gauge'}
    <path d="M4.5 18a9 9 0 1 1 15 0" />
    <path d="m12 13 4-5" />
    <circle cx="12" cy="13" r="1.2" fill="currentColor" />
  {/if}
</svg>
