"""x402 Python SDK - Payment protocol implementation.

This SDK provides client-side, server-side, and facilitator components
for implementing the x402 payment protocol.

Quick Start:
    ```python
    from x402 import x402Client, x402ResourceServer, x402Facilitator

    # Client-side: Create payment payloads
    client = x402Client()
    client.register("eip155:8453", ExactEvmScheme(signer=my_signer))
    payload = client.create_payment_payload(payment_required)

    # Server-side: Protect resources
    server = x402ResourceServer(facilitator_client)
    server.register("eip155:8453", ExactEvmServerScheme())
    server.initialize()
    requirements = server.build_payment_requirements(config)

    # Facilitator: Verify and settle payments
    facilitator = x402Facilitator()
    facilitator.register(["eip155:8453"], ExactEvmFacilitatorScheme(wallet))
    result = facilitator.verify(payload, requirements)
    ```
"""

# Core components
from .client import (
    x402Client,
    default_payment_selector,
    max_amount,
    prefer_network,
    prefer_scheme,
)
from .facilitator import x402Facilitator
from .server import FacilitatorClient, x402ResourceServer

# Interfaces (for implementing custom schemes)
from .interfaces import (
    SchemeNetworkClient,
    SchemeNetworkClientV1,
    SchemeNetworkFacilitator,
    SchemeNetworkFacilitatorV1,
    SchemeNetworkServer,
)

# Types (re-export commonly used types)
from .schemas import (
    # Base
    X402_VERSION,
    AssetAmount,
    Money,
    Network,
    Price,
    # V2 Payments
    PaymentPayload,
    PaymentRequired,
    PaymentRequirements,
    ResourceInfo,
    # V1 Legacy
    PaymentPayloadV1,
    PaymentRequiredV1,
    PaymentRequirementsV1,
    # Responses
    SettleResponse,
    SupportedKind,
    SupportedResponse,
    VerifyResponse,
    # Config
    FacilitatorConfig,
    PaywallConfig,
    ResourceConfig,
    RoutesConfig,
    # Hooks
    AbortResult,
    PaymentCreatedContext,
    PaymentCreationContext,
    PaymentCreationFailureContext,
    RecoveredPayloadResult,
    RecoveredSettleResult,
    RecoveredVerifyResult,
    SettleContext,
    SettleFailureContext,
    SettleResultContext,
    VerifyContext,
    VerifyFailureContext,
    VerifyResultContext,
    # Errors
    NoMatchingRequirementsError,
    PaymentAbortedError,
    PaymentError,
    SchemeNotFoundError,
    SettleError,
    VerifyError,
    # Helpers
    derive_network_pattern,
    detect_version,
    find_schemes_by_network,
    match_payload_to_requirements,
    matches_network_pattern,
    parse_payment_payload,
    parse_payment_required,
)

__version__ = "0.1.0"

__all__ = [
    # Version
    "__version__",
    # Core components
    "x402Client",
    "x402ResourceServer",
    "x402Facilitator",
    "FacilitatorClient",
    # Policies
    "default_payment_selector",
    "prefer_network",
    "prefer_scheme",
    "max_amount",
    # Interfaces
    "SchemeNetworkClient",
    "SchemeNetworkClientV1",
    "SchemeNetworkServer",
    "SchemeNetworkFacilitator",
    "SchemeNetworkFacilitatorV1",
    # Types - Base
    "X402_VERSION",
    "Network",
    "Money",
    "Price",
    "AssetAmount",
    # Types - V2 Payments
    "ResourceInfo",
    "PaymentRequirements",
    "PaymentRequired",
    "PaymentPayload",
    # Types - V1 Legacy
    "PaymentRequirementsV1",
    "PaymentRequiredV1",
    "PaymentPayloadV1",
    # Types - Responses
    "VerifyResponse",
    "SettleResponse",
    "SupportedKind",
    "SupportedResponse",
    # Types - Config
    "ResourceConfig",
    "FacilitatorConfig",
    "PaywallConfig",
    "RoutesConfig",
    # Types - Hooks
    "AbortResult",
    "RecoveredPayloadResult",
    "RecoveredVerifyResult",
    "RecoveredSettleResult",
    "VerifyContext",
    "VerifyResultContext",
    "VerifyFailureContext",
    "SettleContext",
    "SettleResultContext",
    "SettleFailureContext",
    "PaymentCreationContext",
    "PaymentCreatedContext",
    "PaymentCreationFailureContext",
    # Types - Errors
    "PaymentError",
    "VerifyError",
    "SettleError",
    "SchemeNotFoundError",
    "NoMatchingRequirementsError",
    "PaymentAbortedError",
    # Types - Helpers
    "detect_version",
    "match_payload_to_requirements",
    "matches_network_pattern",
    "derive_network_pattern",
    "find_schemes_by_network",
    "parse_payment_required",
    "parse_payment_payload",
]

