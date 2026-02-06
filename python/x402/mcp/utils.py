"""Utility functions for MCP payment handling."""

import json
from typing import Any, Optional

from ..schemas import PaymentPayload, PaymentRequired, SettleResponse
from .types import (
    MCP_PAYMENT_META_KEY,
    MCP_PAYMENT_REQUIRED_CODE,
    MCP_PAYMENT_RESPONSE_META_KEY,
    MCPToolResult,
)


def extract_payment_from_meta(params: dict[str, Any]) -> Optional[PaymentPayload]:
    """Extract payment payload from MCP request _meta field.

    Args:
        params: Request parameters with _meta field

    Returns:
        Payment payload if found, None otherwise
    """
    meta = params.get("_meta")
    if not isinstance(meta, dict):
        return None

    payment_data = meta.get(MCP_PAYMENT_META_KEY)
    if payment_data is None:
        return None

    # Convert to PaymentPayload
    try:
        if isinstance(payment_data, PaymentPayload):
            return payment_data
        if isinstance(payment_data, dict):
            return PaymentPayload(**payment_data)
        # Try JSON string
        if isinstance(payment_data, str):
            data = json.loads(payment_data)
            return PaymentPayload(**data)
        return None
    except (TypeError, ValueError, KeyError):
        return None


def attach_payment_to_meta(
    params: dict[str, Any], payload: PaymentPayload
) -> dict[str, Any]:
    """Attach payment payload to request params.

    Args:
        params: Request parameters
        payload: Payment payload to attach

    Returns:
        New params dict with payment in _meta
    """
    result = params.copy()
    meta = result.get("_meta", {}).copy() if isinstance(result.get("_meta"), dict) else {}
    meta[MCP_PAYMENT_META_KEY] = payload.model_dump() if hasattr(payload, "model_dump") else payload
    result["_meta"] = meta
    return result


def extract_payment_response_from_meta(
    result: MCPToolResult,
) -> Optional[SettleResponse]:
    """Extract settlement response from MCP result _meta.

    Args:
        result: Tool result with _meta field

    Returns:
        Settlement response if found, None otherwise
    """
    if not result.meta:
        return None

    response_data = result.meta.get(MCP_PAYMENT_RESPONSE_META_KEY)
    if response_data is None:
        return None

    try:
        if isinstance(response_data, SettleResponse):
            return response_data
        if isinstance(response_data, dict):
            return SettleResponse(**response_data)
        # Try JSON string
        if isinstance(response_data, str):
            data = json.loads(response_data)
            return SettleResponse(**data)
        return None
    except (TypeError, ValueError, KeyError):
        return None


def attach_payment_response_to_meta(
    result: MCPToolResult, response: SettleResponse
) -> MCPToolResult:
    """Attach settlement response to result.

    Args:
        result: Tool result
        response: Settlement response to attach

    Returns:
        New result with response in _meta
    """
    if result.meta is None:
        result.meta = {}
    result.meta[MCP_PAYMENT_RESPONSE_META_KEY] = (
        response.model_dump() if hasattr(response, "model_dump") else response
    )
    return result


def extract_payment_required_from_result(
    result: MCPToolResult,
) -> Optional[PaymentRequired]:
    """Extract PaymentRequired from tool result (dual format).

    Handles both structuredContent (preferred) and content[0].text (fallback).

    Args:
        result: Tool result

    Returns:
        PaymentRequired if found, None otherwise
    """
    if not result.is_error:
        return None

    # Try structuredContent first (preferred)
    if result.structured_content:
        pr = _extract_payment_required_from_object(result.structured_content)
        if pr:
            return pr

    # Fallback to content[0].text
    if result.content and len(result.content) > 0:
        first_item = result.content[0]
        if isinstance(first_item, dict) and first_item.get("type") == "text":
            text = first_item.get("text", "")
            if text:
                try:
                    parsed = json.loads(text)
                    if isinstance(parsed, dict):
                        pr = _extract_payment_required_from_object(parsed)
                        if pr:
                            return pr
                except (json.JSONDecodeError, TypeError):
                    pass

    return None


def _extract_payment_required_from_object(obj: dict[str, Any]) -> Optional[PaymentRequired]:
    """Extract PaymentRequired from object.

    Args:
        obj: Object to extract from

    Returns:
        PaymentRequired if valid, None otherwise
    """
    # Check for x402Version/x402_version and accepts fields
    if "x402Version" not in obj and "x402_version" not in obj:
        return None

    accepts = obj.get("accepts")
    if not isinstance(accepts, list) or len(accepts) == 0:
        return None

    try:
        # Normalize camelCase to snake_case for Pydantic
        normalized = {("x402_version" if k == "x402Version" else k): v for k, v in obj.items()}
        return PaymentRequired(**normalized)
    except (TypeError, ValueError, KeyError):
        return None


def create_tool_resource_url(tool_name: str, custom_url: Optional[str] = None) -> str:
    """Create a resource URL for an MCP tool.

    Args:
        tool_name: Name of the tool
        custom_url: Optional custom URL

    Returns:
        Resource URL
    """
    if custom_url:
        return custom_url
    return f"mcp://tool/{tool_name}"


def is_object(value: Any) -> bool:
    """Type guard to check if a value is a non-null object (dict).

    Args:
        value: The value to check

    Returns:
        True if value is a dict, False otherwise
    """
    return isinstance(value, dict)


def create_payment_required_error(
    payment_required: PaymentRequired,
    message: Optional[str] = None,
) -> "PaymentRequiredError":
    """Create a PaymentRequiredError with the given message and payment required data.

    Args:
        payment_required: The payment required response
        message: Optional custom error message (defaults to "Payment required")

    Returns:
        PaymentRequiredError instance

    Example:
        ```python
        from x402.mcp import create_payment_required_error

        error = create_payment_required_error(payment_required, "Payment required")
        raise error
        ```
    """
    from .types import PaymentRequiredError

    return PaymentRequiredError(
        message or "Payment required",
        payment_required=payment_required,
    )


def extract_payment_required_from_error(error: Any) -> Optional[PaymentRequired]:
    """Extract PaymentRequired from an MCP JSON-RPC error.

    This function checks if the error is a 402 payment required error and extracts
    the PaymentRequired data from the error's data field.

    Args:
        error: The error object from a JSON-RPC response

    Returns:
        PaymentRequired if this is a 402 error, None otherwise

    Example:
        ```python
        from x402.mcp import extract_payment_required_from_error

        try:
            result = client.call_tool("tool", {})
        except Exception as err:
            pr = extract_payment_required_from_error(err)
            if pr:
                # Handle payment required
                pass
        ```
    """
    if not is_object(error):
        return None

    # Check if this is a 402 payment required error
    code = error.get("code")
    if code != MCP_PAYMENT_REQUIRED_CODE:
        return None

    # Extract and validate the data field
    data = error.get("data")
    if not is_object(data):
        return None

    # Normalize camelCase to snake_case for Pydantic
    normalized_data = {("x402_version" if k == "x402Version" else k): v for k, v in data.items()}
    return _extract_payment_required_from_object(normalized_data)


def is_payment_required_error(error: Exception) -> bool:
    """Check if an error is a PaymentRequiredError.

    Args:
        error: The error to check

    Returns:
        True if the error is a PaymentRequiredError
    """
    from .types import PaymentRequiredError

    return isinstance(error, PaymentRequiredError)
