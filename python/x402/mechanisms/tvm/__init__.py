"""TVM mechanism for x402 payment protocol."""

# Constants
from .constants import (
    DEFAULT_DECIMALS,
    ERR_INSUFFICIENT_AMOUNT,
    ERR_INVALID_SIGNATURE,
    ERR_PAYMENT_EXPIRED,
    ERR_RECIPIENT_MISMATCH,
    ERR_REPLAY_DETECTED,
    ERR_SETTLEMENT_FAILED,
    ERR_SETTLEMENT_TIMEOUT,
    ERR_UNSUPPORTED_NETWORK,
    ERR_UNSUPPORTED_SCHEME,
    EXTERNAL_SIGNED_OP,
    INTERNAL_SIGNED_OP,
    JETTON_TRANSFER_OP,
    MAX_BOC_SIZE,
    SCHEME_EXACT,
    SEND_MSG_OP,
    SETTLEMENT_TIMEOUT,
    SUPPORTED_NETWORKS,
    TONAPI_MAINNET_URL,
    TONAPI_TESTNET_URL,
    TVM_MAINNET,
    TVM_TESTNET,
    USDT_MASTER,
    W5R1_CODE_HASH,
)

# Signer protocols
from .signer import ClientTvmSigner, FacilitatorTvmSigner

# Signer implementations — lazy import to avoid hard httpx dependency at import time
def __getattr__(name: str):
    if name == "TonapiProvider":
        from .signers import TonapiProvider
        return TonapiProvider
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")

# Types
from .types import (
    JettonTransferInfo,
    PaymentState,
    TvmPaymentPayload,
    VerifyResult,
    W5ParsedMessage,
)

# Utilities
from .utils import (
    friendly_to_raw,
    is_valid_address,
    is_valid_network,
    normalize_address,
    raw_to_friendly,
)

__all__ = [
    # Constants
    "SCHEME_EXACT",
    "TVM_MAINNET",
    "TVM_TESTNET",
    "SUPPORTED_NETWORKS",
    "USDT_MASTER",
    "JETTON_TRANSFER_OP",
    "INTERNAL_SIGNED_OP",
    "EXTERNAL_SIGNED_OP",
    "SEND_MSG_OP",
    "W5R1_CODE_HASH",
    "MAX_BOC_SIZE",
    "SETTLEMENT_TIMEOUT",
    "TONAPI_MAINNET_URL",
    "TONAPI_TESTNET_URL",
    "DEFAULT_DECIMALS",
    "ERR_INVALID_SIGNATURE",
    "ERR_UNSUPPORTED_SCHEME",
    "ERR_UNSUPPORTED_NETWORK",
    "ERR_PAYMENT_EXPIRED",
    "ERR_REPLAY_DETECTED",
    "ERR_INSUFFICIENT_AMOUNT",
    "ERR_RECIPIENT_MISMATCH",
    "ERR_SETTLEMENT_FAILED",
    "ERR_SETTLEMENT_TIMEOUT",
    # Signer protocols
    "ClientTvmSigner",
    "FacilitatorTvmSigner",
    # Signer implementations
    "TonapiProvider",
    # Types
    "TvmPaymentPayload",
    "W5ParsedMessage",
    "JettonTransferInfo",
    "VerifyResult",
    "PaymentState",
    # Utilities
    "normalize_address",
    "friendly_to_raw",
    "raw_to_friendly",
    "is_valid_address",
    "is_valid_network",
]
