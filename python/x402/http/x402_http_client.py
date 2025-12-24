"""HTTP-specific client for x402 payment protocol."""

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any, Callable

from ..schemas import (
    PaymentPayload,
    PaymentRequired,
    SettleResponse,
)
from ..schemas.v1 import PaymentPayloadV1, PaymentRequiredV1
from .constants import (
    PAYMENT_REQUIRED_HEADER,
    PAYMENT_RESPONSE_HEADER,
    PAYMENT_SIGNATURE_HEADER,
    X_PAYMENT_HEADER,
    X_PAYMENT_RESPONSE_HEADER,
)
from .utils import (
    decode_payment_required_header,
    decode_payment_response_header,
    encode_payment_signature_header,
)

if TYPE_CHECKING:
    from ..client import x402Client


class x402HTTPClient:
    """HTTP-specific client for x402 payment protocol.

    Wraps a x402Client to provide HTTP-specific encoding/decoding
    and automatic payment handling.
    """

    def __init__(self, client: "x402Client") -> None:
        """Create x402HTTPClient.

        Args:
            client: Underlying x402Client for payment logic.
        """
        self._client = client

    # =========================================================================
    # Header Encoding/Decoding
    # =========================================================================

    def encode_payment_signature_header(
        self,
        payload: PaymentPayload | PaymentPayloadV1,
    ) -> dict[str, str]:
        """Encode payment payload into HTTP headers.

        Returns appropriate header based on protocol version:
        - V2: { "PAYMENT-SIGNATURE": base64 }
        - V1: { "X-PAYMENT": base64 }

        Args:
            payload: Payment payload to encode.

        Returns:
            Dict with single header name -> value.
        """
        encoded = encode_payment_signature_header(payload)

        if payload.x402_version == 2:
            return {PAYMENT_SIGNATURE_HEADER: encoded}
        elif payload.x402_version == 1:
            return {X_PAYMENT_HEADER: encoded}
        else:
            raise ValueError(f"Unsupported x402 version: {payload.x402_version}")

    def get_payment_required_response(
        self,
        get_header: Callable[[str], str | None],
        body: Any = None,
    ) -> PaymentRequired | PaymentRequiredV1:
        """Extract payment required from HTTP response.

        Handles both V1 (body) and V2 (header) formats.

        Args:
            get_header: Function to get header by name (case-insensitive).
            body: Response body (for V1 compatibility).

        Returns:
            Decoded PaymentRequired.

        Raises:
            ValueError: If no payment required info found.
        """
        # V2: Check PAYMENT-REQUIRED header
        header = get_header(PAYMENT_REQUIRED_HEADER)
        if header:
            return decode_payment_required_header(header)

        # V1: Check body
        if body:
            if isinstance(body, dict) and body.get("x402Version") == 1:
                return PaymentRequiredV1.model_validate(body)
            if isinstance(body, bytes):
                data = json.loads(body.decode("utf-8"))
                if data.get("x402Version") == 1:
                    return PaymentRequiredV1.model_validate(data)

        raise ValueError("Invalid payment required response")

    def get_payment_settle_response(
        self,
        get_header: Callable[[str], str | None],
    ) -> SettleResponse:
        """Extract settlement response from HTTP headers.

        Args:
            get_header: Function to get header by name.

        Returns:
            Decoded SettleResponse.

        Raises:
            ValueError: If no payment response header found.
        """
        # V2 header
        header = get_header(PAYMENT_RESPONSE_HEADER)
        if header:
            return decode_payment_response_header(header)

        # V1 header
        header = get_header(X_PAYMENT_RESPONSE_HEADER)
        if header:
            return decode_payment_response_header(header)

        raise ValueError("Payment response header not found")

    # =========================================================================
    # Payment Creation (delegates to x402Client)
    # =========================================================================

    def create_payment_payload(
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
        return self._client.create_payment_payload(payment_required)

    # =========================================================================
    # Convenience Methods
    # =========================================================================

    def handle_402_response(
        self,
        headers: dict[str, str],
        body: bytes | None,
    ) -> tuple[dict[str, str], PaymentPayload | PaymentPayloadV1]:
        """Handle a 402 response and create payment headers.

        Convenience method that:
        1. Detects protocol version
        2. Parses PaymentRequired
        3. Creates PaymentPayload
        4. Returns headers to add to retry request

        Args:
            headers: Response headers.
            body: Response body bytes.

        Returns:
            Tuple of (headers_to_add, payment_payload).
        """
        # Normalize headers
        normalized = {k.upper(): v for k, v in headers.items()}

        def get_header(name: str) -> str | None:
            return normalized.get(name.upper())

        # Parse body if present
        body_data = None
        if body:
            try:
                body_data = json.loads(body)
            except json.JSONDecodeError:
                pass

        # Get payment required
        payment_required = self.get_payment_required_response(get_header, body_data)

        # Create payment
        payment_payload = self.create_payment_payload(payment_required)

        # Encode headers
        payment_headers = self.encode_payment_signature_header(payment_payload)

        return payment_headers, payment_payload


class PaymentRoundTripper:
    """HTTP transport wrapper with automatic payment handling.

    Wraps an HTTP transport/session to automatically handle 402 responses.
    Can be used with httpx, requests, or any HTTP client that supports
    transport/adapter customization.
    """

    MAX_RETRIES = 1  # Prevent infinite loops

    def __init__(self, x402_client: x402HTTPClient) -> None:
        """Create PaymentRoundTripper.

        Args:
            x402_client: HTTP client for payment handling.
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
