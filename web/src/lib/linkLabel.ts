import type { LinkRoute, LinkState } from './peer.svelte'

const ROUTE_LABELS: Record<LinkRoute, string> = {
  direct: 'direct (same Wi-Fi)',
  internet: 'peer-to-peer over the internet',
  turn: 'via TURN server'
}

const STATE_LABELS: Record<Exclude<LinkState, 'open'>, string> = {
  off: '—',
  connecting: 'connecting…',
  failed: 'not reachable – using relay',
  unsupported: 'not supported – using relay'
}

export function linkLabel(state: LinkState, route: LinkRoute | null): string {
  if (state !== 'open') return STATE_LABELS[state]
  return route ? ROUTE_LABELS[route] : 'open'
}
