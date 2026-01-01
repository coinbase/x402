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
