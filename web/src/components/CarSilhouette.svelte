<script lang="ts">
  let { body, color }: { body: string; color: string } = $props()

  const ARCHES = 'L174,48 A16,16 0 0 0 142,48 L60,48 A16,16 0 0 0 28,48 L10,48 Z'

  const shapes: Record<string, { body: string; glass: string; extra?: string }> = {
    muscle: {
      body: 'M10,48 L10,40 Q11,35 22,34 L58,31 Q78,18 100,17 L118,18 Q128,20 138,30 L178,33 Q189,35 190,42 L190,48 ',
      glass: 'M64,31 Q80,21 99,20 L116,21 Q124,23 131,30 Z'
    },
    supercar: {
      body: 'M10,48 L11,38 Q13,33 28,31 L70,28 Q92,15 116,16 Q132,18 150,30 L183,36 Q190,39 190,44 L190,48 ',
      glass: 'M78,28 Q95,18 114,19 Q127,21 140,29 Z'
    },
    wedge: {
      body: 'M10,48 L10,36 L40,30 L74,27 L106,15 L126,16 L162,31 L190,38 L190,48 ',
      glass: 'M82,27 L107,18 L124,19 L150,29 Z',
      extra: 'M14,34 L40,32'
    },
    gt: {
      body: 'M10,48 L10,44 Q12,34 40,24 Q66,14 92,14 Q110,15 124,26 L148,32 Q180,35 189,41 L190,48 ',
      glass: 'M50,25 Q70,17 91,17 Q106,18 116,26 Z'
    },
    gtwing: {
      body: 'M10,48 L10,44 Q12,34 40,24 Q66,14 92,14 Q110,15 124,26 L148,32 Q180,35 189,41 L190,48 ',
      glass: 'M50,25 Q70,17 91,17 Q106,18 116,26 Z',
      extra: 'M8,17 L34,17 M16,17 L20,26 M28,17 L30,24'
    },
    coupe: {
      body: 'M10,48 L10,38 Q12,33 30,32 L52,31 Q72,17 96,16 L112,17 Q124,19 136,30 L176,33 Q189,35 190,42 L190,48 ',
      glass: 'M58,31 Q75,20 95,19 L110,20 Q120,22 128,30 Z',
      extra: 'M12,27 L42,26 M18,27 L20,32 M36,26 L38,31'
    },
    hatch: {
      body: 'M10,48 L11,30 Q12,24 20,22 L44,15 L110,14 Q122,15 136,27 L176,31 Q189,33 190,40 L190,48 ',
      glass: 'M24,24 L46,18 L108,17 Q118,18 128,27 Z'
    },
    rally: {
      body: 'M10,48 L10,36 Q12,32 26,31 L48,30 Q60,17 80,16 L118,16 Q128,18 140,28 L178,32 Q189,34 190,42 L190,48 ',
      glass: 'M54,29 Q64,19 81,19 L116,19 Q124,21 132,28 Z',
      extra: 'M6,23 L38,23 M12,23 L16,30 M32,23 L34,30 M150,29 L158,26 L166,29'
    }
  }

  const shape = $derived(shapes[body] ?? shapes.coupe)
</script>

<svg viewBox="0 0 200 66" aria-hidden="true">
  <defs>
    <linearGradient id="paint-{body}-{color}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color={color} stop-opacity="0.95" />
      <stop offset="1" stop-color={color} stop-opacity="0.55" />
    </linearGradient>
  </defs>
  <ellipse cx="100" cy="61" rx="88" ry="3" class="shadow" />
  <path d={shape.body + ARCHES} fill="url(#paint-{body}-{color})" />
  <path d={shape.glass} class="glass" />
  {#if shape.extra}
    <path d={shape.extra} class="extra" stroke={color} />
  {/if}
  <circle cx="158" cy="50" r="11" class="tire" />
  <circle cx="44" cy="50" r="11" class="tire" />
  <circle cx="158" cy="50" r="5" class="rim" />
  <circle cx="44" cy="50" r="5" class="rim" />
</svg>

<style>
  svg {
    display: block;
    width: 100%;
    height: auto;
  }

  .shadow {
    fill: rgb(0 0 0 / 0.35);
  }

  .glass {
    fill: rgb(10 14 20 / 0.55);
  }

  .extra {
    fill: none;
    stroke-width: 3;
    stroke-linecap: round;
  }

  .tire {
    fill: #0d0f13;
    stroke: #2c323d;
    stroke-width: 1.5;
  }

  .rim {
    fill: #8a93a3;
  }
</style>
