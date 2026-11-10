<script lang="ts">
  import { encode } from 'uqr'
  import Icon from './Icon.svelte'
  import { formatCode, pairingUrl } from '../lib/device'

  const QUIET_ZONE = 2

  let { code }: { code: string } = $props()

  const url = $derived(pairingUrl(code))
  const qr = $derived(encode(url, { ecc: 'M', border: QUIET_ZONE }))
  const path = $derived(
    qr.data
      .flatMap((row, y) => row.map((dark, x) => (dark ? `M${x} ${y}h1v1h-1z` : '')))
      .join('')
  )
</script>

<section class="pairing">
  <svg class="qr" viewBox="0 0 {qr.size} {qr.size}" shape-rendering="crispEdges" role="img" aria-label="Pairing QR code">
    <rect width={qr.size} height={qr.size} fill="#ffffff" />
    <path d={path} fill="#000000" />
  </svg>

  <div class="text">
    <h2><Icon name="phone" size={20} /> Improve GPS accuracy by pairing a phone</h2>
    <p>Scan with phone camera</p>
    <p>
      Or open <strong>{location.host}/phone</strong> and enter
      <span class="code">{formatCode(code)}</span>
    </p>
  </div>
</section>

<style>
  .pairing {
    display: flex;
    align-items: center;
    gap: 28px;
    padding: 20px 24px;
    border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--border));
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow);
  }

  .qr {
    flex: none;
    width: 200px;
    height: 200px;
    border-radius: 10px;
  }

  .text {
    display: grid;
    gap: 10px;
    min-width: 0;
  }

  h2 {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0;
    font-size: 1.25rem;
    font-weight: var(--weight-medium);
  }

  p {
    margin: 0;
    color: var(--muted);
  }

  strong {
    color: var(--text);
    font-weight: var(--weight-medium);
  }

  .code {
    display: inline-block;
    margin-top: 4px;
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 1.1rem;
    letter-spacing: 0.08em;
  }

  @media (max-width: 560px) {
    .pairing {
      flex-direction: column;
      text-align: center;
    }

    h2 {
      justify-content: center;
    }
  }
</style>
