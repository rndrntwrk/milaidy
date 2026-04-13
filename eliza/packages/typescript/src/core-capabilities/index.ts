/**
 * Core Capabilities — Infrastructure services that are independently gated.
 *
 * Unlike advanced-capabilities (gated by `advancedCapabilities: true`),
 * these are enabled via their own flags:
 * - `enableTrust: true` / `ENABLE_TRUST` — trust engine, security, permissions
 * - `enableSecretsManager: true` / `ENABLE_SECRETS_MANAGER` — encrypted secrets, plugin activation
 * - `enablePluginManager: true` / `ENABLE_PLUGIN_MANAGER` — plugin introspection, install/eject
 */

import type { Action, Evaluator, Provider } from "../types/index.ts";
import type { ServiceClass } from "../types/plugin.ts";
import type { IAgentRuntime } from "../types/runtime.ts";

// ─── Trust ────────────────────────────────────────────────────────────────────

const trustCapability = {
	get providers(): Provider[] {
		// Lazy import to avoid pulling trust code when not enabled
		return [];
	},
	get actions(): Action[] {
		return [];
	},
	get evaluators(): Evaluator[] {
		return [];
	},
	get services(): ServiceClass[] {
		return [
			{
				serviceType: "trust-engine",
				start: async (runtime: IAgentRuntime) => {
					const mod = await import("./trust/index.ts");
					return mod.TrustEngineServiceWrapper.start(runtime);
				},
			} as unknown as ServiceClass,
			{
				serviceType: "security-module",
				start: async (runtime: IAgentRuntime) => {
					const mod = await import("./trust/index.ts");
					return mod.SecurityModuleServiceWrapper.start(runtime);
				},
			} as unknown as ServiceClass,
			{
				serviceType: "credential-protector",
				start: async (runtime: IAgentRuntime) => {
					const mod = await import("./trust/index.ts");
					return mod.CredentialProtectorServiceWrapper.start(runtime);
				},
			} as unknown as ServiceClass,
			{
				serviceType: "contextual-permissions",
				start: async (runtime: IAgentRuntime) => {
					const mod = await import("./trust/index.ts");
					return mod.ContextualPermissionSystemServiceWrapper.start(runtime);
				},
			} as unknown as ServiceClass,
		];
	},
	async init(runtime: IAgentRuntime): Promise<void> {
		const { ensureAdminRoleOnInit } = await import("./trust/index.ts");
		await ensureAdminRoleOnInit(runtime);
	},
};

// ─── Secrets Manager ──────────────────────────────────────────────────────────

const secretsCapability = {
	get providers(): Provider[] {
		return [];
	},
	get actions(): Action[] {
		return [];
	},
	get services(): ServiceClass[] {
		return [
			{
				serviceType: "SECRETS",
				start: async (runtime: IAgentRuntime) => {
					const { SecretsService } = await import(
						"./secrets/services/secrets.ts"
					);
					return SecretsService.start(runtime);
				},
			} as unknown as ServiceClass,
			{
				serviceType: "PLUGIN_ACTIVATOR",
				start: async (runtime: IAgentRuntime) => {
					const { PluginActivatorService } = await import(
						"./secrets/services/plugin-activator.ts"
					);
					return PluginActivatorService.start(runtime);
				},
			} as unknown as ServiceClass,
			{
				serviceType: "ONBOARDING",
				start: async (runtime: IAgentRuntime) => {
					const { OnboardingService } = await import(
						"./secrets/onboarding/service.ts"
					);
					return OnboardingService.start(runtime);
				},
			} as unknown as ServiceClass,
		];
	},
};

// ─── Plugin Manager ───────────────────────────────────────────────────────────

const pluginManagerCapability = {
	get providers(): Provider[] {
		return [];
	},
	get actions(): Action[] {
		return [];
	},
	get services(): ServiceClass[] {
		return [
			{
				serviceType: "plugin_manager",
				start: async (runtime: IAgentRuntime) => {
					const { PluginManagerService } = await import(
						"./plugin-manager/services/pluginManagerService.ts"
					);
					return PluginManagerService.start(runtime);
				},
			} as unknown as ServiceClass,
			{
				serviceType: "core_manager",
				start: async (runtime: IAgentRuntime) => {
					const { CoreManagerService } = await import(
						"./plugin-manager/services/coreManagerService.ts"
					);
					return CoreManagerService.start(runtime);
				},
			} as unknown as ServiceClass,
		];
	},
};

// ─── Exports ──────────────────────────────────────────────────────────────────

export { trustCapability, secretsCapability, pluginManagerCapability };

export const coreCapabilities = {
	trust: trustCapability,
	secretsManager: secretsCapability,
	pluginManager: pluginManagerCapability,
};

export default coreCapabilities;
