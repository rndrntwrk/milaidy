/**
 * OscBridge — UDP OSC sender for holographic rig control.
 *
 * Sends OSC messages to the taobot-rig holographic renderer
 * (c:/Art/Holoexhibit/taobot-rig) at 127.0.0.1:7400.
 * Also compatible with Unreal Engine BP_TaoBot_OSCManager on the same port.
 *
 * OSC wire format (spec 1.0):
 *   Address pattern — null-terminated, padded to 4-byte boundary
 *   Type tag string — "," + tags, null-terminated, padded to 4-byte boundary
 *   Arguments — int32 BE / float32 BE / null-padded string, each 4-byte aligned
 */

import dgram from 'node:dgram'

const OSC_HOST = '127.0.0.1'
const OSC_PORT = 7400

// ---------------------------------------------------------------------------
// OSC encoding
// ---------------------------------------------------------------------------

function oscPad(buf: Buffer): Buffer {
  const rem = buf.length % 4
  return rem === 0 ? buf : Buffer.concat([buf, Buffer.alloc(4 - rem, 0)])
}

function oscString(s: string): Buffer {
  return oscPad(Buffer.from(s + '\0', 'utf-8'))
}

function oscFloat(f: number): Buffer {
  const buf = Buffer.alloc(4)
  buf.writeFloatBE(f, 0)
  return buf
}

function oscInt(i: number): Buffer {
  const buf = Buffer.alloc(4)
  buf.writeInt32BE(i, 0)
  return buf
}

type OscArg =
  | { type: 's'; value: string }
  | { type: 'f'; value: number }
  | { type: 'i'; value: number }

function oscMessage(address: string, args: OscArg[]): Buffer {
  const addrBuf = oscString(address)
  const typeTagBuf = oscString(',' + args.map(a => a.type).join(''))
  const argBufs = args.map(a => {
    if (a.type === 's') return oscString(a.value)
    if (a.type === 'f') return oscFloat(a.value)
    return oscInt(a.value)
  })
  return Buffer.concat([addrBuf, typeTagBuf, ...argBufs])
}

// ---------------------------------------------------------------------------
// Singleton UDP socket (lazy, unreffed so it doesn't block process exit)
// ---------------------------------------------------------------------------

let _socket: dgram.Socket | null = null

function getSocket(): dgram.Socket {
  if (!_socket) {
    _socket = dgram.createSocket('udp4')
    _socket.unref()
  }
  return _socket
}

function send(address: string, args: OscArg[]): void {
  const msg = oscMessage(address, args)
  getSocket().send(msg, 0, msg.length, OSC_PORT, OSC_HOST)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Send emotion/animation state.
 * Valid values: 'idle' | 'happy' | 'think' | 'thankful' | 'wave' | 'dance' |
 *               'hip-hop-dancing' | 'bellydancing' | 'moonwalk' | 'singing' | etc.
 * elizaOS emotion strings ('playful', 'warm', 'curious') are also accepted —
 * the renderer maps them via EMOTION_TO_ANIM in main.ts.
 *
 * OSC: /taobot/emotion  ,s  <state>
 */
export function sendEmotion(state: string): void {
  send('/taobot/emotion', [{ type: 's', value: state }])
}

/**
 * Signal TaoBot has started speaking.
 * @param duration Expected duration in seconds (0 = indefinite).
 *
 * OSC: /taobot/speak/start  ,f  <duration>
 */
export function sendSpeakStart(duration: number): void {
  send('/taobot/speak/start', [{ type: 'f', value: duration }])
}

/**
 * Signal TaoBot stopped speaking.
 *
 * OSC: /taobot/speak/stop  ,
 */
export function sendSpeakStop(): void {
  send('/taobot/speak/stop', [])
}

/**
 * Trigger greeting wave animation.
 *
 * OSC: /taobot/greeting  ,
 */
export function sendGreeting(): void {
  send('/taobot/greeting', [])
}

/**
 * Set key light color (0.0–1.0 linear RGB).
 *
 * OSC: /taobot/light/keycolor  ,fff  <r> <g> <b>
 */
export function sendLightColor(r: number, g: number, b: number): void {
  send('/taobot/light/keycolor', [
    { type: 'f', value: r },
    { type: 'f', value: g },
    { type: 'f', value: b },
  ])
}

/**
 * Switch camera framing preset.
 * Valid: 'full-body' | 'upper-body' | 'face'
 *
 * OSC: /taobot/camera/mode  ,s  <mode>
 */
export function sendCameraMode(mode: string): void {
  send('/taobot/camera/mode', [{ type: 's', value: mode }])
}

/** Close the UDP socket (call on service shutdown). */
export function closeOscSocket(): void {
  if (_socket) {
    _socket.close()
    _socket = null
  }
}
