<script lang="ts">
  interface Props {
    label: string
    checked: boolean
    disabled?: boolean
    onchange?: (checked: boolean) => void
  }

  let { label, checked = $bindable(), disabled = false, onchange }: Props = $props()
</script>

<label class="toggle" class:checked class:disabled>
  <span>{label}</span>
  <input type="checkbox" bind:checked {disabled} onchange={() => onchange?.(checked)} />
  <span class="track"><span class="thumb"></span></span>
</label>

<style>
  .toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 64px;
    padding: 0 20px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    font-size: 1.2rem;
    cursor: pointer;
    user-select: none;
    transition:
      border-color var(--duration) var(--ease),
      opacity var(--duration) var(--ease);
  }

  .toggle.checked {
    border-color: color-mix(in srgb, var(--accent) 60%, var(--border));
  }

  .toggle.disabled {
    opacity: 0.45;
    cursor: default;
  }

  input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .track {
    position: relative;
    width: 56px;
    height: 32px;
    border-radius: 999px;
    background: var(--track);
    transition: background-color var(--duration) var(--ease);
  }

  .thumb {
    position: absolute;
    top: 4px;
    left: 4px;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--thumb);
    box-shadow: 0 2px 6px rgb(0 0 0 / 0.3);
    transition: transform var(--duration) var(--ease);
  }

  .checked .track {
    background: var(--accent);
  }

  .checked .thumb {
    transform: translateX(24px);
  }

  .toggle:active:not(.disabled) .thumb {
    width: 28px;
  }

  input:focus-visible + .track {
    outline: 2px solid var(--accent);
    outline-offset: 3px;
  }
</style>
