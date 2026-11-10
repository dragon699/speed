<script lang="ts">
  import CarSilhouette from './CarSilhouette.svelte'
  import type { EngineProfile } from '../lib/engines'

  const FIRING_CYCLE_S = 1.6

  interface Props {
    profiles: EngineProfile[]
    selected: EngineProfile
    onselect: (profile: EngineProfile) => void
  }

  let { profiles, selected, onselect }: Props = $props()

  function specLine(profile: EngineProfile): string {
    const parts = [profile.layout, `${profile.displacement.toFixed(1)} L`]
    if (!profile.layout.includes(profile.aspiration)) parts.push(profile.aspiration)
    return parts.join(' · ')
  }

  function cylinders(profile: EngineProfile) {
    return profile.fireAngles.map((angle, index) => ({ angle, bank: profile.banks[index], index }))
  }
</script>

<div class="picker" role="listbox" aria-label="Engine">
  {#each profiles as profile (profile.id)}
    {@const active = profile.id === selected.id}
    <button
      class="card"
      class:active
      role="option"
      aria-selected={active}
      style:--engine={profile.color}
      onclick={() => onselect(profile)}
    >
      <span class="car"><CarSilhouette body={profile.body} color={profile.color} /></span>
      <span class="name">{profile.name}</span>
      <span class="spec">{specLine(profile)}</span>
      <span class="inspired">{profile.inspiredBy}</span>
      <span class="firing" class:split={new Set(profile.banks).size > 1}>
        {#each cylinders(profile) as cylinder (cylinder.index)}
          <span
            class="cylinder"
            class:bank-b={cylinder.bank === 1}
            style:animation-delay="{(cylinder.angle / profile.cycleDeg) * FIRING_CYCLE_S}s"
            style:animation-duration="{FIRING_CYCLE_S}s"
          ></span>
        {/each}
      </span>
      <span class="redline">{profile.redline.toLocaleString('en-US')} rpm</span>
    </button>
  {/each}
</div>

<style>
  .picker {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(196px, 1fr));
    gap: 12px;
  }

  .card {
    position: relative;
    display: grid;
    grid-template-rows: auto auto auto auto 1fr;
    justify-items: start;
    gap: 4px;
    min-height: 0;
    padding: 10px 14px 12px;
    border: 1px solid var(--border);
    border-radius: 18px;
    background:
      radial-gradient(120% 80% at 50% 0%, color-mix(in srgb, var(--engine) 12%, transparent), transparent 70%),
      var(--surface);
    color: var(--text);
    font-size: 1rem;
    text-align: left;
    transition:
      transform var(--duration) var(--ease),
      border-color var(--duration) var(--ease),
      box-shadow var(--duration) var(--ease),
      background-color var(--duration) var(--ease);
  }

  .card:hover:not(.active) {
    border-color: color-mix(in srgb, var(--engine) 45%, var(--border));
  }

  .card.active {
    border-color: var(--engine);
    box-shadow:
      0 0 0 1px var(--engine),
      0 10px 34px color-mix(in srgb, var(--engine) 30%, transparent);
    transform: translateY(-3px);
  }

  .card:active {
    transform: scale(0.97);
  }

  .card::after {
    content: '✓';
    position: absolute;
    top: 10px;
    right: 12px;
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: var(--engine);
    color: #0b0d10;
    font-size: 0.9rem;
    font-weight: 700;
    opacity: 0;
    transform: scale(0.5);
    transition:
      opacity var(--duration) var(--ease),
      transform var(--duration) var(--ease);
  }

  .card.active::after {
    opacity: 1;
    transform: scale(1);
  }

  .car {
    width: 82%;
    margin: 0 0 2px;
    transition: transform var(--duration-slow) var(--ease);
  }

  .card.active .car {
    transform: translateX(6px);
  }

  .name {
    font-size: 1.15rem;
    font-weight: var(--weight-medium);
  }

  .spec {
    color: var(--engine);
    font-size: 0.9rem;
    font-weight: var(--weight-regular);
  }

  .inspired {
    color: var(--muted);
    font-size: 0.85rem;
  }

  .firing {
    display: flex;
    flex-wrap: wrap;
    align-content: end;
    gap: 4px;
    width: 100%;
    margin-top: 6px;
  }

  .firing.split {
    display: grid;
    grid-auto-flow: column;
    grid-template-rows: 1fr 1fr;
    justify-content: start;
  }

  .cylinder {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--track);
    transition: background-color var(--duration) var(--ease);
  }

  .firing.split .cylinder {
    grid-row: 1;
  }

  .firing.split .cylinder.bank-b {
    grid-row: 2;
  }

  .card.active .cylinder {
    animation-name: fire;
    animation-iteration-count: infinite;
    animation-timing-function: ease-out;
  }

  .redline {
    justify-self: end;
    margin-top: -14px;
    color: var(--muted);
    font-family: var(--font-mono);
    font-size: 0.8rem;
  }

  @keyframes fire {
    0% {
      background: var(--engine);
      box-shadow: 0 0 10px var(--engine);
    }

    18%,
    100% {
      background: var(--track);
      box-shadow: none;
    }
  }
</style>
