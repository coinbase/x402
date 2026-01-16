"""requests library wrapper with automatic x402 payment handling.

Provides HTTPAdapter and convenience functions for sync requests.Session.
"""

from __future__ import annotations

import copy
import json
from typing import TYPE_CHECKING, Any

try:
    import requests
    from requests.adapters import HTTPAdapter
except ImportError as e:
    raise ImportError(
        "requests client requires the requests package. Install with: uv add x402[requests]"
    ) from e

if TYPE_CHECKING:
    from ...client import x402Client
    from ..x402_http_client import x402HTTPClient


class PaymentError(Exception):
    """Base class for payment-related errors."""

    pass


class PaymentAlreadyAttemptedError(PaymentError):
    """Raised when payment has already been attempted."""

    pass


# ============================================================================
# HTTP Adapter Implementation
# ============================================================================


class x402HTTPAdapter(HTTPAdapter):
    """HTTP adapter that handles 402 Payment Required responses.

    Subclasses requests.HTTPAdapter to intercept 402 responses,
    create payment payloads, and retry with payment headers.

    Note: Uses synchronous payment creation.
    """

    RETRY_HEADER = "X-x402-Payment-Retry"

    def __init__(
        self,
        client: x402Client | x402HTTPClient,
        **kwargs: Any,
    ) -> None:
        """Initialize payment adapter.

        Args:
            client: x402Client or x402HTTPClient for payments.
            **kwargs: Additional arguments for HTTPAdapter.
        """
        super().__init__(**kwargs)

        from ..x402_http_client import x402HTTPClient as HTTPClient

        if isinstance(client, HTTPClient):
            self._http_client = client
        else:
            self._http_client = HTTPClient(client)

        self._client = client

    def send(
        self,
        request: requests.PreparedRequest,
        **kwargs: Any,
    ) -> requests.Response:
        """Send request with automatic 402 payment handling.

        Args:
            request: The prepared request.
            **kwargs: Additional send arguments.

        Returns:
            Response (original or retried with payment).

        Raises:
            PaymentError: If payment handling fails.
        """
        # Check if this is already a retry (per-request state via header)
        is_retry = request.headers.get(self.RETRY_HEADER) == "1"

        # Make initial request
        response = super().send(request, **kwargs)

        # Not a 402, return as-is
        if response.status_code != 402:
            return response

        # Already retried with payment, return the 402
        if is_retry:
            return response

        try:
            # Save content before parsing (avoid consuming stream)
            content = copy.deepcopy(response.content)

            # Parse PaymentRequired (try header first for V2, then body for V1)
            def get_header(name: str) -> str | None:
                return response.headers.get(name)

            body = None
            try:
                body = json.loads(content.decode("utf-8"))
            except (json.JSONDecodeError, UnicodeDecodeError):
                pass

            payment_required = self._http_client.get_payment_required_response(get_header, body)

            # Create payment payload (sync)
            payment_payload = self._client.create_payment_payload(payment_required)

            # Encode payment headers
            payment_headers = self._http_client.encode_payment_signature_header(payment_payload)

            # Create a copy of the request for retry (don't modify original)
            retry_request = request.copy()
            retry_request.headers.update(payment_headers)
            retry_request.headers["Access-Control-Expose-Headers"] = "PAYMENT-RESPONSE,X-PAYMENT-RESPONSE"
            retry_request.headers[self.RETRY_HEADER] = "1"

            # Retry request with payment
            retry_response = super().send(retry_request, **kwargs)

            return retry_response

        except PaymentError:
            raise
        except Exception as e:
            raise PaymentError(f"Failed to handle payment: {e}") from e


def x402_http_adapter(
    client: x402Client | x402HTTPClient,
    **kwargs: Any,
) -> x402HTTPAdapter:
    """Create an HTTP adapter with 402 payment handling.

    Args:
        client: x402Client or x402HTTPClient for payments.
        **kwargs: Additional arguments for HTTPAdapter.

    Returns:
        x402HTTPAdapter that can be mounted to a session.

    Example:
        ```python
        import requests
        from x402 import x402Client
        from x402.http.clients import x402_http_adapter

        x402 = x402Client()
        # ... register schemes ...

        session = requests.Session()
        adapter = x402_http_adapter(x402)
        session.mount("https://", adapter)
        session.mount("http://", adapter)

        response = session.get("https://api.example.com/paid")
        ```
    """
    return x402HTTPAdapter(client, **kwargs)


# ============================================================================
# Wrapper Functions (like TypeScript)
# ============================================================================


def wrapRequestsWithPayment(
    session: requests.Session,
    client: x402Client | x402HTTPClient,
    **adapter_kwargs: Any,
) -> requests.Session:
    """Wrap a requests Session with automatic 402 payment handling.

    Mounts a payment-aware adapter for both HTTP and HTTPS.

    Args:
        session: requests Session to wrap.
        client: x402Client or x402HTTPClient for payments.
        **adapter_kwargs: Additional arguments for the adapter.

    Returns:
        The same session with payment adapter mounted.

    Example:
        ```python
        import requests
        from x402 import x402Client
        from x402.http.clients import wrapRequestsWithPayment

        x402 = x402Client()
        # ... register schemes ...

        session = wrapRequestsWithPayment(requests.Session(), x402)
        response = session.get("https://api.example.com/paid")
        ```
    """
    adapter = x402HTTPAdapter(client, **adapter_kwargs)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session


def wrapRequestsWithPaymentFromConfig(
    session: requests.Session,
    config: dict[str, Any],
    **adapter_kwargs: Any,
) -> requests.Session:
    """Wrap requests session with payment handling using configuration.

    Args:
        session: requests Session to wrap.
        config: x402Client configuration dict.
        **adapter_kwargs: Additional arguments for the adapter.

    Returns:
        Wrapped session.
    """
    from ...client import x402Client

    x402 = x402Client.from_config(config)
    return wrapRequestsWithPayment(session, x402, **adapter_kwargs)


# ============================================================================
# Convenience Function (like legacy Python)
# ============================================================================


def x402_requests(
    client: x402Client | x402HTTPClient,
    **adapter_kwargs: Any,
) -> requests.Session:
    """Create a requests Session with x402 payment handling.

    Convenience function that creates a new session with payment
    handling pre-configured.

    Args:
        client: x402Client or x402HTTPClient for payments.
        **adapter_kwargs: Additional arguments for the adapter.

    Returns:
        New session with payment handling configured.

    Example:
        ```python
        from x402 import x402Client
        from x402.http.clients import x402_requests

        x402 = x402Client()
        # ... register schemes ...

        session = x402_requests(x402)
        response = session.get("https://api.example.com/paid")
        ```
    """
    session = requests.Session()
    return wrapRequestsWithPayment(session, client, **adapter_kwargs)
