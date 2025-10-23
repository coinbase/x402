"""x402: An internet native payments protocol."""

# EVM support
from x402.exact import (
    prepare_payment_header,
    sign_payment_header,
)

# SVM support
from x402.exact_svm import (
    create_payment_header as create_svm_payment_header,
    create_and_sign_payment as create_and_sign_svm_payment,
    decode_payment as decode_svm_payment,
    settle_payment as settle_svm_payment,
)

from x402.svm import (
    Keypair,
    create_keypair_from_base58,
    get_rpc_client,
    get_rpc_url,
)

# Clients
from x402.clients.base import (
    x402Client,
    decode_x_payment_response,
    PaymentError,
    PaymentAmountExceededError,
    MissingRequestConfigError,
    PaymentAlreadyAttemptedError,
)

# Types
from x402.types import (
    PaymentRequirements,
    PaymentPayload,
    ExactPaymentPayload,
    ExactSvmPaymentPayload,
    x402PaymentRequiredResponse,
    VerifyResponse,
    SettleResponse,
)

# Networks
from x402.networks import (
    SupportedNetworks,
    SUPPORTED_EVM_NETWORKS,
    SUPPORTED_SVM_NETWORKS,
)

# Common utilities
from x402.common import process_price_to_atomic_amount, x402_VERSION


__all__ = [
    # EVM
    "prepare_payment_header",
    "sign_payment_header",
    # SVM
    "create_svm_payment_header",
    "create_and_sign_svm_payment",
    "decode_svm_payment",
    "settle_svm_payment",
    "Keypair",
    "create_keypair_from_base58",
    "get_rpc_client",
    "get_rpc_url",
    # Clients
    "x402Client",
    "decode_x_payment_response",
    "PaymentError",
    "PaymentAmountExceededError",
    "MissingRequestConfigError",
    "PaymentAlreadyAttemptedError",
    # Types
    "PaymentRequirements",
    "PaymentPayload",
    "ExactPaymentPayload",
    "ExactSvmPaymentPayload",
    "x402PaymentRequiredResponse",
    "VerifyResponse",
    "SettleResponse",
    # Networks
    "SupportedNetworks",
    "SUPPORTED_EVM_NETWORKS",
    "SUPPORTED_SVM_NETWORKS",
    # Common
    "process_price_to_atomic_amount",
    "x402_VERSION",
]


def hello() -> str:
    return "Hello from x402!"
