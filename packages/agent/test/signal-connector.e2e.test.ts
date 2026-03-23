/**
 * Signal Connector E2E Tests
 *
 * Tests for @elizaos/plugin-signal as outlined in GitHub Issue #148.
 *
 * Prerequisites:
 * - signal-cli installed and configured
 * - Signal account registered (phone number verified)
 * - Either signal-cli REST API running or signal-cli binary in PATH
 *
 * Environment variables:
 * - SIGNAL_ACCOUNT_NUMBER: Signal account phone number (E.164 format, e.g., +1234567890)
 * - SIGNAL_HTTP_URL: Signal CLI REST API URL (e.g., http://localhost:8080)
 * - SIGNAL_CLI_PATH: Path to signal-cli binary (alternative to HTTP API)
 * - ELIZA_LIVE_TEST=1: Enable live tests (ELIZA_LIVE_TEST also supported)
 *
 * @see https://github.com/elizaos/eliza/issues/148
 */

import { describe, expect, it } from "vitest";

const signalPluginModule = await import("@elizaos/plugin-signal").catch(
  () => null,
);
const signalPlugin = signalPluginModule?.default;
const hasSignalPlugin = Boolean(signalPlugin);

describe("Signal Connector (@elizaos/plugin-signal)", () => {
  describe.skipIf(!hasSignalPlugin)("Plugin Structure", () => {
    it("plugin can be imported", () => {
      expect(signalPluginModule).toBeDefined();
      expect(signalPlugin).toBeDefined();
    });

    it("plugin has required properties", () => {
      const plugin = signalPlugin;
      expect(plugin.name).toBe("signal");
      expect(plugin.description).toBeDefined();
    });

    it("plugin exports actions", () => {
      const plugin = signalPlugin;
      expect(plugin.actions).toBeDefined();
      expect(Array.isArray(plugin.actions)).toBe(true);

      // Expected actions based on source code analysis
      const actionNames =
        plugin.actions?.map((a: { name: string }) => a.name) ?? [];
      expect(actionNames).toContain("SIGNAL_LIST_CONTACTS");
      expect(actionNames).toContain("SIGNAL_LIST_GROUPS");
      expect(actionNames).toContain("SIGNAL_SEND_MESSAGE");
      expect(actionNames).toContain("SIGNAL_SEND_REACTION");
    });

    it("plugin exports providers", () => {
      const plugin = signalPlugin;
      expect(plugin.providers).toBeDefined();
      expect(Array.isArray(plugin.providers)).toBe(true);

      const providerNames =
        plugin.providers?.map((p: { name: string }) => p.name) ?? [];
      expect(providerNames).toContain("signalConversationState");
    });

    it("plugin exports services", () => {
      const plugin = signalPlugin;
      expect(plugin.services).toBeDefined();
      expect(Array.isArray(plugin.services)).toBe(true);
      expect(plugin.services?.length).toBeGreaterThan(0);
    });
  });

});
