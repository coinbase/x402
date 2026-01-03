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
    def __init__(self, path="/", method="GET"):
        self.path = path
        self.method = method

    def get_header(self, name):
        return None

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
        return {}

    def get_query_param(self, name):
        return None

    def get_body(self):
        return None


class TestAsyncHooks:
    def setup_method(self):
        facilitator = x402Facilitator().register(
            ["x402:cash"], CashSchemeNetworkFacilitator()
        )
        facilitator_client = CashFacilitatorClient(facilitator)
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

    def test_async_description_and_resource_resolution(self):
        """Test that description and resource hooks can be asynchronous."""

        async def get_desc(context):
            return "Async Description"

        async def get_res(context):
            return "https://async.resource.com"

        routes = {
            "GET /test": {
                "accepts": {
                    "scheme": "cash",
                    "network": "x402:cash",
                    "payTo": "m@e.com",
                    "price": "$1",
                },
                "description": get_desc,
                "resource": get_res,
            }
        }
        http_server = x402HTTPResourceServer(self.resource_server, routes)
        context = HTTPRequestContext(
            adapter=MockHTTPAdapter(path="/test"), path="/test", method="GET"
        )

        result = asyncio.run(http_server.process_http_request(context))
        payment_required = decode_payment_required_header(
            result.response.headers["PAYMENT-REQUIRED"]
        )
        assert payment_required.resource.description == "Async Description"
        assert payment_required.resource.url == "https://async.resource.com"

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
