"""Core Capabilities module.

Provides trust, secrets manager, and plugin manager capabilities that can
be conditionally enabled via ``CapabilityConfig`` in
``elizaos.basic_capabilities_compat``.

Each sub-module is a self-contained Python port of the corresponding
TypeScript plugin:

- **trust** -- multi-dimensional trust scoring, security threat detection
  (from ``plugin-trust``)
- **secrets** -- multi-level secret management with AES-256-GCM encryption
  (from ``plugin-secrets-manager``)
- **plugin_manager** -- read-only plugin discovery and status introspection
  (from ``plugin-plugin-manager``)
"""

from .plugin_manager import (
    PluginManagerService,
    core_status_action,
    plugin_manager_actions,
    plugin_manager_providers,
    plugin_state_provider,
    search_plugin_action,
)
from .secrets import (
    KeyManager,
    SecretsService,
    manage_secret_action,
    secrets_actions,
    secrets_providers,
    secrets_status_provider,
    set_secret_action,
)
from .trust import (
    SecurityModuleService,
    TrustEngineService,
    evaluate_trust_action,
    record_interaction_action,
    security_evaluator,
    security_status_provider,
    trust_actions,
    trust_change_evaluator,
    trust_evaluators,
    trust_profile_provider,
    trust_providers,
)

# Aggregate lists for use by basic_capabilities_compat
core_capability_actions = trust_actions + secrets_actions + plugin_manager_actions
core_capability_providers = trust_providers + secrets_providers + plugin_manager_providers
core_capability_evaluators = trust_evaluators
core_capability_services: list[type] = [
    TrustEngineService,
    SecurityModuleService,
    SecretsService,
    PluginManagerService,
]

__all__ = [
    # Aggregate lists
    "core_capability_actions",
    "core_capability_providers",
    "core_capability_evaluators",
    "core_capability_services",
    # Trust
    "TrustEngineService",
    "SecurityModuleService",
    "trust_actions",
    "evaluate_trust_action",
    "record_interaction_action",
    "trust_providers",
    "trust_profile_provider",
    "security_status_provider",
    "trust_evaluators",
    "security_evaluator",
    "trust_change_evaluator",
    # Secrets
    "SecretsService",
    "KeyManager",
    "secrets_actions",
    "set_secret_action",
    "manage_secret_action",
    "secrets_providers",
    "secrets_status_provider",
    # Plugin Manager
    "PluginManagerService",
    "plugin_manager_actions",
    "core_status_action",
    "search_plugin_action",
    "plugin_manager_providers",
    "plugin_state_provider",
]
