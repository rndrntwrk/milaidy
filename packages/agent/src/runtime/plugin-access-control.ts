import type {
  Action,
  ActionResult,
  IAgentRuntime,
  Memory,
  Plugin,
  Provider,
  ProviderResult,
  State,
} from "@elizaos/core";
import { checkSenderRole } from "@miladyai/plugin-roles";

const EMPTY_PROVIDER_RESULT: ProviderResult = {
  text: "",
  values: {},
  data: {},
};

type PluginModuleLike = Record<string, unknown> & {
  default?: Plugin;
  plugin?: Plugin;
};

type ServiceClass = NonNullable<Plugin["services"]>[number];

async function hasAdminPluginAccess(
  runtime: IAgentRuntime,
  message: Memory,
): Promise<boolean> {
  if (
    typeof message.entityId === "string" &&
    message.entityId === runtime.agentId
  ) {
    return true;
  }
  const role = await checkSenderRole(runtime, message);
  return Boolean(role?.isAdmin);
}

function wrapProviderForAdminOnly(
  pluginName: string,
  provider: Provider,
): Provider {
  return {
    ...provider,
    async get(
      runtime: IAgentRuntime,
      message: Memory,
      state: State,
    ): Promise<ProviderResult> {
      if (!(await hasAdminPluginAccess(runtime, message))) {
        runtime.logger?.debug?.(
          `[runtime] blocked provider ${provider.name} from ${pluginName} for non-admin entity`,
        );
        return EMPTY_PROVIDER_RESULT;
      }
      return provider.get(runtime, message, state);
    },
  };
}

function wrapActionForAdminOnly(pluginName: string, action: Action): Action {
  return {
    ...action,
    async validate(
      runtime: IAgentRuntime,
      message: Memory,
      state?: State,
    ): Promise<boolean> {
      if (!(await hasAdminPluginAccess(runtime, message))) {
        return false;
      }
      return action.validate(runtime, message, state);
    },
    async handler(
      runtime,
      message,
      state,
      options,
      callback,
      responses,
    ): Promise<ActionResult | undefined> {
      if (!(await hasAdminPluginAccess(runtime, message))) {
        const text = `${pluginName} is restricted to the owner/admin and the agent`;
        runtime.logger?.warn?.(
          `[runtime] blocked action ${action.name} from ${pluginName} for non-admin entity`,
        );
        return {
          success: false,
          text,
          data: {
            plugin: pluginName,
            action: action.name,
            reason: "admin_only",
          },
        };
      }
      return action.handler(
        runtime,
        message,
        state,
        options,
        callback,
        responses,
      );
    },
  };
}

export function wrapPluginForAdminOnly(
  pluginName: string,
  plugin: Plugin,
): Plugin {
  return {
    ...plugin,
    actions: plugin.actions?.map((action) =>
      wrapActionForAdminOnly(pluginName, action),
    ),
    providers: plugin.providers?.map((provider) =>
      wrapProviderForAdminOnly(pluginName, provider),
    ),
  };
}

function matchesServiceClass(
  serviceClass: ServiceClass,
  serviceType: string,
): boolean {
  return (
    serviceClass.serviceType === serviceType || serviceClass.name === serviceType
  );
}

export function stripPluginServiceTypes(
  plugin: Plugin,
  serviceTypes: readonly string[],
): Plugin {
  if (!plugin.services || plugin.services.length === 0) {
    return plugin;
  }
  return {
    ...plugin,
    services: plugin.services.filter(
      (serviceClass) =>
        !serviceTypes.some((serviceType) =>
          matchesServiceClass(serviceClass, serviceType),
        ),
    ),
  };
}

export function patchPluginModuleForAdminOnly<T extends PluginModuleLike>(
  module: T,
  pluginName: string,
  options: {
    stripServiceTypes?: readonly string[];
  } = {},
): T {
  const patchPlugin = (plugin: Plugin | undefined): Plugin | undefined => {
    if (!plugin) {
      return plugin;
    }
    const adminOnly = wrapPluginForAdminOnly(pluginName, plugin);
    return options.stripServiceTypes
      ? stripPluginServiceTypes(adminOnly, options.stripServiceTypes)
      : adminOnly;
  };

  const hasDefault = Object.prototype.hasOwnProperty.call(module, "default");
  const hasPlugin = Object.prototype.hasOwnProperty.call(module, "plugin");
  return {
    ...module,
    ...(hasDefault
      ? { default: patchPlugin((module as { default?: Plugin }).default) }
      : {}),
    ...(hasPlugin
      ? { plugin: patchPlugin((module as { plugin?: Plugin }).plugin) }
      : {}),
  };
}
