"""HTTP-specific client for x402 payment protocol.

Provides both async (x402HTTPClient) and sync (x402HTTPClientSync) implementations.
"""

from __future__ import annotations

import inspect
from collections.abc import Callable
from typing import TYPE_CHECKING, Any

from ..schemas import PaymentPayload, PaymentRequired
from ..schemas.v1 import PaymentPayloadV1, PaymentRequiredV1
from .x402_http_client_base import x402HTTPClientBase

if TYPE_CHECKING:
    from ..client import x402Client, x402ClientSync

# ---------------------------------------------------------------------------
# Hook type aliases
# ---------------------------------------------------------------------------

#: Return type for on_payment_required hooks.  Return a dict of headers to
#: retry with those headers *before* attempting payment, or ``None``/nothing
#: to fall through to the normal payment flow.
PaymentRequiredHookResult = dict[str, str] | None

#: Async hook called when a 402 response is received.
#: Mirrors the TypeScript ``PaymentRequiredHook`` type.
AsyncPaymentRequiredHook = Callable[
    [PaymentRequired | PaymentRequiredV1],
    Any,  # Awaitable[PaymentRequiredHookResult]
]

#: Sync hook called when a 402 response is received.
SyncPaymentRequiredHook = Callable[
    [PaymentRequired | PaymentRequiredV1],
    PaymentRequiredHookResult,
]

# Re-export for external use
__all__ = [
    "x402HTTPClient",
    "x402HTTPClientSync",
    "PaymentRoundTripper",
    "AsyncPaymentRequiredHook",
    "SyncPaymentRequiredHook",
    "PaymentRequiredHookResult",
]


# ============================================================================
# Async HTTP Client (Default)
# ============================================================================


class x402HTTPClient(x402HTTPClientBase):
    """Async HTTP-specific client for x402 payment protocol.

    Wraps a x402Client to provide HTTP-specific encoding/decoding
    and automatic payment handling.
    """

    def __init__(self, client: x402Client) -> None:
        """Create x402HTTPClient.

        Args:
            client: Underlying x402Client for payment logic.
        """
        self._client = client
        self._payment_required_hooks: list[AsyncPaymentRequiredHook] = []

    # =========================================================================
    # Lifecycle Hooks
    # =========================================================================

    def on_payment_required(
        self,
        hook: AsyncPaymentRequiredHook,
    ) -> x402HTTPClient:
        """Register a hook to run when a 402 response is received.

        The hook runs *before* x402 payment processing.  If the hook returns a
        dict, the request is retried with those headers (e.g. an API key) and
        payment is skipped.  Return ``None`` or nothing to fall through to the
        normal payment flow.

        Multiple hooks are tried in registration order; the first one that
        returns a non-``None`` result wins.

        Supports method chaining::

            client.on_payment_required(try_api_key).on_payment_required(log_request)

        Args:
            hook: Async callable that receives the
                :class:`~x402.schemas.PaymentRequired` object and returns
                either a ``dict[str, str]`` of headers or ``None``.

        Returns:
            ``self`` for method chaining.
        """
        self._payment_required_hooks.append(hook)
        return self

    async def handle_payment_required(
        self,
        payment_required: PaymentRequired | PaymentRequiredV1,
    ) -> dict[str, str] | None:
        """Run registered hooks for a 402 response.

        Iterates through hooks in order and returns the headers from the first
        hook that returns a non-``None`` result.  Returns ``None`` if no hook
        provides headers, which signals the caller to proceed with payment.

        Args:
            payment_required: Parsed payment-required object from the server.

        Returns:
            Headers to use for a pre-payment retry, or ``None`` to proceed
            with the normal x402 payment flow.
        """
        for hook in self._payment_required_hooks:
            result = await hook(payment_required)
            if result is not None:
                return result
        return None

    # =========================================================================
    # Payment Creation (async, delegates to x402Client)
    # =========================================================================

    async def create_payment_payload(
        self,
        payment_required: PaymentRequired | PaymentRequiredV1,
    ) -> PaymentPayload | PaymentPayloadV1:
        """Create payment payload for the given requirements.

        Delegates to the underlying x402Client.

        Args:
            payment_required: Payment required response from server.

        Returns:
            Payment payload to send with retry request.
        """
        return await self._client.create_payment_payload(payment_required)

    # =========================================================================
    # Convenience Methods
    # =========================================================================

    async def handle_402_response(
        self,
        headers: dict[str, str],
        body: bytes | None,
    ) -> tuple[dict[str, str], PaymentPayload | PaymentPayloadV1 | None]:
        """Handle a 402 response and create payment headers.

        First runs any registered ``on_payment_required`` hooks.  If a hook
        returns headers, those headers are returned *without* creating a
        payment payload (the second element of the tuple will be ``None``).
        This allows callers to retry with, e.g., an API key before paying.

        If no hook provides headers the method falls through to the normal
        x402 payment flow:

        1. Detects protocol version
        2. Parses PaymentRequired
        3. Creates PaymentPayload
        4. Returns headers to add to retry request

        Args:
            headers: Response headers.
            body: Response body bytes.

        Returns:
            Tuple of (headers_to_add, payment_payload_or_none).  The second
            element is ``None`` when a hook short-circuited the payment flow.
        """
        get_header, body_data = self._handle_402_common(headers, body)
        payment_required = self.get_payment_required_response(get_header, body_data)

        # Run on_payment_required hooks first
        hook_headers = await self.handle_payment_required(payment_required)
        if hook_headers is not None:
            return hook_headers, None

        # Normal payment flow
        payment_payload = await self.create_payment_payload(payment_required)
        payment_headers = self.encode_payment_signature_header(payment_payload)
        return payment_headers, payment_payload


# ============================================================================
# Sync HTTP Client
# ============================================================================


class x402HTTPClientSync(x402HTTPClientBase):
    """Sync HTTP-specific client for x402 payment protocol.

    Wraps a x402ClientSync to provide HTTP-specific encoding/decoding
    and automatic payment handling.
    """

    def __init__(self, client: x402ClientSync) -> None:
        """Create x402HTTPClientSync.

        Args:
            client: Underlying x402ClientSync for payment logic.

        Raises:
            TypeError: If client has async methods (wrong variant).
        """
        # Runtime validation - catch mismatched sync/async early
        create_method = getattr(client, "create_payment_payload", None)
        if create_method and inspect.iscoroutinefunction(create_method):
            raise TypeError(
                f"x402HTTPClientSync requires a sync client, "
                f"but got {type(client).__name__} which has async methods. "
                f"Use x402ClientSync instead of x402Client, "
                f"or use x402HTTPClient (async) with x402Client."
            )

        self._client = client
        self._payment_required_hooks: list[SyncPaymentRequiredHook] = []

    # =========================================================================
    # Lifecycle Hooks
    # =========================================================================

    def on_payment_required(
        self,
        hook: SyncPaymentRequiredHook,
    ) -> x402HTTPClientSync:
        """Register a hook to run when a 402 response is received.

        The hook runs *before* x402 payment processing.  If the hook returns a
        dict, the request is retried with those headers (e.g. an API key) and
        payment is skipped.  Return ``None`` or nothing to fall through to the
        normal payment flow.

        Multiple hooks are tried in registration order; the first one that
        returns a non-``None`` result wins.

        Supports method chaining::

            client.on_payment_required(try_api_key).on_payment_required(log_request)

        Args:
            hook: Sync callable that receives the
                :class:`~x402.schemas.PaymentRequired` object and returns
                either a ``dict[str, str]`` of headers or ``None``.

        Returns:
            ``self`` for method chaining.
        """
        self._payment_required_hooks.append(hook)
        return self

    def handle_payment_required(
        self,
        payment_required: PaymentRequired | PaymentRequiredV1,
    ) -> dict[str, str] | None:
        """Run registered hooks for a 402 response.

        Iterates through hooks in order and returns the headers from the first
        hook that returns a non-``None`` result.  Returns ``None`` if no hook
        provides headers, which signals the caller to proceed with payment.

        Args:
            payment_required: Parsed payment-required object from the server.

        Returns:
            Headers to use for a pre-payment retry, or ``None`` to proceed
            with the normal x402 payment flow.
        """
        for hook in self._payment_required_hooks:
            result = hook(payment_required)
            if result is not None:
                return result
        return None

    def create_payment_payload(
        self,
        payment_required: PaymentRequired | PaymentRequiredV1,
    ) -> PaymentPayload | PaymentPayloadV1:
        """Create payment payload for the given requirements.

        Delegates to the underlying x402ClientSync.

        Args:
            payment_required: Payment required response from server.

        Returns:
            Payment payload to send with retry request.
        """
        return self._client.create_payment_payload(payment_required)

    def handle_402_response(
        self,
        headers: dict[str, str],
        body: bytes | None,
    ) -> tuple[dict[str, str], PaymentPayload | PaymentPayloadV1 | None]:
        """Handle a 402 response and create payment headers.

        First runs any registered ``on_payment_required`` hooks.  If a hook
        returns headers, those headers are returned *without* creating a
        payment payload (the second element of the tuple will be ``None``).
        This allows callers to retry with, e.g., an API key before paying.

        If no hook provides headers the method falls through to the normal
        x402 payment flow:

        1. Detects protocol version
        2. Parses PaymentRequired
        3. Creates PaymentPayload
        4. Returns headers to add to retry request

        Args:
            headers: Response headers.
            body: Response body bytes.

        Returns:
            Tuple of (headers_to_add, payment_payload_or_none).  The second
            element is ``None`` when a hook short-circuited the payment flow.
        """
        get_header, body_data = self._handle_402_common(headers, body)
        payment_required = self.get_payment_required_response(get_header, body_data)

        # Run on_payment_required hooks first
        hook_headers = self.handle_payment_required(payment_required)
        if hook_headers is not None:
            return hook_headers, None

        # Normal payment flow
        payment_payload = self.create_payment_payload(payment_required)
        payment_headers = self.encode_payment_signature_header(payment_payload)
        return payment_headers, payment_payload


# ============================================================================
# PaymentRoundTripper (Sync - for requests-style adapters)
# ============================================================================


class PaymentRoundTripper:
    """HTTP transport wrapper with automatic payment handling.

    Wraps an HTTP transport/session to automatically handle 402 responses.
    Can be used with httpx, requests, or any HTTP client that supports
    transport/adapter customization.
    """

    MAX_RETRIES = 1  # Prevent infinite loops

    def __init__(self, x402_client: x402HTTPClientSync) -> None:
        """Create PaymentRoundTripper.

        Args:
            x402_client: Sync HTTP client for payment handling.
        """
        self._x402_client = x402_client
        self._retry_counts: dict[str, int] = {}

    def handle_response(
        self,
        request_id: str,
        status_code: int,
        headers: dict[str, str],
        body: bytes | None,
        retry_func: Callable[[dict[str, str]], Any],
    ) -> Any:
        """Handle HTTP response, automatically paying on 402.

        Args:
            request_id: Unique ID for this request (for retry tracking).
            status_code: Response status code.
            headers: Response headers.
            body: Response body.
            retry_func: Function to retry request with additional headers.

        Returns:
            Original response if not 402, or retried response with payment.
        """
        # Not a 402, return as-is
        if status_code != 402:
            self._retry_counts.pop(request_id, None)
            return None  # Signal to return original response

        # Check retry limit
        retries = self._retry_counts.get(request_id, 0)
        if retries >= self.MAX_RETRIES:
            self._retry_counts.pop(request_id, None)
            raise RuntimeError("Payment retry limit exceeded")

        self._retry_counts[request_id] = retries + 1

        # Get payment headers
        payment_headers, _ = self._x402_client.handle_402_response(headers, body)
        # Retry with payment
        result = retry_func(payment_headers)

        # Clean up
        self._retry_counts.pop(request_id, None)

        return result
