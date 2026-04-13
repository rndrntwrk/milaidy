"""Secrets sub-module.

Multi-level secret management with encryption, access control, and change
notification support.  Ported from plugin-secrets-manager TypeScript.
"""

from .actions import manage_secret_action, secrets_actions, set_secret_action
from .crypto import (
    KeyManager,
    decrypt,
    decrypt_gcm,
    derive_key_from_agent_id,
    derive_key_pbkdf2,
    encrypt,
    encrypt_gcm,
    generate_key,
    generate_salt,
    generate_secure_token,
    hash_value,
    is_encrypted_secret,
    secure_compare,
)
from .providers import secrets_providers, secrets_status_provider
from .service import SecretsService
from .storage import (
    CharacterSettingsStorage,
    ComponentSecretStorage,
    CompositeSecretStorage,
    WorldMetadataStorage,
)
from .types import (
    EncryptedSecret,
    EncryptionError,
    KeyDerivationParams,
    PermissionDeniedError,
    PluginRequirementStatus,
    PluginSecretRequirement,
    SecretAccessLog,
    SecretChangeCallback,
    SecretChangeEvent,
    SecretConfig,
    SecretContext,
    SecretLevel,
    SecretMetadata,
    SecretNotFoundError,
    SecretPermission,
    SecretPermissionType,
    SecretStatus,
    SecretType,
    SecretsError,
    SecretsServiceConfig,
    StorageBackend,
    ValidationResult,
    ValidationStrategy,
)

__all__ = [
    # Service
    "SecretsService",
    # Actions
    "secrets_actions",
    "set_secret_action",
    "manage_secret_action",
    # Providers
    "secrets_providers",
    "secrets_status_provider",
    # Crypto
    "KeyManager",
    "encrypt",
    "encrypt_gcm",
    "decrypt",
    "decrypt_gcm",
    "derive_key_pbkdf2",
    "derive_key_from_agent_id",
    "generate_key",
    "generate_salt",
    "generate_secure_token",
    "hash_value",
    "is_encrypted_secret",
    "secure_compare",
    # Storage
    "CharacterSettingsStorage",
    "WorldMetadataStorage",
    "ComponentSecretStorage",
    "CompositeSecretStorage",
    # Types
    "SecretLevel",
    "SecretType",
    "SecretStatus",
    "SecretPermissionType",
    "ValidationStrategy",
    "StorageBackend",
    "SecretConfig",
    "SecretPermission",
    "SecretContext",
    "SecretAccessLog",
    "EncryptedSecret",
    "KeyDerivationParams",
    "PluginSecretRequirement",
    "PluginRequirementStatus",
    "SecretsServiceConfig",
    "SecretChangeEvent",
    "SecretChangeCallback",
    "SecretMetadata",
    "ValidationResult",
    "SecretsError",
    "PermissionDeniedError",
    "SecretNotFoundError",
    "EncryptionError",
]
