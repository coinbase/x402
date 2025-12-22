# HTTPFacilitatorClient - Implementation Plan

HTTP-based client for communicating with remote x402 facilitator services. Implements the `FacilitatorClient` protocol for verify, settle, and get_supported operations.

---

## Overview

The `HTTPFacilitatorClient` communicates with remote facilitator services over HTTP. It:
- Sends payment payloads and requirements to `/verify` and `/settle` endpoints
- Fetches supported payment kinds from `/supported`
- Handles authentication via configurable auth providers
- Supports both V1 and V2 protocol versions
- Operates at the network boundary (uses bytes/JSON, not typed objects)

---

## File: `facilitator_client.py`

```python
from dataclasses import dataclass, field
from typing import Protocol, Any
import json
import httpx

from ..types import (
    PaymentPayload,
    PaymentRequirements,
    VerifyResponse,
    SettleResponse,
    SupportedResponse,
)
from ..types.version import detect_version

# Default facilitator URL
DEFAULT_FACILITATOR_URL = "https://x402.org/facilitator"
DEFAULT_TIMEOUT_SECONDS = 30


# ============================================================================
# Auth Provider Protocol
# ============================================================================

class AuthProvider(Protocol):
    """Generates authentication headers for facilitator requests."""
    
    async def get_auth_headers(self) -> "AuthHeaders":
        """Get authentication headers for each endpoint.
        
        Returns:
            AuthHeaders with headers for verify, settle, and supported endpoints
        """
        ...


@dataclass
class AuthHeaders:
    """Authentication headers for facilitator endpoints."""
    verify: dict[str, str] = field(default_factory=dict)
    settle: dict[str, str] = field(default_factory=dict)
    supported: dict[str, str] = field(default_factory=dict)


# ============================================================================
# Configuration
# ============================================================================

@dataclass
class FacilitatorConfig:
    """Configuration for HTTP facilitator client."""
    
    # Base URL of facilitator service
    url: str = DEFAULT_FACILITATOR_URL
    
    # Request timeout in seconds
    timeout: float = DEFAULT_TIMEOUT_SECONDS
    
    # Custom httpx client (optional)
    http_client: httpx.AsyncClient | None = None
    
    # Authentication provider (optional)
    auth_provider: AuthProvider | None = None
    
    # Identifier for this facilitator (for logging/debugging)
    identifier: str | None = None


# ============================================================================
# FacilitatorClient Protocol (defined here in http/)
# ============================================================================

class FacilitatorClient(Protocol):
    """Protocol for facilitator clients (HTTP or local).
    
    Used by x402ResourceServer to verify/settle payments.
    Implemented by HTTPFacilitatorClient for remote facilitators.
    
    Note: Sync-first (matching legacy SDK pattern).
    Note: verify/settle return response objects with is_valid/success=False on failure.
    """
    
    def verify(
        self,
        payload: PaymentPayload,
        requirements: PaymentRequirements,
    ) -> VerifyResponse:
        """Verify a payment. Returns VerifyResponse with is_valid=False on failure."""
        ...
    
    def settle(
        self,
        payload: PaymentPayload,
        requirements: PaymentRequirements,
    ) -> SettleResponse:
        """Settle a payment. Returns SettleResponse with success=False on failure."""
        ...
    
    def get_supported(self) -> SupportedResponse:
        """Get supported payment kinds."""
        ...


# ============================================================================
# HTTP Facilitator Client
# ============================================================================

class HTTPFacilitatorClient:
    """HTTP-based facilitator client.
    
    Communicates with remote x402 facilitator services over HTTP.
    Supports both V1 and V2 protocol versions.
    """
    
    def __init__(self, config: FacilitatorConfig | None = None):
        """Create HTTP facilitator client.
        
        Args:
            config: Optional configuration (uses defaults if not provided)
        """
        config = config or FacilitatorConfig()
        
        self._url = config.url.rstrip("/")
        self._timeout = config.timeout
        self._auth_provider = config.auth_provider
        self._identifier = config.identifier or self._url
        
        # Use provided client or create new one
        self._http_client = config.http_client
        self._owns_client = config.http_client is None

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client."""
        if self._http_client is None:
            self._http_client = httpx.AsyncClient(
                timeout=httpx.Timeout(self._timeout)
            )
        return self._http_client

    async def close(self) -> None:
        """Close HTTP client if we own it."""
        if self._owns_client and self._http_client:
            await self._http_client.aclose()
            self._http_client = None

    async def __aenter__(self) -> "HTTPFacilitatorClient":
        return self

    async def __aexit__(self, *args) -> None:
        await self.close()

    @property
    def url(self) -> str:
        """Get facilitator URL."""
        return self._url

    @property
    def identifier(self) -> str:
        """Get facilitator identifier."""
        return self._identifier

    # =========================================================================
    # FacilitatorClient Implementation
    # =========================================================================

    async def verify(
        self,
        payload: PaymentPayload,
        requirements: PaymentRequirements,
    ) -> VerifyResponse:
        """Verify a payment with the facilitator.
        
        Args:
            payload: Payment payload to verify
            requirements: Requirements to verify against
            
        Returns:
            VerifyResponse
            
        Raises:
            httpx.HTTPError: If request fails
            ValueError: If response is invalid
        """
        return await self._verify_http(
            payload.x402_version,
            payload.to_dict(),
            requirements.to_dict(),
        )

    async def settle(
        self,
        payload: PaymentPayload,
        requirements: PaymentRequirements,
    ) -> SettleResponse:
        """Settle a payment with the facilitator.
        
        Args:
            payload: Payment payload to settle
            requirements: Requirements for settlement
            
        Returns:
            SettleResponse
            
        Raises:
            httpx.HTTPError: If request fails
            ValueError: If response is invalid
        """
        return await self._settle_http(
            payload.x402_version,
            payload.to_dict(),
            requirements.to_dict(),
        )

    async def get_supported(self) -> SupportedResponse:
        """Get supported payment kinds and extensions.
        
        Returns:
            SupportedResponse
            
        Raises:
            httpx.HTTPError: If request fails
        """
        client = await self._get_client()
        
        headers = {"Content-Type": "application/json"}
        
        # Add auth headers
        if self._auth_provider:
            auth = await self._auth_provider.get_auth_headers()
            headers.update(auth.supported)
        
        response = await client.get(
            f"{self._url}/supported",
            headers=headers,
        )
        
        if response.status_code != 200:
            raise ValueError(
                f"Facilitator get_supported failed ({response.status_code}): "
                f"{response.text}"
            )
        
        data = response.json()
        return SupportedResponse.from_dict(data)

    # =========================================================================
    # Bytes-Based Methods (Network Boundary)
    # =========================================================================

    async def verify_from_bytes(
        self,
        payload_bytes: bytes,
        requirements_bytes: bytes,
    ) -> VerifyResponse:
        """Verify payment from raw JSON bytes.
        
        Operates at network boundary - detects version from bytes.
        
        Args:
            payload_bytes: JSON bytes of payment payload
            requirements_bytes: JSON bytes of requirements
            
        Returns:
            VerifyResponse
        """
        version = detect_version(payload_bytes)
        payload_dict = json.loads(payload_bytes)
        requirements_dict = json.loads(requirements_bytes)
        
        return await self._verify_http(version, payload_dict, requirements_dict)

    async def settle_from_bytes(
        self,
        payload_bytes: bytes,
        requirements_bytes: bytes,
    ) -> SettleResponse:
        """Settle payment from raw JSON bytes.
        
        Operates at network boundary - detects version from bytes.
        
        Args:
            payload_bytes: JSON bytes of payment payload
            requirements_bytes: JSON bytes of requirements
            
        Returns:
            SettleResponse
        """
        version = detect_version(payload_bytes)
        payload_dict = json.loads(payload_bytes)
        requirements_dict = json.loads(requirements_bytes)
        
        return await self._settle_http(version, payload_dict, requirements_dict)

    # =========================================================================
    # Internal HTTP Methods
    # =========================================================================

    async def _verify_http(
        self,
        version: int,
        payload_dict: dict[str, Any],
        requirements_dict: dict[str, Any],
    ) -> VerifyResponse:
        """Internal verify via HTTP."""
        client = await self._get_client()
        
        headers = {"Content-Type": "application/json"}
        
        if self._auth_provider:
            auth = await self._auth_provider.get_auth_headers()
            headers.update(auth.verify)
        
        request_body = {
            "x402Version": version,
            "paymentPayload": self._to_json_safe(payload_dict),
            "paymentRequirements": self._to_json_safe(requirements_dict),
        }
        
        response = await client.post(
            f"{self._url}/verify",
            headers=headers,
            json=request_body,
        )
        
        if response.status_code != 200:
            raise ValueError(
                f"Facilitator verify failed ({response.status_code}): "
                f"{response.text}"
            )
        
        data = response.json()
        return VerifyResponse.from_dict(data)

    async def _settle_http(
        self,
        version: int,
        payload_dict: dict[str, Any],
        requirements_dict: dict[str, Any],
    ) -> SettleResponse:
        """Internal settle via HTTP."""
        client = await self._get_client()
        
        headers = {"Content-Type": "application/json"}
        
        if self._auth_provider:
            auth = await self._auth_provider.get_auth_headers()
            headers.update(auth.settle)
        
        request_body = {
            "x402Version": version,
            "paymentPayload": self._to_json_safe(payload_dict),
            "paymentRequirements": self._to_json_safe(requirements_dict),
        }
        
        response = await client.post(
            f"{self._url}/settle",
            headers=headers,
            json=request_body,
        )
        
        if response.status_code != 200:
            raise ValueError(
                f"Facilitator settle failed ({response.status_code}): "
                f"{response.text}"
            )
        
        data = response.json()
        return SettleResponse.from_dict(data)

    @staticmethod
    def _to_json_safe(obj: Any) -> Any:
        """Convert object to JSON-safe format (handles bigints)."""
        return json.loads(
            json.dumps(obj, default=lambda x: str(x) if isinstance(x, int) and x > 2**53 else x)
        )
```

---

## Request/Response Format

### Verify Request

```json
{
  "x402Version": 2,
  "paymentPayload": {
    "x402Version": 2,
    "scheme": "exact",
    "network": "eip155:84532",
    "payload": { ... },
    "resource": { ... }
  },
  "paymentRequirements": {
    "scheme": "exact",
    "network": "eip155:84532",
    "asset": "0x...",
    "amount": "1000000",
    "payTo": "0x..."
  }
}
```

### Verify Response

```json
{
  "isValid": true,
  "payer": "0x...",
  "invalidReason": null
}
```

### Settle Response

```json
{
  "success": true,
  "transaction": "0x...",
  "network": "eip155:84532",
  "payer": "0x...",
  "errorReason": null
}
```

### Supported Response

```json
{
  "x402Version": 2,
  "kinds": [
    {
      "scheme": "exact",
      "network": "eip155:84532",
      "asset": "0x...",
      "extra": { "feePayer": null }
    }
  ],
  "extensions": ["signin-with-x"]
}
```

---

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         HTTPFacilitatorClient                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────┐         ┌──────────────────┐                          │
│  │  ResourceServer  │────────▶│ HTTPFacilitator  │                          │
│  └──────────────────┘         └──────────────────┘                          │
│           │                            │                                    │
│           │ verify(payload, reqs)      │                                    │
│           ▼                            │                                    │
│  ┌──────────────────┐                  │                                    │
│  │   Build Request  │                  │                                    │
│  │   + Auth Headers │                  │                                    │
│  └──────────────────┘                  │                                    │
│           │                            │                                    │
│           ▼                            │                                    │
│  ┌──────────────────┐                  │                                    │
│  │   POST /verify   │──────────────────┼──────▶ Facilitator Service         │
│  └──────────────────┘                  │        ┌────────────────────┐      │
│                                        │        │  Verify signature  │      │
│                                        │        │  Check nonce       │      │
│                                        │        │  Return isValid    │      │
│                                        │        └────────────────────┘      │
│           ◀────────────────────────────┼────────                            │
│  ┌──────────────────┐                  │                                    │
│  │  VerifyResponse  │                  │                                    │
│  └──────────────────┘                  │                                    │
│                                        │                                    │
│  ═══════════════════════════════════════════════════════════════════════    │
│                                        │                                    │
│  ┌──────────────────┐                  │                                    │
│  │   POST /settle   │──────────────────┼──────▶ Facilitator Service         │
│  └──────────────────┘                  │        ┌────────────────────┐      │
│                                        │        │  Execute transfer  │      │
│                                        │        │  Return tx hash    │      │
│                                        │        └────────────────────┘      │
│           ◀────────────────────────────┼────────                            │
│  ┌──────────────────┐                  │                                    │
│  │  SettleResponse  │                  │                                    │
│  └──────────────────┘                  │                                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Authentication Example

```python
from dataclasses import dataclass

@dataclass
class BearerTokenAuth:
    """Simple bearer token authentication."""
    token: str
    
    async def get_auth_headers(self) -> AuthHeaders:
        headers = {"Authorization": f"Bearer {self.token}"}
        return AuthHeaders(
            verify=headers,
            settle=headers,
            supported=headers,
        )


# Usage
config = FacilitatorConfig(
    url="https://my-facilitator.example.com",
    auth_provider=BearerTokenAuth(token="my-secret-token"),
)
client = HTTPFacilitatorClient(config)
```

---

## Testing Checklist

- [ ] Verify endpoint success response parsing
- [ ] Verify endpoint error response handling
- [ ] Settle endpoint success response parsing
- [ ] Settle endpoint error response handling
- [ ] GetSupported endpoint response parsing
- [ ] Authentication header injection
- [ ] Timeout handling
- [ ] BigInt serialization
- [ ] Version detection from bytes
- [ ] Context manager cleanup
- [ ] Custom httpx client support
- [ ] Default URL fallback

---

## Example Usage

```python
from x402.http import HTTPFacilitatorClient, FacilitatorConfig

# Default facilitator
async with HTTPFacilitatorClient() as client:
    # Get supported payment kinds
    supported = await client.get_supported()
    print(f"Supports: {[k.scheme for k in supported.kinds]}")
    
    # Verify payment
    verify_result = await client.verify(payment_payload, requirements)
    if verify_result.is_valid:
        print(f"Payment valid from {verify_result.payer}")
    
    # Settle payment
    settle_result = await client.settle(payment_payload, requirements)
    if settle_result.success:
        print(f"Settled: {settle_result.transaction}")


# Custom facilitator with auth
config = FacilitatorConfig(
    url="https://custom-facilitator.example.com",
    auth_provider=my_auth_provider,
    timeout=60.0,
)
client = HTTPFacilitatorClient(config)
```

