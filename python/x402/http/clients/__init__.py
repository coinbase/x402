"""HTTP client wrappers with automatic x402 payment handling.

Provides wrappers for httpx (async) and requests (sync) that
automatically handle 402 Payment Required responses.
"""

# httpx (async)
from .httpx import (
    MissingRequestConfigError,
    PaymentAlreadyAttemptedError,
    PaymentError,
    wrapHttpxWithPayment,
    wrapHttpxWithPaymentFromConfig,
    x402_httpx_hooks,  # Deprecated, kept for compatibility
    x402_httpx_transport,
    x402AsyncTransport,
    x402HttpxClient,
)

# requests (sync)
from .requests import (
    wrapRequestsWithPayment,
    wrapRequestsWithPaymentFromConfig,
    x402_http_adapter,
    x402_requests,
    x402HTTPAdapter,
)

__all__ = [
    # Errors
    "PaymentError",
    "PaymentAlreadyAttemptedError",
    "MissingRequestConfigError",
    # httpx
    "x402AsyncTransport",
    "x402_httpx_transport",
    "wrapHttpxWithPayment",
    "wrapHttpxWithPaymentFromConfig",
    "x402_httpx_hooks",  # Deprecated
    "x402HttpxClient",
    # requests
    "x402HTTPAdapter",
    "wrapRequestsWithPayment",
    "wrapRequestsWithPaymentFromConfig",
    "x402_http_adapter",
    "x402_requests",
]
