from typing import Optional, Dict, List
from httpx import Request, Response, AsyncClient
from eth_account import Account
from x402.clients.base import (
    x402Client,
    MissingRequestConfigError,
    PaymentError,
    PaymentSelectorCallable,
)
from x402.types import x402PaymentRequiredResponse


class HttpxHooks:
    def __init__(self, client: x402Client, httpx_client: Optional[AsyncClient] = None):
        self.client = client
        self.httpx_client = httpx_client  # Reference to the httpx client with hooks
        self._is_retry = False

    async def on_request(self, request: Request):
        """Handle request before it is sent."""
        pass

    async def on_response(self, response: Response) -> Response:
        """Handle response after it is received."""

        # If this is not a 402, just return the response
        if response.status_code != 402:
            return response

        # If this is a retry response, just return it
        if self._is_retry:
            self._is_retry = False
            return response

        try:
            if not response.request:
                raise MissingRequestConfigError("Missing request configuration")

            # Read the response content before parsing
            await response.aread()

            data = response.json()

            payment_response = x402PaymentRequiredResponse(**data)

            # Select payment requirements
            selected_requirements = self.client.select_payment_requirements(
                payment_response.accepts
            )

            # Create payment header
            payment_header = self.client.create_payment_header(
                selected_requirements, payment_response.x402_version
            )

            # Mark as retry and add payment header
            self._is_retry = True
            request = response.request

            request.headers["X-Payment"] = payment_header
            request.headers["Access-Control-Expose-Headers"] = "X-Payment-Response"

            # Retry the request using the same client (which has hooks) if available
            if self.httpx_client:
                retry_response = await self.httpx_client.send(request)
            else:
                # Fallback: create new client (less ideal but maintains backwards compatibility)
                async with AsyncClient() as client:
                    retry_response = await client.send(request)

            # Copy the retry response data to the original response
            response.status_code = retry_response.status_code
            response.headers = retry_response.headers
            response._content = retry_response._content
            return response

        except PaymentError as e:
            self._is_retry = False
            raise e
        except Exception as e:
            self._is_retry = False
            # Get detailed error info
            error_msg = str(e) if str(e) else repr(e)
            error_type = type(e).__name__
            raise PaymentError(
                f"Failed to handle payment: {error_type}: {error_msg}"
            ) from e


def x402_payment_hooks(
    account: Account,
    max_value: Optional[int] = None,
    payment_requirements_selector: Optional[PaymentSelectorCallable] = None,
    httpx_client: Optional[AsyncClient] = None,
) -> Dict[str, List]:
    """Create httpx event hooks dictionary for handling 402 Payment Required responses.

    Args:
        account: eth_account.Account instance for signing payments
        max_value: Optional maximum allowed payment amount in base units
        payment_requirements_selector: Optional custom selector for payment requirements.
            Should be a callable that takes (accepts, network_filter, scheme_filter, max_value)
            and returns a PaymentRequirements object.
        httpx_client: Optional AsyncClient instance to reuse for retries (recommended)

    Returns:
        Dictionary of event hooks that can be directly assigned to client.event_hooks
    """
    # Create x402Client
    client = x402Client(
        account,
        max_value=max_value,
        payment_requirements_selector=payment_requirements_selector,
    )

    # Create hooks with reference to httpx client for proper retry handling
    hooks = HttpxHooks(client, httpx_client=httpx_client)

    # Return event hooks dictionary
    return {
        "request": [hooks.on_request],
        "response": [hooks.on_response],
    }


class x402HttpxClient(AsyncClient):
    """AsyncClient with built-in x402 payment handling."""

    def __init__(
        self,
        account: Account,
        max_value: Optional[int] = None,
        payment_requirements_selector: Optional[PaymentSelectorCallable] = None,
        **kwargs,
    ):
        """Initialize an AsyncClient with x402 payment handling.

        Args:
            account: eth_account.Account instance for signing payments
            max_value: Optional maximum allowed payment amount in base units
            payment_requirements_selector: Optional custom selector for payment requirements.
                Should be a callable that takes (accepts, network_filter, scheme_filter, max_value)
                and returns a PaymentRequirements object.
            **kwargs: Additional arguments to pass to AsyncClient
        """
        super().__init__(**kwargs)

        # Create x402Client
        client = x402Client(
            account,
            max_value=max_value,
            payment_requirements_selector=payment_requirements_selector,
        )

        # Create hooks with reference to this httpx client so retries use the same client with hooks
        hooks = HttpxHooks(client, httpx_client=self)

        # Install hooks
        self.event_hooks = {
            "request": [hooks.on_request],
            "response": [hooks.on_response],
        }
