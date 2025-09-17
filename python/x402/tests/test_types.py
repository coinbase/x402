from x402.types import (
    CashuPaymentPayload,
    PaymentRequirements,
    x402PaymentRequiredResponse,
    ExactPaymentPayload,
    EIP3009Authorization,
    VerifyResponse,
    SettleResponse,
    PaymentPayload,
    X402Headers,
)


def test_payment_requirements_serde():
    original = PaymentRequirements(
        scheme="exact",
        network="base",
        max_amount_required="1000",
        resource="/api/v1/resource",
        description="Test resource",
        mime_type="application/json",
        output_schema=None,
        pay_to="0x123",
        max_timeout_seconds=60,
        asset="0x0000000000000000000000000000000000000000",
        extra=None,
    )
    expected = {
        "scheme": "exact",
        "network": "base",
        "maxAmountRequired": "1000",
        "resource": "/api/v1/resource",
        "description": "Test resource",
        "mimeType": "application/json",
        "outputSchema": None,
        "payTo": "0x123",
        "maxTimeoutSeconds": 60,
        "asset": "0x0000000000000000000000000000000000000000",
        "extra": None,
    }
    assert original.model_dump(by_alias=True) == expected
    assert PaymentRequirements(**expected) == original


def test_x402_payment_required_response_serde():
    payment_req = PaymentRequirements(
        scheme="exact",
        network="base",
        max_amount_required="1000",
        resource="/api/v1/resource",
        description="Test resource",
        mime_type="application/json",
        output_schema=None,
        pay_to="0x123",
        max_timeout_seconds=60,
        asset="0x0000000000000000000000000000000000000000",
        extra=None,
    )
    original = x402PaymentRequiredResponse(
        x402_version=1, accepts=[payment_req], error=""
    )
    expected = {
        "x402Version": 1,
        "accepts": [payment_req.model_dump(by_alias=True)],
        "error": "",
    }
    assert original.model_dump(by_alias=True) == expected
    assert x402PaymentRequiredResponse(**expected) == original


def test_eip3009_authorization_serde():
    original = EIP3009Authorization(
        from_="0x123",
        to="0x456",
        value="1000",
        valid_after="0",
        valid_before="1000",
        nonce="0x789",
    )
    expected = {
        "from": "0x123",
        "to": "0x456",
        "value": "1000",
        "validAfter": "0",
        "validBefore": "1000",
        "nonce": "0x789",
    }
    assert original.model_dump(by_alias=True) == expected
    assert EIP3009Authorization(**expected) == original


def test_exact_payment_payload_serde():
    auth = EIP3009Authorization(
        from_="0x123",
        to="0x456",
        value="1000",
        valid_after="0",
        valid_before="1000",
        nonce="0x789",
    )
    original = ExactPaymentPayload(signature="0x123", authorization=auth)
    expected = {"signature": "0x123", "authorization": auth.model_dump(by_alias=True)}
    assert original.model_dump(by_alias=True) == expected
    assert ExactPaymentPayload(**expected) == original


def test_verify_response_serde():
    original = VerifyResponse(is_valid=True, invalid_reason=None, payer="0x123")
    expected = {"isValid": True, "invalidReason": None, "payer": "0x123"}
    assert original.model_dump(by_alias=True) == expected
    assert VerifyResponse(**expected) == original


def test_settle_response_serde():
    original = SettleResponse(
        success=True,
        error_reason=None,
        transaction="0x123",
        network="base",
        payer="0x123",
    )
    expected = {
        "success": True,
        "errorReason": None,
        "transaction": "0x123",
        "network": "base",
        "payer": "0x123",
    }
    assert original.model_dump(by_alias=True) == expected
    assert SettleResponse(**expected) == original


def test_payment_payload_serde():
    auth = EIP3009Authorization(
        from_="0x123",
        to="0x456",
        value="1000",
        valid_after="0",
        valid_before="1000",
        nonce="0x789",
    )
    payload = ExactPaymentPayload(signature="0x123", authorization=auth)
    original = PaymentPayload(
        x402_version=1,
        scheme="exact",
        network="base",
        payload=payload,
    )
    expected = {
        "x402Version": 1,
        "scheme": "exact",
        "network": "base",
        "payload": payload.model_dump(by_alias=True),
    }
    assert original.model_dump(by_alias=True) == expected
    assert PaymentPayload(**expected) == original


def test_x402_headers_serde():
    original = X402Headers(x_payment="test-payment")
    expected = {"x_payment": "test-payment"}
    assert original.model_dump(by_alias=True) == expected
    assert X402Headers(**expected) == original


def test_cashu_payment_requirements_and_payload():
    requirements = PaymentRequirements(
        scheme="cashu-token",
        network="bitcoin-testnet",
        max_amount_required="5000",
        resource="https://api.example.com/resource",
        description="Test resource",
        mime_type="application/json",
        pay_to="cashu:merchant",
        max_timeout_seconds=120,
        extra={
            "mints": ["https://nofees.testnut.cashu.space/"],
            "unit": "sat",
        },
    )

    assert requirements.extra["mints"] == ["https://nofees.testnut.cashu.space/"]

    payload = CashuPaymentPayload(
        tokens=[
            {
                "mint": "https://nofees.testnut.cashu.space/",
                "proofs": [
                    {
                        "amount": 3000,
                        "secret": "secret",
                        "C": "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
                        "id": "001122aabbccdd",
                    }
                ],
            }
        ],
        encoded=["cashuBexample"],
        memo="optional",
        payer="payer-id",
    )

    payment_payload = PaymentPayload(
        x402_version=1,
        scheme="cashu-token",
        network="bitcoin-testnet",
        payload=payload,
    )

    serialized = payment_payload.model_dump(by_alias=True)
    assert serialized["payload"]["tokens"][0]["mint"] == "https://nofees.testnut.cashu.space/"
    assert serialized["scheme"] == "cashu-token"
