"""Trust sub-module.

Multi-dimensional trust scoring, evidence-based evaluation, and security
threat detection, ported from plugin-trust TypeScript.
"""

from .actions import evaluate_trust_action, record_interaction_action, trust_actions
from .evaluators import security_evaluator, trust_change_evaluator, trust_evaluators
from .providers import security_status_provider, trust_profile_provider, trust_providers
from .service import SecurityModuleService, TrustEngineService
from .types import (
    PermissionContext,
    SecurityAction,
    SecurityActionResponse,
    SecurityCheck,
    SecurityCheckType,
    SecurityContext,
    SecurityEvent,
    SecurityEventType,
    SecurityMessage,
    SecuritySeverity,
    ThreatAssessment,
    TrustCalculationConfig,
    TrustContext,
    TrustDecision,
    TrustDimensions,
    TrustEvidence,
    TrustEvidenceType,
    TrustInteraction,
    TrustProfile,
    TrustRequirements,
    TrustTrend,
    TrustTrendDirection,
)

__all__ = [
    # Services
    "TrustEngineService",
    "SecurityModuleService",
    # Actions
    "trust_actions",
    "evaluate_trust_action",
    "record_interaction_action",
    # Providers
    "trust_providers",
    "trust_profile_provider",
    "security_status_provider",
    # Evaluators
    "trust_evaluators",
    "security_evaluator",
    "trust_change_evaluator",
    # Types
    "TrustDimensions",
    "TrustEvidenceType",
    "TrustEvidence",
    "TrustProfile",
    "TrustContext",
    "TrustDecision",
    "TrustRequirements",
    "TrustInteraction",
    "TrustCalculationConfig",
    "TrustTrend",
    "TrustTrendDirection",
    "SecurityEventType",
    "SecurityCheckType",
    "SecuritySeverity",
    "SecurityActionResponse",
    "PermissionContext",
    "SecurityContext",
    "SecurityCheck",
    "ThreatAssessment",
    "SecurityEvent",
    "SecurityMessage",
    "SecurityAction",
]
