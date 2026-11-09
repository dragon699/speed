import { decodeFrame, encodeFrame, type ClientMessage, type Frame, type ServerMessage } from './protocol'

export type Role = 'car' | 'phone'

export interface RelayState {
  connected: boolean
  car: boolean
  phone: boolean
  charging: boolean
  rttMs: number | null
  error: string | null
}

const PING_INTERVAL_MS = 2000
const STALE_AFTER_MS = 6000
const RETRY_AFTER_MS = 2000

const CLOSE_UNAUTHORIZED = 4401
const CLOSE_REPLACED = 4409

const INITIAL_STATE: RelayState = {
  connected: false,
  car: false,
  phone: false,
  charging: false,
  rttMs: null,
  error: null
}

export class Relay {
  state = $state<RelayState>({ ...INITIAL_STATE })
  onFrame: ((frame: Frame) => void) | null = null
  onOpen: (() => void) | null = null

  private role: Role
  private code: string
  private key: string
  private socket: WebSocket | null = null
  private pingTimer = 0
  private retryTimer = 0
  private lastMessageAt = 0
  private running = false

  constructor(role: Role, code: string, key: string) {
    this.role = role
    this.code = code
    this.key = key
  }

  start() {
    this.running = true
    this.connect()
  }

  stop() {
    this.running = false
    clearTimeout(this.retryTimer)
    this.drop()
    this.state = { ...INITIAL_STATE }
  }

  sendFrame(frame: Frame) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(encodeFrame(frame))
  }

  sendControl(message: ClientMessage) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message))
  }

  private connect() {
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws'
    const socket = new WebSocket(`${scheme}://${location.host}/ws/${this.role}/${this.code}`)
    socket.binaryType = 'arraybuffer'

    socket.onopen = () => {
      this.lastMessageAt = performance.now()
      this.sendControl({ type: 'hello', key: this.key })
      this.state.connected = true
      this.state.error = null
      this.pingTimer = window.setInterval(() => this.ping(), PING_INTERVAL_MS)
      this.onOpen?.()
    }

    socket.onmessage = (event: MessageEvent) => {
      this.lastMessageAt = performance.now()

      if (typeof event.data === 'string') {
        this.handleControl(JSON.parse(event.data))
        return
      }

      const frame = decodeFrame(event.data)
      if (frame) this.onFrame?.(frame)
    }

    socket.onclose = (event: CloseEvent) => this.handleClose(event.code)
    this.socket = socket
  }

  private handleClose(code: number) {
    this.drop()

    if (code === CLOSE_UNAUTHORIZED) return this.fail('Invalid device key – open the setup link again')
    if (code === CLOSE_REPLACED) return this.fail('Opened on another device')

    this.state = { ...INITIAL_STATE }
    if (this.running) this.retryTimer = window.setTimeout(() => this.connect(), RETRY_AFTER_MS)
  }

  private fail(error: string) {
    this.running = false
    this.state = { ...INITIAL_STATE, error }
  }

  private drop() {
    clearInterval(this.pingTimer)

    if (!this.socket) return

    this.socket.onopen = null
    this.socket.onmessage = null
    this.socket.onclose = null
    this.socket.close()
    this.socket = null
  }

  private ping() {
    if (performance.now() - this.lastMessageAt > STALE_AFTER_MS) return this.handleClose(0)

    this.sendControl({ type: 'ping', t: performance.now() })
  }

  private handleControl(message: ServerMessage) {
    if (message.type === 'status') {
      this.state.car = message.car
      this.state.phone = message.phone
      this.state.charging = message.charging
    } else if (message.type === 'pong') {
      this.state.rttMs = performance.now() - message.t
    }
  }
}
