"""Plugin manager sub-module.

Read-only plugin discovery and plugin/core status introspection.
Ported from plugin-plugin-manager TypeScript.
"""

from .actions import core_status_action, plugin_manager_actions, search_plugin_action
from .providers import plugin_manager_providers, plugin_state_provider
from .service import PluginManagerService
from .types import (
    ComponentRegistration,
    InstallProgress,
    InstallResult,
    PROTECTED_PLUGINS,
    PluginComponents,
    PluginManagerConfig,
    PluginMetadata,
    PluginState,
    PluginStatus,
    UninstallResult,
)

__all__ = [
    # Service
    "PluginManagerService",
    # Actions
    "plugin_manager_actions",
    "core_status_action",
    "search_plugin_action",
    # Providers
    "plugin_manager_providers",
    "plugin_state_provider",
    # Types
    "PluginStatus",
    "PluginState",
    "PluginComponents",
    "ComponentRegistration",
    "PluginMetadata",
    "PluginManagerConfig",
    "InstallProgress",
    "InstallResult",
    "UninstallResult",
    "PROTECTED_PLUGINS",
]
