from unittest.mock import AsyncMock, patch
from fastapi import FastAPI
from fastapi.testclient import TestClient
from x402.fastapi.middleware import require_payment
import base64
import json


async def protected_endpoint():
    return {"secret": "This is paid content worth $$$", "data": "sensitive_info"}


def create_mock_payment_header():
    mock_payment = {
        "x402Version": 1,
        "scheme": "exact",
        "network": "base-sepolia",
        "payload": {
            "signature": "0x" + "a" * 130, 
            "authorization": {
                "from": "0x1234567890123456789012345678901234567890",
                "to": "0x1111111111111111111111111111111111111111",
                "value": "1000000",
                "validAfter": "0",
                "validBefore": "9999999999",
                "nonce": "0x" + "1" * 64,
            }
        }
    }
    return base64.b64encode(json.dumps(mock_payment).encode()).decode()


def test_settlement_failure_does_not_leak_content():
    with patch("x402.fastapi.middleware.FacilitatorClient") as MockFacilitator:
        mock_facilitator_instance = MockFacilitator.return_value

        mock_verify_response = AsyncMock()
        mock_verify_response.is_valid = True
        mock_verify_response.invalid_reason = None
        mock_facilitator_instance.verify = AsyncMock(return_value=mock_verify_response)

        mock_settle_response = AsyncMock()
        mock_settle_response.success = False
        mock_settle_response.error_reason = "Insufficient funds"
        mock_facilitator_instance.settle = AsyncMock(return_value=mock_settle_response)

        app = FastAPI()
        app.get("/protected")(protected_endpoint)
        app.middleware("http")(
            require_payment(
                price="$1.00",
                pay_to_address="0x1111111111111111111111111111111111111111",
                path="/protected",
                network="base-sepolia",
            )
        )
        client = TestClient(app)

        response = client.get(
            "/protected",
            headers={
                "X-PAYMENT": create_mock_payment_header(),
                "Accept": "application/json",
            },
        )

        assert response.status_code == 402
        response_data = response.json()
        assert "secret" not in response_data
        assert "This is paid content" not in str(response_data)
        assert "sensitive_info" not in str(response_data)
        assert "error" in response_data
        assert "Settle failed" in response_data["error"]
        assert mock_facilitator_instance.verify.called
        assert mock_facilitator_instance.settle.called


def test_settlement_success_delivers_content():
    with patch("x402.fastapi.middleware.FacilitatorClient") as MockFacilitator:
        mock_facilitator_instance = MockFacilitator.return_value

        mock_verify_response = AsyncMock()
        mock_verify_response.is_valid = True
        mock_verify_response.invalid_reason = None
        mock_facilitator_instance.verify = AsyncMock(return_value=mock_verify_response)

        mock_settle_response = AsyncMock()
        mock_settle_response.success = True
        mock_settle_response.transaction = "0x" + "b" * 64
        mock_settle_response.network = "base-sepolia"
        mock_settle_response.payer = "0x1234567890123456789012345678901234567890"
        mock_settle_response.model_dump_json = lambda by_alias=True: json.dumps({
            "success": True,
            "transaction": mock_settle_response.transaction,
            "network": mock_settle_response.network,
            "payer": mock_settle_response.payer,
        })
        mock_facilitator_instance.settle = AsyncMock(return_value=mock_settle_response)

        app = FastAPI()
        app.get("/protected")(protected_endpoint)
        app.middleware("http")(
            require_payment(
                price="$1.00",
                pay_to_address="0x1111111111111111111111111111111111111111",
                path="/protected",
                network="base-sepolia",
            )
        )
        client = TestClient(app)

        response = client.get(
            "/protected",
            headers={
                "X-PAYMENT": create_mock_payment_header(),
                "Accept": "application/json",
            },
        )

        assert response.status_code == 200
        response_data = response.json()
        assert "secret" in response_data
        assert response_data["secret"] == "This is paid content worth $$$"
        assert response_data["data"] == "sensitive_info"
        assert "X-PAYMENT-RESPONSE" in response.headers


def test_settlement_exception_does_not_leak_content():
    with patch("x402.fastapi.middleware.FacilitatorClient") as MockFacilitator:
        mock_facilitator_instance = MockFacilitator.return_value

        mock_verify_response = AsyncMock()
        mock_verify_response.is_valid = True
        mock_facilitator_instance.verify = AsyncMock(return_value=mock_verify_response)

        mock_facilitator_instance.settle = AsyncMock(
            side_effect=Exception("Network timeout")
        )

        app = FastAPI()
        app.get("/protected")(protected_endpoint)
        app.middleware("http")(
            require_payment(
                price="$1.00",
                pay_to_address="0x1111111111111111111111111111111111111111",
                path="/protected",
                network="base-sepolia",
            )
        )
        client = TestClient(app)

        response = client.get(
            "/protected",
            headers={
                "X-PAYMENT": create_mock_payment_header(),
                "Accept": "application/json",
            },
        )

        assert response.status_code == 402
        response_data = response.json()
        assert "secret" not in response_data
        assert "error" in response_data
        assert "Settle failed" in response_data["error"]
