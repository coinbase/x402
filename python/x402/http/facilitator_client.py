"""HTTP-based facilitator client for x402 protocol.

Provides both async (HTTPFacilitatorClient) and sync (HTTPFacilitatorClientSync)
implementations for communicating with remote facilitator services.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Protocol

from ..schemas import (
    PaymentPayload,
    PaymentRequirements,
    SettleResponse,
    SupportedResponse,
    VerifyResponse,
)
from ..schemas.v1 import PaymentPayloadV1, PaymentRequirementsV1
from .constants import DEFAULT_FACILITATOR_URL

if TYPE_CHECKING:
    import httpx


# ============================================================================
# Auth Provider Protocol
# ============================================================================


@dataclass
class AuthHeaders:
    """Authentication headers for facilitator endpoints."""

    verify: dict[str, str] = field(default_factory=dict)
    settle: dict[str, str] = field(default_factory=dict)
    supported: dict[str, str] = field(default_factory=dict)


class AuthProvider(Protocol):
    """Generates authentication headers for facilitator requests."""

    def get_auth_headers(self) -> AuthHeaders:
        """Get authentication headers for each endpoint."""
        ...


class CreateHeadersAuthProvider:
    """AuthProvider that wraps a create_headers callable.

    Adapts the dict-style create_headers function (as used by CDP SDK)
    to the AuthProvider protocol.
    """

    def __init__(self, create_headers: Callable[[], dict[str, dict[str, str]]]) -> None:
        self._create_headers = create_headers

    def get_auth_headers(self) -> AuthHeaders:
        """Get authentication headers by calling the create_headers function."""
        result = self._create_headers()
        return AuthHeaders(
            verify=result.get("verify", {}),
            settle=result.get("settle", {}),
            supported=result.get("supported", result.get("list", {})),
        )


# ============================================================================
# FacilitatorClient Protocols
# ============================================================================


class FacilitatorClient(Protocol):
    """Protocol for async facilitator clients.

    Used by x402ResourceServer (async) to verify/settle payments.
    """

    async def verify(
        self,
        payload: PaymentPayload | PaymentPayloadV1,
        requirements: PaymentRequirements | PaymentRequirementsV1,
    ) -> VerifyResponse:
        """Verify a payment. Returns VerifyResponse with is_valid=False on failure."""
        ...

    async def settle(
        self,
        payload: PaymentPayload | PaymentPayloadV1,
        requirements: PaymentRequirements | PaymentRequirementsV1,
    ) -> SettleResponse:
        """Settle a payment. Returns SettleResponse with success=False on failure."""
        ...

    def get_supported(self) -> SupportedResponse:
        """Get supported payment kinds (sync - used during initialization)."""
        ...


class FacilitatorClientSync(Protocol):
    """Protocol for sync facilitator clients.

    Used by x402ResourceServerSync (sync) to verify/settle payments.
    """

    def verify(
        self,
        payload: PaymentPayload | PaymentPayloadV1,
        requirements: PaymentRequirements | PaymentRequirementsV1,
    ) -> VerifyResponse:
        """Verify a payment. Returns VerifyResponse with is_valid=False on failure."""
        ...

    def settle(
        self,
        payload: PaymentPayload | PaymentPayloadV1,
        requirements: PaymentRequirements | PaymentRequirementsV1,
    ) -> SettleResponse:
        """Settle a payment. Returns SettleResponse with success=False on failure."""
        ...

    def get_supported(self) -> SupportedResponse:
        """Get supported payment kinds."""
        ...


# ============================================================================
# Configuration
# ============================================================================


@dataclass
class FacilitatorConfig:
    """Configuration for HTTP facilitator client."""

    url: str = DEFAULT_FACILITATOR_URL
    timeout: float = 30.0
    http_client: Any = None  # Optional httpx.Client or httpx.AsyncClient
    auth_provider: AuthProvider | None = None
    identifier: str | None = None


# ============================================================================
# Base HTTP Facilitator Client (Shared Logic)
# ============================================================================


class _HTTPFacilitatorClientBase:
    """Base class with shared logic for HTTP facilitator clients."""

    def __init__(self, config: FacilitatorConfig | dict[str, Any] | None = None) -> None:
        """Create HTTP facilitator client.

        Args:
            config: Optional configuration. Accepts either:
                - FacilitatorConfig dataclass (recommended)
                - Dict with 'url' and optional 'create_headers'
                - None (uses defaults)
        """
        # Handle dict-style config
        if isinstance(config, dict):
            url = config.get("url", DEFAULT_FACILITATOR_URL)
            create_headers = config.get("create_headers")
            auth_provider = CreateHeadersAuthProvider(create_headers) if create_headers else None

            self._url = url.rstrip("/")
            self._timeout = 30.0
            self._auth_provider = auth_provider
            self._identifier = self._url
            self._http_client = None
            self._owns_client = True
        else:
            # Handle FacilitatorConfig dataclass or None
            config = config or FacilitatorConfig()

            self._url = config.url.rstrip("/")
            self._timeout = config.timeout
            self._auth_provider = config.auth_provider
            self._identifier = config.identifier or self._url
            self._http_client = config.http_client
            self._owns_client = config.http_client is None

    @property
    def url(self) -> str:
        """Get facilitator URL."""
        return self._url

    @property
    def identifier(self) -> str:
        """Get facilitator identifier."""
        return self._identifier

    @staticmethod
    def _to_json_safe(obj: Any) -> Any:
        """Convert object to JSON-safe format (handles bigints)."""
        return json.loads(
            json.dumps(
                obj,
                default=lambda x: str(x) if isinstance(x, int) and x > 2**53 else x,
            )
        )


# ============================================================================
# Async HTTP Facilitator Client (Default)
# ============================================================================


class HTTPFacilitatorClient(_HTTPFacilitatorClientBase):
    """Async HTTP-based facilitator client.

    Communicates with remote x402 facilitator services over HTTP using
    async httpx.AsyncClient. Use with x402ResourceServer (async).

    Example:
        ```python
        from x402.http import HTTPFacilitatorClient, FacilitatorConfig

        facilitator = HTTPFacilitatorClient(FacilitatorConfig(url="https://..."))

        # In async context
        result = await facilitator.verify(payload, requirements)
        ```
    """

    def _get_sync_client(self) -> httpx.Client:
        """Get or create sync HTTP client for get_supported (initialization)."""
        import httpx

        # Create temporary sync client for initialization
        return httpx.Client(timeout=self._timeout, follow_redirects=True)

    def _get_async_client(self) -> httpx.AsyncClient:
        """Get or create async HTTP client."""
        if self._http_client is None:
            import httpx

            self._http_client = httpx.AsyncClient(timeout=self._timeout, follow_redirects=True)
        return self._http_client

    async def aclose(self) -> None:
        """Close async HTTP client if we own it."""
        if self._owns_client and self._http_client:
            await self._http_client.aclose()
            self._http_client = None

    async def __aenter__(self) -> HTTPFacilitatorClient:
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.aclose()

    # =========================================================================
    # FacilitatorClient Implementation (Async)
    # =========================================================================

    async def verify(
        self,
        payload: PaymentPayload | PaymentPayloadV1,
        requirements: PaymentRequirements | PaymentRequirementsV1,
    ) -> VerifyResponse:
        """Verify a payment with the facilitator (async).

        Args:
            payload: Payment payload to verify.
            requirements: Requirements to verify against.

        Returns:
            VerifyResponse.

        Raises:
            httpx.HTTPError: If request fails.
            ValueError: If response is invalid.
        """
        return await self._verify_http(
            payload.x402_version,
            payload.model_dump(by_alias=True, exclude_none=True),
            requirements.model_dump(by_alias=True, exclude_none=True),
        )

    async def settle(
        self,
        payload: PaymentPayload | PaymentPayloadV1,
        requirements: PaymentRequirements | PaymentRequirementsV1,
    ) -> SettleResponse:
        """Settle a payment with the facilitator (async).

        Args:
            payload: Payment payload to settle.
            requirements: Requirements for settlement.

        Returns:
            SettleResponse.

        Raises:
            httpx.HTTPError: If request fails.
            ValueError: If response is invalid.
        """
        return await self._settle_http(
            payload.x402_version,
            payload.model_dump(by_alias=True, exclude_none=True),
            requirements.model_dump(by_alias=True, exclude_none=True),
        )

    def get_supported(self) -> SupportedResponse:
        """Get supported payment kinds and extensions.

        Note: This is sync because it's called during initialization.

        Returns:
            SupportedResponse.

        Raises:
            httpx.HTTPError: If request fails.
        """
        # Use sync client for initialization (called from sync initialize())
        with self._get_sync_client() as client:
            headers = {"Content-Type": "application/json"}

            if self._auth_provider:
                auth = self._auth_provider.get_auth_headers()
                headers.update(auth.supported)

            response = client.get(f"{self._url}/supported", headers=headers)

            if response.status_code != 200:
                raise ValueError(
                    f"Facilitator get_supported failed ({response.status_code}): {response.text}"
                )

            data = response.json()
            return SupportedResponse.model_validate(data)

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
            payload_bytes: JSON bytes of payment payload.
            requirements_bytes: JSON bytes of requirements.

        Returns:
            VerifyResponse.
        """
        from ..schemas.helpers import detect_version

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
            payload_bytes: JSON bytes of payment payload.
            requirements_bytes: JSON bytes of requirements.

        Returns:
            SettleResponse.
        """
        from ..schemas.helpers import detect_version

        version = detect_version(payload_bytes)
        payload_dict = json.loads(payload_bytes)
        requirements_dict = json.loads(requirements_bytes)

        return await self._settle_http(version, payload_dict, requirements_dict)

    # =========================================================================
    # Internal HTTP Methods (Async)
    # =========================================================================

    async def _verify_http(
        self,
        version: int,
        payload_dict: dict[str, Any],
        requirements_dict: dict[str, Any],
    ) -> VerifyResponse:
        """Internal verify via HTTP (async)."""
        client = self._get_async_client()

        headers = {"Content-Type": "application/json"}

        if self._auth_provider:
            auth = self._auth_provider.get_auth_headers()
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
            raise ValueError(f"Facilitator verify failed ({response.status_code}): {response.text}")

        data = response.json()
        return VerifyResponse.model_validate(data)

    async def _settle_http(
        self,
        version: int,
        payload_dict: dict[str, Any],
        requirements_dict: dict[str, Any],
    ) -> SettleResponse:
        """Internal settle via HTTP (async)."""
        client = self._get_async_client()

        headers = {"Content-Type": "application/json"}

        if self._auth_provider:
            auth = self._auth_provider.get_auth_headers()
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
            raise ValueError(f"Facilitator settle failed ({response.status_code}): {response.text}")

        data = response.json()
        return SettleResponse.model_validate(data)


# ============================================================================
# Sync HTTP Facilitator Client
# ============================================================================


class HTTPFacilitatorClientSync(_HTTPFacilitatorClientBase):
    """Sync HTTP-based facilitator client.

    Communicates with remote x402 facilitator services over HTTP using
    sync httpx.Client. Use with x402ResourceServerSync (sync).

    Example:
        ```python
        from x402.http import HTTPFacilitatorClientSync, FacilitatorConfig

        facilitator = HTTPFacilitatorClientSync(FacilitatorConfig(url="https://..."))

        # Sync usage
        result = facilitator.verify(payload, requirements)
        ```
    """

    def _get_client(self) -> httpx.Client:
        """Get or create HTTP client."""
        if self._http_client is None:
            import httpx

            self._http_client = httpx.Client(timeout=self._timeout, follow_redirects=True)
        return self._http_client

    def close(self) -> None:
        """Close HTTP client if we own it."""
        if self._owns_client and self._http_client:
            self._http_client.close()
            self._http_client = None

    def __enter__(self) -> HTTPFacilitatorClientSync:
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()

    # =========================================================================
    # FacilitatorClientSync Implementation
    # =========================================================================

    def verify(
        self,
        payload: PaymentPayload | PaymentPayloadV1,
        requirements: PaymentRequirements | PaymentRequirementsV1,
    ) -> VerifyResponse:
        """Verify a payment with the facilitator.

        Args:
            payload: Payment payload to verify.
            requirements: Requirements to verify against.

        Returns:
            VerifyResponse.

        Raises:
            httpx.HTTPError: If request fails.
            ValueError: If response is invalid.
        """
        return self._verify_http(
            payload.x402_version,
            payload.model_dump(by_alias=True, exclude_none=True),
            requirements.model_dump(by_alias=True, exclude_none=True),
        )

    def settle(
        self,
        payload: PaymentPayload | PaymentPayloadV1,
        requirements: PaymentRequirements | PaymentRequirementsV1,
    ) -> SettleResponse:
        """Settle a payment with the facilitator.

        Args:
            payload: Payment payload to settle.
            requirements: Requirements for settlement.

        Returns:
            SettleResponse.

        Raises:
            httpx.HTTPError: If request fails.
            ValueError: If response is invalid.
        """
        return self._settle_http(
            payload.x402_version,
            payload.model_dump(by_alias=True, exclude_none=True),
            requirements.model_dump(by_alias=True, exclude_none=True),
        )

    def get_supported(self) -> SupportedResponse:
        """Get supported payment kinds and extensions.

        Returns:
            SupportedResponse.

        Raises:
            httpx.HTTPError: If request fails.
        """
        client = self._get_client()

        headers = {"Content-Type": "application/json"}

        if self._auth_provider:
            auth = self._auth_provider.get_auth_headers()
            headers.update(auth.supported)

        response = client.get(f"{self._url}/supported", headers=headers)

        if response.status_code != 200:
            raise ValueError(
                f"Facilitator get_supported failed ({response.status_code}): {response.text}"
            )

        data = response.json()
        return SupportedResponse.model_validate(data)

    # =========================================================================
    # Bytes-Based Methods (Network Boundary)
    # =========================================================================

    def verify_from_bytes(
        self,
        payload_bytes: bytes,
        requirements_bytes: bytes,
    ) -> VerifyResponse:
        """Verify payment from raw JSON bytes.

        Operates at network boundary - detects version from bytes.

        Args:
            payload_bytes: JSON bytes of payment payload.
            requirements_bytes: JSON bytes of requirements.

        Returns:
            VerifyResponse.
        """
        from ..schemas.helpers import detect_version

        version = detect_version(payload_bytes)
        payload_dict = json.loads(payload_bytes)
        requirements_dict = json.loads(requirements_bytes)

        return self._verify_http(version, payload_dict, requirements_dict)

    def settle_from_bytes(
        self,
        payload_bytes: bytes,
        requirements_bytes: bytes,
    ) -> SettleResponse:
        """Settle payment from raw JSON bytes.

        Operates at network boundary - detects version from bytes.

        Args:
            payload_bytes: JSON bytes of payment payload.
            requirements_bytes: JSON bytes of requirements.

        Returns:
            SettleResponse.
        """
        from ..schemas.helpers import detect_version

        version = detect_version(payload_bytes)
        payload_dict = json.loads(payload_bytes)
        requirements_dict = json.loads(requirements_bytes)

        return self._settle_http(version, payload_dict, requirements_dict)

    # =========================================================================
    # Internal HTTP Methods
    # =========================================================================

    def _verify_http(
        self,
        version: int,
        payload_dict: dict[str, Any],
        requirements_dict: dict[str, Any],
    ) -> VerifyResponse:
        """Internal verify via HTTP."""
        client = self._get_client()

        headers = {"Content-Type": "application/json"}

        if self._auth_provider:
            auth = self._auth_provider.get_auth_headers()
            headers.update(auth.verify)

        request_body = {
            "x402Version": version,
            "paymentPayload": self._to_json_safe(payload_dict),
            "paymentRequirements": self._to_json_safe(requirements_dict),
        }

        response = client.post(
            f"{self._url}/verify",
            headers=headers,
            json=request_body,
        )

        if response.status_code != 200:
            raise ValueError(f"Facilitator verify failed ({response.status_code}): {response.text}")

        data = response.json()
        return VerifyResponse.model_validate(data)

    def _settle_http(
        self,
        version: int,
        payload_dict: dict[str, Any],
        requirements_dict: dict[str, Any],
    ) -> SettleResponse:
        """Internal settle via HTTP."""
        client = self._get_client()

        headers = {"Content-Type": "application/json"}

        if self._auth_provider:
            auth = self._auth_provider.get_auth_headers()
            headers.update(auth.settle)

        request_body = {
            "x402Version": version,
            "paymentPayload": self._to_json_safe(payload_dict),
            "paymentRequirements": self._to_json_safe(requirements_dict),
        }

        response = client.post(
            f"{self._url}/settle",
            headers=headers,
            json=request_body,
        )

        if response.status_code != 200:
            raise ValueError(f"Facilitator settle failed ({response.status_code}): {response.text}")

        data = response.json()
        return SettleResponse.model_validate(data)
