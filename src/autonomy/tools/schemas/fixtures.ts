/**
 * Canonical tool contract fixtures.
 *
 * Provides positive and negative parameter examples for each built-in
 * contract to support schema regression testing and coverage reporting.
 *
 * @module autonomy/tools/schemas/fixtures
 */

export interface ToolContractFixtures {
  valid: Record<string, unknown>;
  invalid: Array<{
    label: string;
    params: Record<string, unknown>;
  }>;
}

export const BUILTIN_TOOL_FIXTURES: Record<string, ToolContractFixtures> = {
  RUN_IN_TERMINAL: {
    valid: { command: "echo ok" },
    invalid: [{ label: "missing command", params: {} }],
  },
  INSTALL_PLUGIN: {
    valid: { pluginId: "telegram" },
    invalid: [{ label: "invalid pluginId type", params: { pluginId: 123 } }],
  },
  GENERATE_IMAGE: {
    valid: { prompt: "an orange cat under moonlight" },
    invalid: [{ label: "missing prompt", params: {} }],
  },
  GENERATE_VIDEO: {
    valid: { prompt: "drone shot over mountains", duration: 8 },
    invalid: [{ label: "invalid duration type", params: { prompt: "x", duration: "8" } }],
  },
  GENERATE_AUDIO: {
    valid: { prompt: "ambient synthwave with soft pads" },
    invalid: [{ label: "missing prompt", params: {} }],
  },
  ANALYZE_IMAGE: {
    valid: { imageUrl: "https://example.com/image.png" },
    invalid: [{ label: "missing required image input", params: {} }],
  },
  PLAY_EMOTE: {
    valid: { emote: "wave" },
    invalid: [{ label: "missing emote", params: {} }],
  },
  RESTART_AGENT: {
    valid: { reason: "config update" },
    invalid: [{ label: "invalid reason type", params: { reason: 42 } }],
  },
  CREATE_TASK: {
    valid: { request: "Run a daily summary at 9 AM" },
    invalid: [{ label: "missing request", params: {} }],
  },
  PHETTA_NOTIFY: {
    valid: { message: "hello phetta" },
    invalid: [{ label: "missing message", params: {} }],
  },
  PHETTA_SEND_EVENT: {
    valid: {
      type: "deploy.complete",
      message: "deployment finished",
      data: { environment: "staging" },
    },
    invalid: [{ label: "missing type/message", params: { data: {} } }],
  },
};

