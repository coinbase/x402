import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from x402.fastapi.middleware import require_payment
from x402.types import PaymentRequirements, PaymentRequiredResponse
import base64
import json


async def test_endpoint():
    return {"message": "success"}


def test_middleware_no_payment():
    app_with_middleware = FastAPI()
    app_with_middleware.get("/test")(test_endpoint)
    app_with_middleware.middleware("http")(
        require_payment(
            amount="$1.00",
            address="0x036CbD53842c5426634e7929541eC2318f3dCF7e",
            network_id="base-sepolia",
            description="Test payment",
        )
    )

    client = TestClient(app_with_middleware)
    response = client.get("/test")

    assert response.status_code == 402
    assert "paymentDetails" in response.json()
    assert response.json()["error"] == "X-PAYMENT header is required"


def test_middleware_invalid_payment():
    app_with_middleware = FastAPI()
    app_with_middleware.get("/test")(test_endpoint)
    app_with_middleware.middleware("http")(
        require_payment(
            amount="$1.00",
            address="0x036CbD53842c5426634e7929541eC2318f3dCF7e",
            network_id="base-sepolia",
            description="Test payment",
        )
    )

    client = TestClient(app_with_middleware)
    response = client.get("/test", headers={"X-PAYMENT": "invalid_payment"})

    assert response.status_code == 402
    assert "paymentDetails" in response.json()
    assert "Invalid payment:" in response.json()["error"]


def test_middleware_path_matching():
    app_with_middleware = FastAPI()
    app_with_middleware.get("/test")(test_endpoint)
    app_with_middleware.get("/unprotected")(test_endpoint)

    app_with_middleware.middleware("http")(
        require_payment(
            amount="$1.00",
            address="0x036CbD53842c5426634e7929541eC2318f3dCF7e",
            path="/test",
            network_id="base-sepolia",
            description="Test payment",
        )
    )

    client = TestClient(app_with_middleware)

    # Protected endpoint should require payment
    response = client.get("/test")
    assert response.status_code == 402

    # Unprotected endpoint should work without payment
    response = client.get("/unprotected")
    assert response.status_code == 200
    assert response.json() == {"message": "success"}


def test_middleware_path_list_matching():
    app_with_middleware = FastAPI()
    app_with_middleware.get("/test1")(test_endpoint)
    app_with_middleware.get("/test2")(test_endpoint)
    app_with_middleware.get("/unprotected")(test_endpoint)

    app_with_middleware.middleware("http")(
        require_payment(
            amount="$1.00",
            address="0x036CbD53842c5426634e7929541eC2318f3dCF7e",
            path=["/test1", "/test2"],
            network_id="base-sepolia",
            description="Test payment",
        )
    )

    client = TestClient(app_with_middleware)

    # Protected endpoints should require payment
    response = client.get("/test1")
    assert response.status_code == 402

    response = client.get("/test2")
    assert response.status_code == 402

    # Unprotected endpoint should work without payment
    response = client.get("/unprotected")
    assert response.status_code == 200
    assert response.json() == {"message": "success"}
