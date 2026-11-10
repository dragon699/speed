import { decodeFrames, encodeFrames, type Frame, type PeerSignal } from './protocol'
import type { Role } from './relay.svelte'

export type LinkState = 'off' | 'connecting' | 'open' | 'failed' | 'unsupported'

export type LinkRoute = 'direct' | 'internet' | 'turn'

const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }]
const CHANNEL_LABEL = 'frames'
const CONNECT_TIMEOUT_MS = 10000
const RETRY_AFTER_MS = 5000
const ROUTES: Record<string, LinkRoute> = { host: 'direct', srflx: 'internet', prflx: 'internet', relay: 'turn' }

export class PeerLink {
  state = $state<LinkState>(supported() ? 'off' : 'unsupported')
  route = $state<LinkRoute | null>(null)
  onFrames: ((frames: Frame[]) => void) | null = null

  private role: Role
  private signal: (signal: PeerSignal) => void
  private connection: RTCPeerConnection | null = null
  private channel: RTCDataChannel | null = null
  private pending: RTCIceCandidateInit[] = []
  private wanted = false
  private timer = 0

  constructor(role: Role, signal: (signal: PeerSignal) => void) {
    this.role = role
    this.signal = signal
  }

  start() {
    if (!supported() || this.wanted) return

    this.wanted = true
    if (this.role === 'phone') void this.offer()
  }

  stop() {
    this.wanted = false
    this.close()
    if (this.state !== 'unsupported') this.state = 'off'
  }

  send(frames: Frame[]): boolean {
    if (this.channel?.readyState !== 'open' || !frames.length) return false

    this.channel.send(encodeFrames(frames))
    return true
  }

  async handleSignal(signal: PeerSignal) {
    if (!supported()) return

    try {
      if (signal.description) await this.accept(signal.description)
      if (signal.candidate) await this.addCandidate(signal.candidate)
    } catch {
      this.fail()
    }
  }

  private async offer() {
    const connection = this.open()
    this.attach(connection.createDataChannel(CHANNEL_LABEL, { ordered: false, maxRetransmits: 0 }))

    try {
      await connection.setLocalDescription(await connection.createOffer())
      this.signal({ description: connection.localDescription!.toJSON() })
    } catch {
      this.fail()
    }
  }

  private async accept(description: RTCSessionDescriptionInit) {
    if (description.type === 'offer') {
      const connection = this.open()
      connection.ondatachannel = (event) => this.attach(event.channel)
      await connection.setRemoteDescription(description)
      await connection.setLocalDescription(await connection.createAnswer())
      this.signal({ description: connection.localDescription!.toJSON() })
    } else if (this.connection) {
      await this.connection.setRemoteDescription(description)
    }

    for (const candidate of this.pending.splice(0)) await this.connection?.addIceCandidate(candidate)
  }

  private async addCandidate(candidate: RTCIceCandidateInit) {
    if (!this.connection?.remoteDescription) {
      this.pending.push(candidate)
      return
    }

    await this.connection.addIceCandidate(candidate)
  }

  private open(): RTCPeerConnection {
    this.close()

    const connection = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    connection.onicecandidate = (event) => {
      if (event.candidate) this.signal({ candidate: event.candidate.toJSON() })
    }
    connection.onconnectionstatechange = () => {
      if (connection.connectionState === 'failed') this.fail()
    }

    this.connection = connection
    this.state = 'connecting'
    this.timer = window.setTimeout(() => this.fail(), CONNECT_TIMEOUT_MS)

    return connection
  }

  private attach(channel: RTCDataChannel) {
    channel.binaryType = 'arraybuffer'
    channel.onopen = () => {
      clearTimeout(this.timer)
      this.state = 'open'
      void this.detectRoute()
    }
    channel.onclose = () => {
      if (this.channel === channel) this.fail()
    }
    channel.onmessage = (event: MessageEvent<ArrayBuffer>) => this.onFrames?.(decodeFrames(event.data))

    this.channel = channel
  }

  private async detectRoute() {
    const stats = await this.connection?.getStats()
    if (!stats) return

    let candidateId: string | null = null
    stats.forEach((report) => {
      if (report.type === 'transport' && report.selectedCandidatePairId) candidateId = stats.get(report.selectedCandidatePairId)?.localCandidateId ?? null
    })
    stats.forEach((report) => {
      if (!candidateId && report.type === 'candidate-pair' && report.state === 'succeeded' && report.nominated) candidateId = report.localCandidateId
    })

    const type = candidateId ? stats.get(candidateId)?.candidateType : null
    this.route = type ? (ROUTES[type] ?? null) : null
  }

  private fail() {
    this.close()
    this.state = 'failed'

    if (this.wanted && this.role === 'phone') this.timer = window.setTimeout(() => void this.offer(), RETRY_AFTER_MS)
  }

  private close() {
    clearTimeout(this.timer)
    this.pending = []
    this.route = null

    if (this.channel) {
      this.channel.onopen = null
      this.channel.onclose = null
      this.channel.onmessage = null
      this.channel.close()
      this.channel = null
    }

    if (this.connection) {
      this.connection.onicecandidate = null
      this.connection.onconnectionstatechange = null
      this.connection.ondatachannel = null
      this.connection.close()
      this.connection = null
    }
  }
}

function supported(): boolean {
  return typeof RTCPeerConnection !== 'undefined'
}
