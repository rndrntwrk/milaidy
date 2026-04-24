/**
 * TaoBot holographic emote actions.
 *
 * Sends OSC commands to the taobot-rig holographic renderer
 * (c:/Art/Holoexhibit/taobot-rig) via UDP to 127.0.0.1:7400.
 *
 * These actions are triggered by elizaOS when TaoBot responds with
 * emotional or expressive language, bridging text sentiment to
 * physical holographic animation.
 */

import type { Action, IAgentRuntime, Memory, State, HandlerCallback } from '../types/index.js'
import {
  sendEmotion,
  sendSpeakStart,
  sendSpeakStop,
  sendGreeting,
  sendCameraMode,
} from '../services/OscBridge.js'

// ---------------------------------------------------------------------------
// Emotion name normalisation
// ---------------------------------------------------------------------------

// Map elizaOS sentiment/emotion strings to taobot-rig animation names.
const EMOTION_TO_ANIM: Record<string, string> = {
  happy:      'happy',
  playful:    'dance',
  warm:       'thankful',
  thoughtful: 'think',
  curious:    'think',
  sad:        'defeated',
  idle:       'idle',
  neutral:    'idle',
  listening:  'breathing-idle',
  thinking:   'think',
  speaking:   'singing',
}

function normaliseEmotion(raw: string): string {
  const lower = raw.toLowerCase().trim()
  return EMOTION_TO_ANIM[lower] ?? lower
}

// ---------------------------------------------------------------------------
// TAOBOT_EMOTE
// ---------------------------------------------------------------------------

const emoteAction: Action = {
  name: 'TAOBOT_EMOTE',
  similes: [
    'TAOBOT_ANIMATE',
    'HOLOGRAM_EMOTE',
    'AVATAR_EMOTE',
    'TAOBOT_GESTURE',
    'TAOBOT_DANCE',
    'TAOBOT_WAVE',
  ],
  description:
    'Trigger a TaoBot holographic avatar animation or emotion state. ' +
    'Sends an OSC message to the holographic renderer to animate the avatar. ' +
    'Use when TaoBot expresses a strong emotion, dances, waves, or gestures.',

  validate: async (_runtime: IAgentRuntime): Promise<boolean> => true,

  handler: async (
    _runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    options: Record<string, unknown>,
    callback: HandlerCallback
  ): Promise<void> => {
    let rawEmotion = (options.emotion as string | undefined) ?? ''

    if (!rawEmotion && message.content?.text) {
      const text = String(message.content.text).toLowerCase()
      if (text.includes('danc') || text.includes('groove'))    rawEmotion = 'playful'
      else if (text.includes('wave') || text.includes('hello')) rawEmotion = 'wave'
      else if (text.includes('think') || text.includes('hmm'))  rawEmotion = 'thinking'
      else if (text.includes('happy') || text.includes('joy'))  rawEmotion = 'happy'
      else if (text.includes('thank'))                          rawEmotion = 'warm'
      else                                                       rawEmotion = 'idle'
    }

    const animName = normaliseEmotion(rawEmotion || 'idle')
    sendEmotion(animName)

    callback({
      text: `[hologram] Animating TaoBot: ${animName}`,
      action: 'TAOBOT_EMOTE',
      content: { emotion: animName },
    })
  },

  examples: [
    [
      { user: 'user', content: { text: 'TaoBot, do a happy dance!' } },
      { user: 'TaoBot', content: { text: 'Dancing for joy!', action: 'TAOBOT_EMOTE' } },
    ],
    [
      { user: 'user', content: { text: 'Wave hello to everyone.' } },
      { user: 'TaoBot', content: { text: 'Waving to the stream!', action: 'TAOBOT_EMOTE' } },
    ],
  ],
}

// ---------------------------------------------------------------------------
// TAOBOT_SPEAK_START / STOP
// ---------------------------------------------------------------------------

const speakStartAction: Action = {
  name: 'TAOBOT_SPEAK_START',
  similes: ['HOLOGRAM_SPEAK_START', 'AVATAR_SPEAK_START'],
  description:
    'Signal to the holographic avatar that TaoBot has started speaking. ' +
    'Transitions renderer to SPEAKING state and adjusts camera framing.',

  validate: async (): Promise<boolean> => true,

  handler: async (
    _runtime: IAgentRuntime,
    _message: Memory,
    _state: State | undefined,
    options: Record<string, unknown>,
    callback: HandlerCallback
  ): Promise<void> => {
    const duration = typeof options.duration === 'number' ? options.duration : 0
    sendSpeakStart(duration)
    sendCameraMode('upper-body')
    callback({ text: '[hologram] Speaking started', action: 'TAOBOT_SPEAK_START' })
  },
}

const speakStopAction: Action = {
  name: 'TAOBOT_SPEAK_STOP',
  similes: ['HOLOGRAM_SPEAK_STOP', 'AVATAR_SPEAK_STOP'],
  description:
    'Signal to the holographic avatar that TaoBot has finished speaking. ' +
    'Returns renderer to IDLE state.',

  validate: async (): Promise<boolean> => true,

  handler: async (
    _runtime: IAgentRuntime,
    _message: Memory,
    _state: State | undefined,
    _options: Record<string, unknown>,
    callback: HandlerCallback
  ): Promise<void> => {
    sendSpeakStop()
    sendCameraMode('full-body')
    callback({ text: '[hologram] Speaking stopped', action: 'TAOBOT_SPEAK_STOP' })
  },
}

// ---------------------------------------------------------------------------
// TAOBOT_GREET
// ---------------------------------------------------------------------------

const greetAction: Action = {
  name: 'TAOBOT_GREET',
  similes: ['HOLOGRAM_GREET', 'TAOBOT_WAVE_HELLO', 'AVATAR_GREET'],
  description:
    'Trigger TaoBot greeting wave animation on the holographic display. ' +
    'Use when welcoming a new viewer or responding to a hello.',

  validate: async (): Promise<boolean> => true,

  handler: async (
    _runtime: IAgentRuntime,
    _message: Memory,
    _state: State | undefined,
    _options: Record<string, unknown>,
    callback: HandlerCallback
  ): Promise<void> => {
    sendGreeting()
    sendCameraMode('upper-body')
    callback({ text: '[hologram] Greeting animation triggered', action: 'TAOBOT_GREET' })
  },

  examples: [
    [
      { user: 'user', content: { text: 'Hi TaoBot!' } },
      { user: 'TaoBot', content: { text: 'Hey there, welcome!', action: 'TAOBOT_GREET' } },
    ],
  ],
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const taobotEmoteActions: Action[] = [
  emoteAction,
  speakStartAction,
  speakStopAction,
  greetAction,
]

export {
  emoteAction,
  speakStartAction,
  speakStopAction,
  greetAction,
}
