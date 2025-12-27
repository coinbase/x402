"""CDP Facilitator configuration for x402."""

import os

import httpx
from cdp.auth.utils.http import (
    GetAuthHeadersOptions,
    _get_correlation_data,
    get_auth_headers,
)
from x402.http import AuthHeaders, AuthProvider, FacilitatorConfig


class CDPAuthProvider(AuthProvider):
    """CDP authentication provider using JWT tokens."""

    def __init__(self, api_key_id: str, api_key_secret: str):
        self.api_key_id = api_key_id
        self.api_key_secret = api_key_secret
        self.get_auth_headers_func = get_auth_headers
        self.GetAuthHeadersOptions = GetAuthHeadersOptions
        self._get_correlation_data = _get_correlation_data
        self.request_host = "api.cdp.coinbase.com"
        self.base_path = "/platform/v2/x402"

    def get_auth_headers(self) -> AuthHeaders:
        """Generate CDP JWT authentication headers."""
        # Generate JWT for verify endpoint
        verify_headers = self.get_auth_headers_func(
            self.GetAuthHeadersOptions(
                api_key_id=self.api_key_id,
                api_key_secret=self.api_key_secret,
                request_host=self.request_host,
                request_path=f"{self.base_path}/verify",
                request_method="POST",
                source="x402",
                source_version="0.6.1",
            )
        )

        # Generate JWT for settle endpoint
        settle_headers = self.get_auth_headers_func(
            self.GetAuthHeadersOptions(
                api_key_id=self.api_key_id,
                api_key_secret=self.api_key_secret,
                request_host=self.request_host,
                request_path=f"{self.base_path}/settle",
                request_method="POST",
                source="x402",
                source_version="0.6.1",
            )
        )

        # Generate JWT for supported endpoint
        supported_headers = self.get_auth_headers_func(
            self.GetAuthHeadersOptions(
                api_key_id=self.api_key_id,
                api_key_secret=self.api_key_secret,
                request_host=self.request_host,
                request_path=f"{self.base_path}/supported",
                request_method="GET",
                source="x402",
                source_version="0.6.1",
            )
        )

        return AuthHeaders(
            verify=verify_headers,
            settle=settle_headers,
            supported=supported_headers,
        )


def create_facilitator_config(
    http_client: httpx.Client | None = None,
    cdp_api_key_id: str | None = None,
    cdp_api_key_secret: str | None = None,
) -> FacilitatorConfig:
    """Create facilitator configuration.

    Args:
        http_client: HTTP client to use (creates one if not provided)
        cdp_api_key_id: CDP API key ID (reads from env if not provided)
        cdp_api_key_secret: CDP API key secret (reads from env if not provided)

    Returns:
        FacilitatorConfig for Coinbase or local facilitator
    """
    if http_client is None:
        http_client = httpx.Client(follow_redirects=True)

    # Try to get CDP keys from args or environment
    api_key_id = cdp_api_key_id or os.getenv("CDP_API_KEY_ID")
    api_key_secret = cdp_api_key_secret or os.getenv("CDP_API_KEY_SECRET")

    if api_key_id and api_key_secret:
        print("Using Coinbase facilitator with CDP authentication")
        return FacilitatorConfig(
            url="https://api.cdp.coinbase.com/platform/v2/x402",
            auth_provider=CDPAuthProvider(api_key_id, api_key_secret),
            http_client=http_client,
        )
    else:
        raise ValueError(
            "Missing CDP credentials (CDP_API_KEY_ID, CDP_API_KEY_SECRET). "
            "These are required for the Mainnet example."
        )
