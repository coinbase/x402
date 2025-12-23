import pytest
from x402.encoding import (
    safe_base64_encode,
    safe_base64_decode,
    encode_payment_decline_header,
    decode_payment_decline_header,
    encode_intent_trace_header,
    decode_intent_trace_header,
)
from x402.types import IntentTrace, PaymentDecline, ResourceInfoSimple, Remediation


def test_safe_base64_encode():
    # Test basic string encoding
    assert safe_base64_encode("hello") == "aGVsbG8="

    # Test empty string
    assert safe_base64_encode("") == ""

    # Test string with special characters
    assert safe_base64_encode("hello!@#$%^&*()") == "aGVsbG8hQCMkJV4mKigp"

    # Test string with unicode characters
    assert safe_base64_encode("hello 世界") == "aGVsbG8g5LiW55WM"

    # Test bytes input
    assert safe_base64_encode(b"hello") == "aGVsbG8="
    assert safe_base64_encode(b"\x00\x01\x02") == "AAEC"

    # Test non-utf8 bytes
    non_utf8_bytes = b"\xff\xfe\xfd"
    assert safe_base64_encode(non_utf8_bytes) == "//79"


def test_safe_base64_decode():
    # Test basic string decoding
    assert safe_base64_decode("aGVsbG8=") == "hello"

    # Test empty string
    assert safe_base64_decode("") == ""

    # Test string with special characters
    assert safe_base64_decode("aGVsbG8hQCMkJV4mKigp") == "hello!@#$%^&*()"

    # Test string with unicode characters
    assert safe_base64_decode("aGVsbG8g5LiW55WM") == "hello 世界"

    # Test invalid base64
    with pytest.raises(Exception):
        safe_base64_decode("invalid base64!")

    # Test base64 with invalid padding
    with pytest.raises(Exception):
        safe_base64_decode("aGVsbG8")

    # Test non-utf8 bytes (should raise UnicodeDecodeError)
    with pytest.raises(UnicodeDecodeError):
        safe_base64_decode("//79")  # This is the base64 encoding of \xff\xfe\xfd


def test_encode_decode_roundtrip():
    test_strings = [
        "hello",
        "",
        "hello!@#$%^&*()",
        "hello 世界",
        "test123",
        "!@#$%^&*()_+",
        "Hello, World!",
    ]

    for test_str in test_strings:
        encoded = safe_base64_encode(test_str)
        decoded = safe_base64_decode(encoded)
        assert decoded == test_str, f"Roundtrip failed for string: {test_str}"

    # Test utf-8 bytes roundtrip
    test_bytes = [
        b"hello",
        b"",
        b"\x00\x01\x02",
    ]

    for test_bytes in test_bytes:
        encoded = safe_base64_encode(test_bytes)
        decoded = safe_base64_decode(encoded)
        assert decoded == test_bytes.decode("utf-8"), (
            f"Roundtrip failed for bytes: {test_bytes}"
        )


def test_encode_decode_intent_trace():
    """Test encoding and decoding of IntentTrace objects."""
    # Test with minimal intent trace
    trace = IntentTrace(reason_code="insufficient_funds")
    encoded = encode_intent_trace_header(trace)
    decoded = decode_intent_trace_header(encoded)
    assert decoded.reason_code == "insufficient_funds"
    assert decoded.trace_summary is None
    assert decoded.metadata is None
    assert decoded.remediation is None

    # Test with full intent trace
    trace_full = IntentTrace(
        reason_code="insufficient_funds",
        trace_summary="User has 5 USDC, needs 10 USDC",
        metadata={"required_amount": "10000000", "available_balance": "5000000"},
        remediation=Remediation(
            action="top_up",
            reason="Add more USDC to your wallet",
        ),
    )
    encoded_full = encode_intent_trace_header(trace_full)
    decoded_full = decode_intent_trace_header(encoded_full)
    assert decoded_full.reason_code == "insufficient_funds"
    assert decoded_full.trace_summary == "User has 5 USDC, needs 10 USDC"
    assert decoded_full.metadata["required_amount"] == "10000000"
    assert decoded_full.remediation.action == "top_up"


def test_encode_decode_payment_decline():
    """Test encoding and decoding of PaymentDecline objects."""
    # Test with minimal decline (no intent trace)
    resource = ResourceInfoSimple(url="https://example.com/resource")
    decline = PaymentDecline(
        x402_version=2,
        decline=True,
        resource=resource,
    )
    encoded = encode_payment_decline_header(decline)
    decoded = decode_payment_decline_header(encoded)
    assert decoded.x402_version == 2
    assert decoded.decline is True
    assert decoded.resource.url == "https://example.com/resource"
    assert decoded.intent_trace is None

    # Test with intent trace
    trace = IntentTrace(
        reason_code="user_declined",
        trace_summary="Price too high for user budget",
        metadata={"requested_price": "10000000"},
        remediation=Remediation(
            action="lower_price",
            reason="Consider offering a lower price tier",
        ),
    )
    decline_with_trace = PaymentDecline(
        x402_version=2,
        decline=True,
        resource=ResourceInfoSimple(
            url="https://example.com/premium",
            description="Premium content",
            mime_type="application/json",
        ),
        intent_trace=trace,
    )
    encoded_with_trace = encode_payment_decline_header(decline_with_trace)
    decoded_with_trace = decode_payment_decline_header(encoded_with_trace)
    assert decoded_with_trace.x402_version == 2
    assert decoded_with_trace.resource.description == "Premium content"
    assert decoded_with_trace.intent_trace.reason_code == "user_declined"
    assert decoded_with_trace.intent_trace.remediation.action == "lower_price"


def test_intent_trace_roundtrip():
    """Test that IntentTrace survives encode/decode roundtrip."""
    test_cases = [
        IntentTrace(reason_code="insufficient_funds"),
        IntentTrace(
            reason_code="signature_expired",
            trace_summary="Signature expired at 1234567890",
        ),
        IntentTrace(
            reason_code="recipient_mismatch",
            metadata={"expected": "0xabc", "provided": "0xdef"},
        ),
        IntentTrace(
            reason_code="amount_mismatch",
            trace_summary="Amount doesn't match requirements",
            metadata={"required": "100", "provided": "50"},
            remediation=Remediation(action="retry", reason="Submit correct amount"),
        ),
    ]

    for trace in test_cases:
        encoded = encode_intent_trace_header(trace)
        decoded = decode_intent_trace_header(encoded)
        assert decoded.reason_code == trace.reason_code
        assert decoded.trace_summary == trace.trace_summary
        if trace.metadata:
            for key, value in trace.metadata.items():
                assert decoded.metadata[key] == value
        if trace.remediation:
            assert decoded.remediation.action == trace.remediation.action
