"""Plugin manager providers."""

from .plugin_state import plugin_state_provider

plugin_manager_providers = [plugin_state_provider]

__all__ = [
    "plugin_state_provider",
    "plugin_manager_providers",
]
