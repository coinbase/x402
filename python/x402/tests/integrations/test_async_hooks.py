import asyncio

from x402 import x402Facilitator, x402ResourceServer
from x402.http import (
    HTTPRequestContext,
    decode_payment_required_header,
    x402HTTPResourceServer,
)

from ..mocks import (
    CashFacilitatorClient,
    CashSchemeNetworkFacilitator,
    CashSchemeNetworkServer,
)


class MockHTTPAdapter:
    def __init__(self, path="/", method="GET", query_params=None, headers=None):
        self.path = path
        self.method = method
        self._query_params = query_params or {}
        self._headers = headers or {}

    def get_header(self, name):
        return self._headers.get(name.lower())

    def get_method(self):
        return self.method

    def get_path(self):
        return self.path

    def get_url(self):
        return f"https://example.com{self.path}"

    def get_accept_header(self):
        return "application/json"

    def get_user_agent(self):
        return "Test"

    def get_query_params(self):
        return self._query_params

    def get_query_param(self, name):
        return self._query_params.get(name)

    def get_body(self):
        return None


class TestAsyncHooks:
    def setup_method(self):
        self.facilitator = x402Facilitator().register(
            ["x402:cash"], CashSchemeNetworkFacilitator()
        )
        facilitator_client = CashFacilitatorClient(self.facilitator)
        self.resource_server = x402ResourceServer(facilitator_client)
        self.resource_server.register("x402:cash", CashSchemeNetworkServer())
        self.resource_server.initialize()

    def test_async_price_resolution(self):
        """Test that price hook can be truly asynchronous."""

        async def slow_price(context):
            await asyncio.sleep(0.1)  # Actual async work
            return "$5.00"

        routes = {
            "GET /test": {
                "accepts": {
                    "scheme": "cash",
                    "network": "x402:cash",
                    "payTo": "merchant@example.com",
                    "price": slow_price,
                }
            }
        }
        http_server = x402HTTPResourceServer(self.resource_server, routes)
        context = HTTPRequestContext(
            adapter=MockHTTPAdapter(path="/test"), path="/test", method="GET"
        )

        result = asyncio.run(http_server.process_http_request(context))
        assert result.type == "payment-error"
        payment_required = decode_payment_required_header(
            result.response.headers["PAYMENT-REQUIRED"]
        )
        assert payment_required.accepts[0].amount == "5.00"

    def test_hook_timeout_handling(self):
        """Test that slow hooks are timed out properly."""

        async def infinite_loop_hook(context):
            await asyncio.sleep(10)  # Longer than 5s default timeout
            return "$1.00"

        routes = {
            "GET /timeout": {
                "accepts": {
                    "scheme": "cash",
                    "network": "x402:cash",
                    "payTo": "m@e.com",
                    "price": infinite_loop_hook,
                },
            }
        }
        http_server = x402HTTPResourceServer(self.resource_server, routes)
        context = HTTPRequestContext(
            adapter=MockHTTPAdapter(path="/timeout"), path="/timeout", method="GET"
        )

        result = asyncio.run(http_server.process_http_request(context))
        assert result.type == "payment-error"
        assert result.response.status == 500
        assert "timed out" in result.response.body["error"].lower()

    def test_sync_hook_backward_compatibility(self):
        """Test that synchronous hooks still work (backward compatibility)."""

        def sync_price(context):  # Non-async function
            return "$3.00"

        def sync_pay_to(context):  # Non-async function
            return "sync-merchant@example.com"

        routes = {
            "GET /sync": {
                "accepts": {
                    "scheme": "cash",
                    "network": "x402:cash",
                    "payTo": sync_pay_to,
                    "price": sync_price,
                }
            }
        }
        http_server = x402HTTPResourceServer(self.resource_server, routes)
        context = HTTPRequestContext(
            adapter=MockHTTPAdapter(path="/sync"), path="/sync", method="GET"
        )

        result = asyncio.run(http_server.process_http_request(context))
        assert result.type == "payment-error"
        payment_required = decode_payment_required_header(
            result.response.headers["PAYMENT-REQUIRED"]
        )
        assert payment_required.accepts[0].amount == "3.00"
        assert payment_required.accepts[0].pay_to == "sync-merchant@example.com"

    def test_mixed_sync_async_hooks(self):
        """Test mixing sync and async hooks in the same route."""

        async def async_price(context):
            await asyncio.sleep(0.05)
            return "$2.50"

        def sync_pay_to(context):  # Synchronous function
            return "mixed@example.com"

        routes = {
            "GET /mixed": {
                "accepts": {
                    "scheme": "cash",
                    "network": "x402:cash",
                    "payTo": sync_pay_to,
                    "price": async_price,
                }
            }
        }
        http_server = x402HTTPResourceServer(self.resource_server, routes)
        context = HTTPRequestContext(
            adapter=MockHTTPAdapter(path="/mixed"), path="/mixed", method="GET"
        )

        result = asyncio.run(http_server.process_http_request(context))
        assert result.type == "payment-error"
        payment_required = decode_payment_required_header(
            result.response.headers["PAYMENT-REQUIRED"]
        )
        assert payment_required.accepts[0].amount == "2.50"

    def test_hook_raises_exception(self):
        """Test that hooks raising exceptions are handled gracefully."""

        async def failing_hook(context):
            raise ValueError("Intentional error for testing")

        routes = {
            "GET /error": {
                "accepts": {
                    "scheme": "cash",
                    "network": "x402:cash",
                    "payTo": "m@e.com",
                    "price": failing_hook,
                },
            }
        }
        http_server = x402HTTPResourceServer(self.resource_server, routes)
        context = HTTPRequestContext(
            adapter=MockHTTPAdapter(path="/error"), path="/error", method="GET"
        )

        result = asyncio.run(http_server.process_http_request(context))
        assert result.type == "payment-error"
        assert result.response.status == 500
        # Ensure error message is sanitized
        assert "Failed to process request" in result.response.body["error"]

    def test_custom_timeout_configuration(self):
        """Test that custom timeout can be configured per route."""

        async def slow_hook(context):
            await asyncio.sleep(0.5)  # 0.5 seconds
            return "$1.00"

        routes = {
            "GET /custom-timeout": {
                "accepts": {
                    "scheme": "cash",
                    "network": "x402:cash",
                    "payTo": "m@e.com",
                    "price": slow_hook,
                },
                "hook_timeout_seconds": 0.2,  # 0.2 second timeout
            }
        }
        http_server = x402HTTPResourceServer(self.resource_server, routes)
        context = HTTPRequestContext(
            adapter=MockHTTPAdapter(path="/custom-timeout"),
            path="/custom-timeout",
            method="GET",
        )

        result = asyncio.run(http_server.process_http_request(context))
        # Hook takes 0.5s but timeout is 0.2s -> should timeout
        assert result.type == "payment-error"
        assert result.response.status == 500
        assert "timed out" in result.response.body["error"].lower()
