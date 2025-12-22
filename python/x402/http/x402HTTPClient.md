# x402HTTPClient - Implementation Plan

HTTP-aware payment client that wraps `x402Client` with automatic 402 handling, header encoding, and retry logic.

---

## Overview

The `x402HTTPClient` intercepts 402 Payment Required responses, automatically creates payment payloads using the underlying `x402Client`, and retries the request with payment headers.

**Key responsibilities:**
- Encode payment payloads into HTTP headers (V1: `X-PAYMENT`, V2: `PAYMENT-SIGNATURE`)
- Decode payment requirements from 402 responses (V1: body, V2: header)
- Automatically retry requests with payment after 402
- Support both V1 and V2 protocol versions

---

## File: `x402_http_client.py`

```python
from dataclasses import dataclass
from typing import Callable, Any
import json
import base64
from ..client import x402Client
from ..types import PaymentPayload, PaymentRequired, SettleResponse
from . import (
    encode_payment_signature_header,
    decode_payment_required_header,
    decode_payment_response_header,
    detect_payment_required_version,
)

class x402HTTPClient:
    """HTTP-specific client for x402 payment protocol.
    
    Wraps a x402Client to provide HTTP-specific encoding/decoding
    and automatic payment handling.
    """
    
    def __init__(self, client: x402Client):
        """Create x402HTTPClient.
        
        Args:
            client: Underlying x402Client for payment logic
        """
        self._client = client

    # =========================================================================
    # Header Encoding/Decoding
    # =========================================================================

    def encode_payment_signature_header(
        self, payload: PaymentPayload
    ) -> dict[str, str]:
        """Encode payment payload into HTTP headers.
        
        Returns appropriate header based on protocol version:
        - V2: { "PAYMENT-SIGNATURE": base64 }
        - V1: { "X-PAYMENT": base64 }
        
        Args:
            payload: Payment payload to encode
            
        Returns:
            Dict with single header name -> value
        """
        encoded = encode_payment_signature_header(payload)
        
        if payload.x402_version == 2:
            return {"PAYMENT-SIGNATURE": encoded}
        elif payload.x402_version == 1:
            return {"X-PAYMENT": encoded}
        else:
            raise ValueError(f"Unsupported x402 version: {payload.x402_version}")

    def get_payment_required_response(
        self,
        get_header: Callable[[str], str | None],
        body: Any = None,
    ) -> PaymentRequired:
        """Extract payment required from HTTP response.
        
        Handles both V1 (body) and V2 (header) formats.
        
        Args:
            get_header: Function to get header by name (case-insensitive)
            body: Response body (for V1 compatibility)
            
        Returns:
            Decoded PaymentRequired
            
        Raises:
            ValueError: If no payment required info found
        """
        # V2: Check PAYMENT-REQUIRED header
        header = get_header("PAYMENT-REQUIRED")
        if header:
            return decode_payment_required_header(header)
        
        # V1: Check body
        if body:
            if isinstance(body, dict) and body.get("x402Version") == 1:
                return PaymentRequired.from_dict(body)
        
        raise ValueError("Invalid payment required response")

    def get_payment_settle_response(
        self,
        get_header: Callable[[str], str | None],
    ) -> SettleResponse:
        """Extract settlement response from HTTP headers.
        
        Args:
            get_header: Function to get header by name
            
        Returns:
            Decoded SettleResponse
            
        Raises:
            ValueError: If no payment response header found
        """
        # V2 header
        header = get_header("PAYMENT-RESPONSE")
        if header:
            return decode_payment_response_header(header)
        
        # V1 header
        header = get_header("X-PAYMENT-RESPONSE")
        if header:
            return decode_payment_response_header(header)
        
        raise ValueError("Payment response header not found")

    # =========================================================================
    # Payment Creation (delegates to x402Client)
    # =========================================================================

    async def create_payment_payload(
        self, payment_required: PaymentRequired
    ) -> PaymentPayload:
        """Create payment payload for the given requirements.
        
        Delegates to the underlying x402Client.
        
        Args:
            payment_required: Payment required response from server
            
        Returns:
            Payment payload to send with retry request
        """
        return await self._client.create_payment_payload(payment_required)

    # =========================================================================
    # Convenience Methods
    # =========================================================================

    async def handle_402_response(
        self,
        headers: dict[str, str],
        body: bytes | None,
    ) -> tuple[dict[str, str], PaymentPayload]:
        """Handle a 402 response and create payment headers.
        
        Convenience method that:
        1. Detects protocol version
        2. Parses PaymentRequired
        3. Creates PaymentPayload
        4. Returns headers to add to retry request
        
        Args:
            headers: Response headers
            body: Response body bytes
            
        Returns:
            Tuple of (headers_to_add, payment_payload)
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
        payment_payload = await self.create_payment_payload(payment_required)
        
        # Encode headers
        payment_headers = self.encode_payment_signature_header(payment_payload)
        
        return payment_headers, payment_payload


class PaymentRoundTripper:
    """HTTP transport wrapper with automatic payment handling.
    
    Wraps an HTTP transport/session to automatically handle 402 responses.
    Can be used with httpx, requests, or any HTTP client that supports
    transport/adapter customization.
    
    Usage with httpx:
        client = httpx.AsyncClient(transport=PaymentRoundTripper(x402_http_client))
        
    Usage with requests:
        session.mount("https://", PaymentHTTPAdapter(x402_http_client))
    """
    
    MAX_RETRIES = 1  # Prevent infinite loops
    
    def __init__(self, x402_client: x402HTTPClient):
        """Create PaymentRoundTripper.
        
        Args:
            x402_client: HTTP client for payment handling
        """
        self._x402_client = x402_client
        self._retry_counts: dict[str, int] = {}

    async def handle_response(
        self,
        request_id: str,
        status_code: int,
        headers: dict[str, str],
        body: bytes | None,
        retry_func: Callable[[dict[str, str]], Any],
    ) -> Any:
        """Handle HTTP response, automatically paying on 402.
        
        Args:
            request_id: Unique ID for this request (for retry tracking)
            status_code: Response status code
            headers: Response headers
            body: Response body
            retry_func: Function to retry request with additional headers
            
        Returns:
            Original response if not 402, or retried response with payment
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
        payment_headers, _ = await self._x402_client.handle_402_response(headers, body)
        
        # Retry with payment
        result = await retry_func(payment_headers)
        
        # Clean up
        self._retry_counts.pop(request_id, None)
        
        return result
```

---

## V1/V2 Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           x402HTTPClient Flow                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. Initial Request                                                         │
│     ┌──────────┐              ┌──────────┐                                  │
│     │  Client  │──────────────│  Server  │                                  │
│     └──────────┘   GET /api   └──────────┘                                  │
│                                                                             │
│  2. 402 Response                                                            │
│     ┌──────────┐              ┌──────────┐                                  │
│     │  Client  │◀─────────────│  Server  │                                  │
│     └──────────┘   402        └──────────┘                                  │
│                    V2: PAYMENT-REQUIRED header                              │
│                    V1: PaymentRequired in body                              │
│                                                                             │
│  3. Parse & Create Payment                                                  │
│     ┌──────────────────────────────────────────┐                            │
│     │ x402HTTPClient.handle_402_response()     │                            │
│     │   → Detect version (V1/V2)               │                            │
│     │   → Parse PaymentRequired                │                            │
│     │   → x402Client.create_payment_payload()  │                            │
│     │   → Encode as header                     │                            │
│     └──────────────────────────────────────────┘                            │
│                                                                             │
│  4. Retry with Payment                                                      │
│     ┌──────────┐              ┌──────────┐                                  │
│     │  Client  │──────────────│  Server  │                                  │
│     └──────────┘   GET /api   └──────────┘                                  │
│                    V2: PAYMENT-SIGNATURE header                             │
│                    V1: X-PAYMENT header                                     │
│                                                                             │
│  5. Success + Settlement                                                    │
│     ┌──────────┐              ┌──────────┐                                  │
│     │  Client  │◀─────────────│  Server  │                                  │
│     └──────────┘   200 OK     └──────────┘                                  │
│                    V2: PAYMENT-RESPONSE header                              │
│                    V1: X-PAYMENT-RESPONSE header                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Integration with HTTP Libraries

The `x402HTTPClient` is library-agnostic. Framework-specific integrations live in `http/clients/`:

| Library | Integration | File |
|---------|-------------|------|
| httpx | Event hooks or custom transport | `clients/httpx.py` |
| requests | HTTPAdapter subclass | `clients/requests.py` |
| aiohttp | Custom connector or middleware | `clients/aiohttp.py` |

See `clients/TODO.md` for framework-specific implementation details.

---

## Testing Checklist

- [ ] V1 header encoding (`X-PAYMENT`)
- [ ] V2 header encoding (`PAYMENT-SIGNATURE`)
- [ ] V1 PaymentRequired parsing (from body)
- [ ] V2 PaymentRequired parsing (from header)
- [ ] V1 settle response parsing (`X-PAYMENT-RESPONSE`)
- [ ] V2 settle response parsing (`PAYMENT-RESPONSE`)
- [ ] Retry limit prevents infinite loops
- [ ] Version detection from mixed response formats
- [ ] Case-insensitive header handling
- [ ] Invalid base64 raises appropriate errors

---

## Example Usage

```python
from x402 import x402Client
from x402.http import x402HTTPClient
from x402.mechanisms.evm.exact import register_exact_evm_client
import httpx

# Setup x402 client with EVM support
client = x402Client()
register_exact_evm_client(client, signer=my_wallet)

# Wrap with HTTP client
http_client = x402HTTPClient(client)

# Manual usage
async with httpx.AsyncClient() as session:
    response = await session.get("https://api.example.com/paid-resource")
    
    if response.status_code == 402:
        # Handle payment
        payment_headers, _ = await http_client.handle_402_response(
            dict(response.headers),
            response.content,
        )
        
        # Retry with payment
        response = await session.get(
            "https://api.example.com/paid-resource",
            headers=payment_headers,
        )

# Automatic usage (with httpx hooks)
from x402.http.clients import x402_httpx_hooks

async with httpx.AsyncClient(
    event_hooks=x402_httpx_hooks(http_client)
) as session:
    # 402 handling is automatic
    response = await session.get("https://api.example.com/paid-resource")
```

