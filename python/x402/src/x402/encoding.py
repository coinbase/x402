import base64
import json
from typing import Union

from x402.types import IntentTrace, PaymentDecline


def safe_base64_encode(data: Union[str, bytes]) -> str:
    """Safely encode string or bytes to base64 string.

    Args:
        data: String or bytes to encode

    Returns:
        Base64 encoded string
    """
    if isinstance(data, str):
        data = data.encode("utf-8")
    return base64.b64encode(data).decode("utf-8")


def safe_base64_decode(data: str) -> str:
    """Safely decode base64 string to bytes and then to utf-8 string.

    Args:
        data: Base64 encoded string

    Returns:
        Decoded utf-8 string
    """
    return base64.b64decode(data).decode("utf-8")


def encode_payment_decline_header(decline: PaymentDecline) -> str:
    """Encode a payment decline to base64 header value.

    Args:
        decline: Payment decline object

    Returns:
        Base64 encoded string
    """
    return safe_base64_encode(decline.model_dump_json(by_alias=True))


def decode_payment_decline_header(header: str) -> PaymentDecline:
    """Decode a base64 payment decline header.

    Args:
        header: Base64 encoded payment decline header

    Returns:
        Decoded PaymentDecline object
    """
    json_str = safe_base64_decode(header)
    return PaymentDecline.model_validate_json(json_str)


def encode_intent_trace_header(trace: IntentTrace) -> str:
    """Encode an intent trace to base64 header value.

    Args:
        trace: Intent trace object

    Returns:
        Base64 encoded string
    """
    return safe_base64_encode(trace.model_dump_json(by_alias=True))


def decode_intent_trace_header(header: str) -> IntentTrace:
    """Decode a base64 intent trace header.

    Args:
        header: Base64 encoded intent trace header

    Returns:
        Decoded IntentTrace object
    """
    json_str = safe_base64_decode(header)
    return IntentTrace.model_validate_json(json_str)
