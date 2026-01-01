from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from x402.fastapi.middleware import require_payment


async def mock_endpoint():
    return {"message": "success"}


def test_dynamic_price_hook():
    app = FastAPI()

    async def get_price(request: Request):
        # Manual path parsing since path_params are not available in middleware
        if "/items/premium" in request.url.path:
            return "$10.00"
        return "$1.00"

    app.get("/items/{item_id}")(mock_endpoint)
    app.middleware("http")(
        require_payment(
            price=get_price,
            pay_to_address="0x1111111111111111111111111111111111111111",
            network="base-sepolia",
            description="Dynamic item",
        )
    )

    client = TestClient(app)

    # Test standard item
    response = client.get("/items/standard")
    assert response.status_code == 402
    # 1.00 USD on base-sepolia (USDC 6 decimals) -> 1,000,000
    assert response.json()["accepts"][0]["maxAmountRequired"] == "1000000"

    # Test premium item
    response = client.get("/items/premium")
    assert response.status_code == 402
    assert response.json()["accepts"][0]["maxAmountRequired"] == "10000000"


def test_dynamic_description_hook():
    app = FastAPI()

    async def get_desc(request: Request):
        item_id = request.url.path.split("/")[-1]
        return f"Buying item {item_id}"

    app.get("/items/{item_id}")(mock_endpoint)
    app.middleware("http")(
        require_payment(
            price="$1.00",
            pay_to_address="0x1111111111111111111111111111111111111111",
            network="base-sepolia",
            description=get_desc,
        )
    )

    client = TestClient(app)

    response = client.get("/items/apple")
    assert response.status_code == 402
    assert response.json()["accepts"][0]["description"] == "Buying item apple"

    response = client.get("/items/orange")
    assert response.status_code == 402
    assert response.json()["accepts"][0]["description"] == "Buying item orange"


def test_hook_failure_returns_500():
    app = FastAPI()

    async def failing_hook(request: Request):
        raise ValueError("Something went wrong")

    app.get("/test")(mock_endpoint)
    app.middleware("http")(
        require_payment(
            price=failing_hook,
            pay_to_address="0x1111111111111111111111111111111111111111",
            network="base-sepolia",
        )
    )

    client = TestClient(app)
    response = client.get("/test")
    assert response.status_code == 500
    assert "error" in response.json()


def test_dynamic_resource_hook():
    """Test that resource can be dynamically generated from request."""
    app = FastAPI()

    async def get_resource(request: Request):
        item_id = request.url.path.split("/")[-1]
        return f"https://example.com/items/{item_id}"

    app.get("/items/{item_id}")(mock_endpoint)
    app.middleware("http")(
        require_payment(
            price="$1.00",
            pay_to_address="0x1111111111111111111111111111111111111111",
            network="base-sepolia",
            resource=get_resource,
        )
    )

    client = TestClient(app)

    response = client.get("/items/abc123")
    assert response.status_code == 402
    assert (
        response.json()["accepts"][0]["resource"]
        == "https://example.com/items/abc123"
    )


def test_hook_with_invalid_price_format():
    """Test that hooks returning invalid price formats are handled properly."""
    app = FastAPI()

    async def invalid_price_hook(request: Request):
        return "not-a-valid-price"

    app.get("/test")(mock_endpoint)
    app.middleware("http")(
        require_payment(
            price=invalid_price_hook,
            pay_to_address="0x1111111111111111111111111111111111111111",
            network="base-sepolia",
        )
    )

    client = TestClient(app)
    response = client.get("/test")
    assert response.status_code == 500
    assert "error" in response.json()


def test_hook_timeout():
    """Test that hooks exceeding timeout are handled properly."""
    import asyncio

    app = FastAPI()

    async def slow_hook(request: Request):
        await asyncio.sleep(10)
        return "$1.00"

    app.get("/test")(mock_endpoint)
    app.middleware("http")(
        require_payment(
            price=slow_hook,
            pay_to_address="0x1111111111111111111111111111111111111111",
            network="base-sepolia",
        )
    )

    client = TestClient(app)
    response = client.get("/test")
    assert response.status_code == 500
    assert "error" in response.json()
    assert "timeout" in response.json()["error"].lower()


def test_hook_returns_none():
    """Test that hooks returning None are handled properly."""
    app = FastAPI()

    async def none_hook(request: Request):
        return None

    app.get("/test")(mock_endpoint)
    app.middleware("http")(
        require_payment(
            price=none_hook,
            pay_to_address="0x1111111111111111111111111111111111111111",
            network="base-sepolia",
        )
    )

    client = TestClient(app)
    response = client.get("/test")
    assert response.status_code == 500


def test_concurrent_requests_with_different_prices():
    """Test that concurrent requests get correct independent pricing."""
    import asyncio
    from concurrent.futures import ThreadPoolExecutor

    app = FastAPI()

    async def get_price(request: Request):
        if "expensive" in request.url.path:
            return "$100.00"
        return "$1.00"

    app.get("/items/{item_id}")(mock_endpoint)
    app.middleware("http")(
        require_payment(
            price=get_price,
            pay_to_address="0x1111111111111111111111111111111111111111",
            network="base-sepolia",
        )
    )

    client = TestClient(app)

    def make_request(path):
        return client.get(path)

    with ThreadPoolExecutor(max_workers=2) as executor:
        future1 = executor.submit(make_request, "/items/cheap")
        future2 = executor.submit(make_request, "/items/expensive")

        response1 = future1.result()
        response2 = future2.result()

    assert response1.status_code == 402
    assert response2.status_code == 402
    assert response1.json()["accepts"][0]["maxAmountRequired"] == "1000000"
    assert response2.json()["accepts"][0]["maxAmountRequired"] == "100000000"


def test_all_hooks_combined():
    """Test using price, description, and resource hooks simultaneously."""
    app = FastAPI()

    async def get_price(request: Request):
        return "$5.00"

    async def get_description(request: Request):
        item = request.url.path.split("/")[-1]
        return f"Payment for {item}"

    async def get_resource(request: Request):
        return f"custom-resource://{request.url.path}"

    app.get("/items/{item_id}")(mock_endpoint)
    app.middleware("http")(
        require_payment(
            price=get_price,
            pay_to_address="0x1111111111111111111111111111111111111111",
            network="base-sepolia",
            description=get_description,
            resource=get_resource,
        )
    )

    client = TestClient(app)
    response = client.get("/items/widget")

    assert response.status_code == 402
    payment_info = response.json()["accepts"][0]
    assert payment_info["maxAmountRequired"] == "5000000"
    assert payment_info["description"] == "Payment for widget"
    assert payment_info["resource"] == "custom-resource:///items/widget"
