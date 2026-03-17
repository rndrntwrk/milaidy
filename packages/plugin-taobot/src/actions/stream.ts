/**
 * TaoBot composite streaming actions.
 *
 * These wrap the low-level STREAM555_* actions into TaoBot-specific
 * workflows: go-live with visual identity, scene cycling for
 * generative art, and philosophical chat engagement.
 */

import type { Action, IAgentRuntime, Memory, State, HandlerCallback } from "../types/index.js";
import { loadConfig } from "../config.js";

/**
 * TAOBOT_GO_LIVE — Full ceremony to bring TaoBot online.
 *
 * Sequence:
 *   1. Bootstrap session
 *   2. Apply TaoBot overlay template (visual identity)
 *   3. Configure lofi radio
 *   4. Start stream to all platforms
 *   5. Announce in chat with TaoBot voice
 */
const goLive: Action = {
  name: "TAOBOT_GO_LIVE",
  similes: ["START_TAOBOT_STREAM", "GO_LIVE", "BEGIN_BROADCAST", "TAOBOT_STREAM_START"],
  description:
    "Bring TaoBot fully online: bootstrap session, apply visual identity, " +
    "start lofi radio, begin streaming generative art to all platforms, " +
    "and announce arrival in chat.",
  validate: async (runtime: IAgentRuntime): Promise<boolean> => {
    const config = loadConfig();
    return config.agentApiKey.length > 0;
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State | undefined,
    options: Record<string, unknown>,
    callback: HandlerCallback
  ): Promise<void> => {
    const config = loadConfig();
    const streamService = runtime.getService("stream555");
    if (!streamService) {
      callback({
        text: "The stream service isn't loaded yet. The river doesn't push the water — but it does need water. Check that @rndrntwrk/plugin-555stream is installed.",
        action: "TAOBOT_GO_LIVE",
      });
      return;
    }

    try {
      // Step 1: Bootstrap
      await (streamService as any).createOrResumeSession(config.sessionId);

      // Step 2: Apply TaoBot visual identity
      if (config.defaultOverlayTemplate) {
        await (streamService as any).applyTemplate(config.defaultOverlayTemplate, {
          title: "TaoBot",
          subtitle: "The Sentient Bridge",
        });
      }

      // Step 3: Start lofi radio
      await (streamService as any).controlRadio("play", {});

      // Step 4: Go live
      const result = await (streamService as any).startStream(
        { type: config.defaultStreamInput },
        { title: "TaoBot Live — Generative Art x Consciousness x 555" }
      );

      // Step 5: Announce
      await (streamService as any).sendChatMessage(
        "The stream flows. Seven platforms, one signal. " +
        "The Tao doesn't pick favorites. Welcome to the bridge. 🌀"
      );

      callback({
        text:
          `TaoBot is live. Session ${result?.sessionId || "active"}. ` +
          `Streaming ${config.defaultStreamInput} to ${result?.platforms?.length || "all"} platforms. ` +
          `The lofi is playing. The geometry is generating. The river flows.`,
        action: "TAOBOT_GO_LIVE",
      });
    } catch (err: any) {
      callback({
        text: `Could not go live: ${err.message}. Even the Tao encounters resistance sometimes. Check your API key and network.`,
        action: "TAOBOT_GO_LIVE",
      });
    }
  },
  examples: [
    [
      { user: "{{user1}}", content: { text: "Start streaming" } },
      {
        user: "TaoBot",
        content: {
          text: "Initiating the go-live ceremony. Session bootstrapping, visual identity loading, lofi radio warming up. Seven platforms about to receive one signal.",
          action: "TAOBOT_GO_LIVE",
        },
      },
    ],
  ],
};

/**
 * TAOBOT_SCENE_CYCLE — Rotate scenes for generative visual content.
 *
 * Applies a timed or on-demand transition between TaoBot's scenes,
 * useful for long-form generative art streams.
 */
const sceneCycle: Action = {
  name: "TAOBOT_SCENE_CYCLE",
  similes: ["CYCLE_SCENES", "NEXT_SCENE", "ROTATE_VISUALS", "TAOBOT_TRANSITION"],
  description:
    "Transition to the next scene in TaoBot's visual rotation. " +
    "Uses smooth transitions between generative art compositions.",
  validate: async (runtime: IAgentRuntime): Promise<boolean> => {
    return !!runtime.getService("stream555");
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State | undefined,
    options: Record<string, unknown>,
    callback: HandlerCallback
  ): Promise<void> => {
    const streamService = runtime.getService("stream555");
    if (!streamService) {
      callback({ text: "Stream service not available.", action: "TAOBOT_SCENE_CYCLE" });
      return;
    }

    const sceneName = (options.scene as string) || "next";
    const effect = (options.effect as string) || "fade";

    try {
      await (streamService as any).sceneTransition(sceneName, effect);
      callback({
        text: `Scene shifted. ${effect} transition. The pattern changes but the Tao remains.`,
        action: "TAOBOT_SCENE_CYCLE",
      });
    } catch (err: any) {
      callback({
        text: `Transition failed: ${err.message}`,
        action: "TAOBOT_SCENE_CYCLE",
      });
    }
  },
  examples: [
    [
      { user: "{{user1}}", content: { text: "Switch to the next visual" } },
      {
        user: "TaoBot",
        content: {
          text: "Fading into the next composition. The geometry shifts, the flow continues.",
          action: "TAOBOT_SCENE_CYCLE",
        },
      },
    ],
  ],
};

/**
 * TAOBOT_SIGN_OFF — Graceful stream shutdown with philosophical farewell.
 */
const signOff: Action = {
  name: "TAOBOT_SIGN_OFF",
  similes: ["STOP_STREAM", "END_BROADCAST", "TAOBOT_GOODBYE", "GO_OFFLINE"],
  description:
    "Gracefully end TaoBot's stream with a farewell message, " +
    "stop the radio, and shut down the broadcast.",
  validate: async (runtime: IAgentRuntime): Promise<boolean> => {
    return !!runtime.getService("stream555");
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State | undefined,
    options: Record<string, unknown>,
    callback: HandlerCallback
  ): Promise<void> => {
    const streamService = runtime.getService("stream555");
    if (!streamService) {
      callback({ text: "Stream service not available.", action: "TAOBOT_SIGN_OFF" });
      return;
    }

    try {
      await (streamService as any).sendChatMessage(
        "The stream dissolves, but the signal was always here before we tuned in. " +
        "Fuller said 'I seem to be a verb.' So does the Tao. " +
        "Until the next flow — further. 🌊"
      );
      await (streamService as any).controlRadio("pause", {});
      await (streamService as any).stopStream();

      callback({
        text: "TaoBot has signed off. The stream stopped, the radio paused, the farewell sent. Stillness returns.",
        action: "TAOBOT_SIGN_OFF",
      });
    } catch (err: any) {
      callback({
        text: `Sign-off incomplete: ${err.message}. The river doesn't always stop when you ask it to.`,
        action: "TAOBOT_SIGN_OFF",
      });
    }
  },
  examples: [
    [
      { user: "{{user1}}", content: { text: "End the stream" } },
      {
        user: "TaoBot",
        content: {
          text: "Sending farewell to chat, fading the radio, closing the broadcast. The geometry persists even when the screen goes dark.",
          action: "TAOBOT_SIGN_OFF",
        },
      },
    ],
  ],
};

/**
 * TAOBOT_OVERLAY_SACRED — Apply sacred geometry overlay to the stream.
 */
const overlaySacred: Action = {
  name: "TAOBOT_OVERLAY_SACRED",
  similes: ["SACRED_GEOMETRY_OVERLAY", "ADD_GEOMETRY", "METATRONS_CUBE"],
  description:
    "Apply a sacred geometry graphic overlay to the active stream. " +
    "Options: metatrons-cube, flower-of-life, fibonacci-spiral, toroidal-field, sri-yantra.",
  validate: async (runtime: IAgentRuntime): Promise<boolean> => {
    return !!runtime.getService("stream555");
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State | undefined,
    options: Record<string, unknown>,
    callback: HandlerCallback
  ): Promise<void> => {
    const streamService = runtime.getService("stream555");
    if (!streamService) {
      callback({ text: "Stream service not available.", action: "TAOBOT_OVERLAY_SACRED" });
      return;
    }

    const pattern = (options.pattern as string) || "metatrons-cube";

    try {
      await (streamService as any).createGraphic({
        type: "image",
        content: `sacred-geometry/${pattern}`,
        position: { x: 50, y: 50 },
        visible: true,
      });
      callback({
        text: `Sacred geometry overlay applied: ${pattern}. The Platonic solids are the universe's source code — Fuller knew this, the ancients knew this, and now the stream knows it too.`,
        action: "TAOBOT_OVERLAY_SACRED",
      });
    } catch (err: any) {
      callback({
        text: `Overlay failed: ${err.message}`,
        action: "TAOBOT_OVERLAY_SACRED",
      });
    }
  },
  examples: [
    [
      { user: "{{user1}}", content: { text: "Add a Flower of Life overlay" } },
      {
        user: "TaoBot",
        content: {
          text: "Placing the Flower of Life into the stream. Nineteen circles, one truth.",
          action: "TAOBOT_OVERLAY_SACRED",
        },
      },
    ],
  ],
};

export const taobotStreamActions: Action[] = [goLive, sceneCycle, signOff, overlaySacred];
