"""Client extensions for querying Bazaar discovery resources.

This module provides the `with_bazaar` function that extends a facilitator
client with discovery query functionality.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from x402.http.facilitator_client import HTTPFacilitatorClient


@dataclass
class ListDiscoveryResourcesParams:
    """Parameters for listing discovery resources.

    All parameters are optional and used for filtering/pagination.
    """

    type: str | None = None
    """Filter by protocol type (e.g., "http", "mcp").
    Currently, the only supported protocol type is "http".
    """

    limit: int | None = None
    """The number of discovered x402 resources to return per page."""

    offset: int | None = None
    """The offset of the first discovered x402 resource to return."""


@dataclass
class DiscoveryResource:
    """A discovered x402 resource from the bazaar."""

    url: str
    """The URL of the discovered resource."""

    type: str
    """The protocol type of the resource."""

    metadata: dict[str, Any] | None = None
    """Additional metadata about the resource."""


@dataclass
class DiscoveryResourcesResponse:
    """Response from listing discovery resources."""

    resources: list[DiscoveryResource]
    """The list of discovered resources."""

    total: int | None = None
    """Total count of resources matching the query."""

    limit: int | None = None
    """The limit used for this query."""

    offset: int | None = None
    """The offset used for this query."""


class BazaarDiscoveryExtension:
    """Bazaar discovery extension providing query functionality.

    This extension is attached to a facilitator client via `with_bazaar()`
    and provides methods to query discovery resources from the facilitator.
    """

    def __init__(self, client: HTTPFacilitatorClient) -> None:
        """Initialize the discovery extension.

        Args:
            client: The facilitator client to use for requests.
        """
        self._client = client

    def list_resources(
        self,
        params: ListDiscoveryResourcesParams | None = None,
    ) -> DiscoveryResourcesResponse:
        """List x402 discovery resources from the bazaar.

        Args:
            params: Optional filtering and pagination parameters.

        Returns:
            A response containing the discovery resources.

        Raises:
            ValueError: If the request fails.

        Example:
            ```python
            from x402.http import HTTPFacilitatorClient
            from x402.extensions.bazaar import with_bazaar

            client = with_bazaar(HTTPFacilitatorClient())
            resources = client.extensions.discovery.list_resources(
                ListDiscoveryResourcesParams(type="http", limit=10)
            )
            for resource in resources.resources:
                print(f"Resource: {resource.url}")
            ```
        """

        params = params or ListDiscoveryResourcesParams()

        # Build headers
        headers: dict[str, str] = {"Content-Type": "application/json"}

        # Add auth headers if available
        if self._client._auth_provider:
            # Use 'supported' auth as a reasonable default for discovery
            auth = self._client._auth_provider.get_auth_headers()
            headers.update(auth.supported)

        # Build query parameters
        query_params: dict[str, str] = {}
        if params.type is not None:
            query_params["type"] = params.type
        if params.limit is not None:
            query_params["limit"] = str(params.limit)
        if params.offset is not None:
            query_params["offset"] = str(params.offset)

        # Build endpoint URL
        endpoint = f"{self._client.url}/discovery/resources"

        # Get or create HTTP client
        http_client = self._client._get_client()

        response = http_client.get(
            endpoint,
            headers=headers,
            params=query_params if query_params else None,
        )

        if response.status_code != 200:
            raise ValueError(
                f"Facilitator listDiscoveryResources failed ({response.status_code}): {response.text}"
            )

        data = response.json()
        return _parse_discovery_resources_response(data)


class BazaarClientExtension:
    """Bazaar client extension interface providing discovery query functionality."""

    def __init__(self, client: HTTPFacilitatorClient) -> None:
        """Initialize the bazaar extension.

        Args:
            client: The facilitator client to use.
        """
        self.discovery = BazaarDiscoveryExtension(client)


class BazaarExtendedClient:
    """A facilitator client extended with bazaar discovery capabilities.

    This class wraps an HTTPFacilitatorClient and adds an `extensions`
    attribute containing bazaar functionality.
    """

    def __init__(self, client: HTTPFacilitatorClient) -> None:
        """Initialize the extended client.

        Args:
            client: The base facilitator client to extend.
        """
        self._client = client
        self.extensions = BazaarClientExtension(client)

    def __getattr__(self, name: str) -> Any:
        """Delegate attribute access to the wrapped client."""
        return getattr(self._client, name)

    def __enter__(self) -> BazaarExtendedClient:
        self._client.__enter__()
        return self

    def __exit__(self, *args: Any) -> None:
        self._client.__exit__(*args)


def with_bazaar(client: HTTPFacilitatorClient) -> BazaarExtendedClient:
    """Extend a facilitator client with Bazaar discovery query functionality.

    Args:
        client: The facilitator client to extend.

    Returns:
        The client extended with bazaar discovery capabilities.

    Example:
        ```python
        from x402.http import HTTPFacilitatorClient, FacilitatorConfig
        from x402.extensions.bazaar import with_bazaar, ListDiscoveryResourcesParams

        # Basic usage
        client = with_bazaar(HTTPFacilitatorClient())
        resources = client.extensions.discovery.list_resources()

        # With parameters
        resources = client.extensions.discovery.list_resources(
            ListDiscoveryResourcesParams(type="http", limit=10, offset=0)
        )

        # Access wrapped client methods
        supported = client.get_supported()
        ```
    """
    return BazaarExtendedClient(client)


def _parse_discovery_resources_response(
    data: dict[str, Any],
) -> DiscoveryResourcesResponse:
    """Parse discovery resources response from JSON data.

    Args:
        data: JSON response data.

    Returns:
        Parsed DiscoveryResourcesResponse.
    """
    resources = []
    for item in data.get("resources", []):
        resources.append(
            DiscoveryResource(
                url=item.get("url", ""),
                type=item.get("type", ""),
                metadata=item.get("metadata"),
            )
        )

    return DiscoveryResourcesResponse(
        resources=resources,
        total=data.get("total"),
        limit=data.get("limit"),
        offset=data.get("offset"),
    )
