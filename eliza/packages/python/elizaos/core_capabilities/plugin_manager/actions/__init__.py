"""Plugin manager actions."""

from .core_status import core_status_action
from .search_plugin import search_plugin_action

plugin_manager_actions = [core_status_action, search_plugin_action]

__all__ = [
    "core_status_action",
    "search_plugin_action",
    "plugin_manager_actions",
]
