"""Hook result types and contexts for the x402 Python SDK.

Shared hook types used by x402Client, x402ResourceServer, and x402Facilitator.
"""

from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .payments import PaymentPayload, PaymentRequired, PaymentRequirements
    from .responses import SettleResponse, VerifyResponse
    from .v1 import PaymentPayloadV1, PaymentRequiredV1, PaymentRequirementsV1


# ============================================================================
# Hook Result Types
# ============================================================================


@dataclass
class AbortResult:
    """Return from before hook to abort the operation.

    Attributes:
        reason: Human-readable reason for aborting.
    """

    reason: str


@dataclass
class RecoveredPayloadResult:
    """Return from client failure hook to recover with a payload.

    Attributes:
        payload: The recovered payment payload.
    """

    payload: "PaymentPayload | PaymentPayloadV1"


@dataclass
class RecoveredVerifyResult:
    """Return from verify failure hook to recover with a result.

    Attributes:
        result: The recovered verify response.
    """

    result: "VerifyResponse"


@dataclass
class RecoveredSettleResult:
    """Return from settle failure hook to recover with a result.

    Attributes:
        result: The recovered settle response.
    """

    result: "SettleResponse"


# ============================================================================
# Verify Hook Contexts
# ============================================================================


@dataclass
class VerifyContext:
    """Context for verify hooks.

    Attributes:
        payment_payload: The payment payload being verified.
        requirements: The requirements being verified against.
        payload_bytes: Raw payload bytes (escape hatch for extensions).
        requirements_bytes: Raw requirements bytes (escape hatch for extensions).
    """

    payment_payload: "PaymentPayload | PaymentPayloadV1"
    requirements: "PaymentRequirements | PaymentRequirementsV1"
    payload_bytes: bytes | None = None
    requirements_bytes: bytes | None = None


@dataclass
class VerifyResultContext(VerifyContext):
    """Context for after-verify hooks.

    Attributes:
        result: The verification result.
    """

    result: "VerifyResponse" = None  # type: ignore[assignment]

    def __post_init__(self) -> None:
        if self.result is None:
            raise ValueError("result is required for VerifyResultContext")


@dataclass
class VerifyFailureContext(VerifyContext):
    """Context for verify failure hooks.

    Attributes:
        error: The exception that caused the failure.
    """

    error: Exception = None  # type: ignore[assignment]

    def __post_init__(self) -> None:
        if self.error is None:
            raise ValueError("error is required for VerifyFailureContext")


# ============================================================================
# Settle Hook Contexts
# ============================================================================


@dataclass
class SettleContext:
    """Context for settle hooks.

    Attributes:
        payment_payload: The payment payload being settled.
        requirements: The requirements for settlement.
        payload_bytes: Raw payload bytes (escape hatch for extensions).
        requirements_bytes: Raw requirements bytes (escape hatch for extensions).
    """

    payment_payload: "PaymentPayload | PaymentPayloadV1"
    requirements: "PaymentRequirements | PaymentRequirementsV1"
    payload_bytes: bytes | None = None
    requirements_bytes: bytes | None = None


@dataclass
class SettleResultContext(SettleContext):
    """Context for after-settle hooks.

    Attributes:
        result: The settlement result.
    """

    result: "SettleResponse" = None  # type: ignore[assignment]

    def __post_init__(self) -> None:
        if self.result is None:
            raise ValueError("result is required for SettleResultContext")


@dataclass
class SettleFailureContext(SettleContext):
    """Context for settle failure hooks.

    Attributes:
        error: The exception that caused the failure.
    """

    error: Exception = None  # type: ignore[assignment]

    def __post_init__(self) -> None:
        if self.error is None:
            raise ValueError("error is required for SettleFailureContext")


# ============================================================================
# Payment Creation Hook Contexts (for x402Client)
# ============================================================================


@dataclass
class PaymentCreationContext:
    """Context for payment creation hooks.

    Attributes:
        payment_required: The 402 response from the server.
        selected_requirements: The selected payment requirements.
    """

    payment_required: "PaymentRequired | PaymentRequiredV1"
    selected_requirements: "PaymentRequirements | PaymentRequirementsV1"


@dataclass
class PaymentCreatedContext(PaymentCreationContext):
    """Context for after-payment-creation hooks.

    Attributes:
        payment_payload: The created payment payload.
    """

    payment_payload: "PaymentPayload | PaymentPayloadV1" = None  # type: ignore[assignment]

    def __post_init__(self) -> None:
        if self.payment_payload is None:
            raise ValueError("payment_payload is required for PaymentCreatedContext")


@dataclass
class PaymentCreationFailureContext(PaymentCreationContext):
    """Context for payment creation failure hooks.

    Attributes:
        error: The exception that caused the failure.
    """

    error: Exception = None  # type: ignore[assignment]

    def __post_init__(self) -> None:
        if self.error is None:
            raise ValueError("error is required for PaymentCreationFailureContext")
