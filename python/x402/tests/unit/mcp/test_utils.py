"""Unit tests for x402.mcp.utils - MCP payment utility functions.

Tests cover all public and private helpers in python/x402/mcp/utils.py:
- extract_payment_from_meta / attach_payment_to_meta
- extract_payment_response_from_meta / attach_payment_response_to_meta
- extract_payment_required_from_result / _extract_payment_required_from_object
- create_tool_resource_url
- is_object
- create_payment_required_error
- extract_payment_required_from_error
- convert_mcp_result
- register_schemes
- is_payment_required_error
"""

import json
from unittest.mock import MagicMock

from x402.mcp.types import (
    MCP_PAYMENT_META_KEY,
    MCP_PAYMENT_REQUIRED_CODE,
    MCP_PAYMENT_RESPONSE_META_KEY,
    MCPToolResult,
    PaymentRequiredError,
)
from x402.mcp.utils import (
    _extract_payment_required_from_object,
    attach_payment_response_to_meta,
    attach_payment_to_meta,
    convert_mcp_result,
    create_payment_required_error,
    create_tool_resource_url,
    extract_payment_from_meta,
    extract_payment_required_from_error,
    extract_payment_required_from_result,
    extract_payment_response_from_meta,
    is_object,
    is_payment_required_error,
    register_schemes,
)
from x402.schemas import PaymentPayload, PaymentRequired, PaymentRequirements, SettleResponse

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def make_payment_requirements() -> PaymentRequirements:
    return PaymentRequirements(
        scheme="exact",
        network="eip155:8453",
        asset="0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        amount="1000000",
        pay_to="0x1234567890123456789012345678901234567890",
        max_timeout_seconds=300,
    )


def make_payload(signature: str = "0xdeadbeef") -> PaymentPayload:
    return PaymentPayload(
        x402_version=2,
        payload={"signature": signature},
        accepted=make_payment_requirements(),
    )


def make_settle_response() -> SettleResponse:
    return SettleResponse(success=True, transaction="0xtxhash", network="eip155:8453")


def make_payment_required() -> PaymentRequired:
    return PaymentRequired(x402_version=2, accepts=[make_payment_requirements()], error="")


# ===========================================================================
# extract_payment_from_meta
# ===========================================================================


class TestExtractPaymentFromMeta:
    def test_returns_none_when_no_meta_key(self):
        assert extract_payment_from_meta({}) is None

    def test_returns_none_when_meta_is_not_dict(self):
        assert extract_payment_from_meta({"_meta": "string"}) is None

    def test_returns_none_when_payment_key_absent(self):
        assert extract_payment_from_meta({"_meta": {"other": "data"}}) is None

    def test_returns_none_when_payment_is_none(self):
        assert extract_payment_from_meta({"_meta": {MCP_PAYMENT_META_KEY: None}}) is None

    def test_extracts_payment_from_dict(self):
        payload = make_payload()
        data = payload.model_dump(by_alias=True)
        params = {"_meta": {MCP_PAYMENT_META_KEY: data}}
        result = extract_payment_from_meta(params)
        assert isinstance(result, PaymentPayload)
        assert result.x402_version == 2

    def test_extracts_payment_from_payload_object(self):
        payload = make_payload()
        params = {"_meta": {MCP_PAYMENT_META_KEY: payload}}
        result = extract_payment_from_meta(params)
        assert result is payload

    def test_extracts_payment_from_json_string(self):
        payload = make_payload()
        json_str = payload.model_dump_json(by_alias=True)
        params = {"_meta": {MCP_PAYMENT_META_KEY: json_str}}
        result = extract_payment_from_meta(params)
        assert isinstance(result, PaymentPayload)
        assert result.x402_version == 2

    def test_returns_none_for_invalid_json_string(self):
        params = {"_meta": {MCP_PAYMENT_META_KEY: "not-json"}}
        result = extract_payment_from_meta(params)
        assert result is None

    def test_returns_none_for_invalid_dict_schema(self):
        params = {"_meta": {MCP_PAYMENT_META_KEY: {"bad": "schema"}}}
        result = extract_payment_from_meta(params)
        assert result is None


# ===========================================================================
# attach_payment_to_meta
# ===========================================================================


class TestAttachPaymentToMeta:
    def test_adds_payment_to_empty_params(self):
        payload = make_payload()
        result = attach_payment_to_meta({}, payload)
        assert MCP_PAYMENT_META_KEY in result["_meta"]

    def test_does_not_mutate_original_params(self):
        params = {"key": "val"}
        payload = make_payload()
        attach_payment_to_meta(params, payload)
        assert "_meta" not in params

    def test_preserves_existing_meta_fields(self):
        params = {"_meta": {"other": "preserved"}}
        payload = make_payload()
        result = attach_payment_to_meta(params, payload)
        assert result["_meta"]["other"] == "preserved"

    def test_payment_stored_as_dict(self):
        payload = make_payload()
        result = attach_payment_to_meta({}, payload)
        stored = result["_meta"][MCP_PAYMENT_META_KEY]
        # Should be a serialisable dict (model_dump output)
        assert isinstance(stored, dict)
        assert stored.get("x402Version") == 2

    def test_does_not_mutate_existing_meta_dict(self):
        original_meta = {"existing": True}
        params = {"_meta": original_meta}
        attach_payment_to_meta(params, make_payload())
        # Original meta dict should be unchanged
        assert "existing" in original_meta
        assert MCP_PAYMENT_META_KEY not in original_meta


# ===========================================================================
# extract_payment_response_from_meta
# ===========================================================================


class TestExtractPaymentResponseFromMeta:
    def _make_result(self, meta=None) -> MCPToolResult:
        return MCPToolResult(content=[], meta=meta)

    def test_returns_none_when_no_meta(self):
        result = self._make_result(meta=None)
        assert extract_payment_response_from_meta(result) is None

    def test_returns_none_when_key_absent(self):
        result = self._make_result(meta={"other": "data"})
        assert extract_payment_response_from_meta(result) is None

    def test_extracts_settle_response_from_dict(self):
        sr = make_settle_response()
        data = sr.model_dump(by_alias=True)
        result = self._make_result(meta={MCP_PAYMENT_RESPONSE_META_KEY: data})
        extracted = extract_payment_response_from_meta(result)
        assert isinstance(extracted, SettleResponse)
        assert extracted.success is True

    def test_extracts_settle_response_object_directly(self):
        sr = make_settle_response()
        result = self._make_result(meta={MCP_PAYMENT_RESPONSE_META_KEY: sr})
        extracted = extract_payment_response_from_meta(result)
        assert extracted is sr

    def test_extracts_settle_response_from_json_string(self):
        sr = make_settle_response()
        json_str = sr.model_dump_json(by_alias=True)
        result = self._make_result(meta={MCP_PAYMENT_RESPONSE_META_KEY: json_str})
        extracted = extract_payment_response_from_meta(result)
        assert isinstance(extracted, SettleResponse)
        assert extracted.transaction == "0xtxhash"

    def test_returns_none_for_invalid_dict(self):
        result = self._make_result(meta={MCP_PAYMENT_RESPONSE_META_KEY: {"bad": True}})
        assert extract_payment_response_from_meta(result) is None


# ===========================================================================
# attach_payment_response_to_meta
# ===========================================================================


class TestAttachPaymentResponseToMeta:
    def test_adds_response_to_result_meta(self):
        original = MCPToolResult(content=[], meta={})
        sr = make_settle_response()
        updated = attach_payment_response_to_meta(original, sr)
        assert MCP_PAYMENT_RESPONSE_META_KEY in updated.meta

    def test_does_not_mutate_original_result(self):
        original = MCPToolResult(content=[], meta={"existing": True})
        sr = make_settle_response()
        attach_payment_response_to_meta(original, sr)
        assert MCP_PAYMENT_RESPONSE_META_KEY not in original.meta

    def test_preserves_existing_meta(self):
        original = MCPToolResult(content=[], meta={"keep": "me"})
        updated = attach_payment_response_to_meta(original, make_settle_response())
        assert updated.meta["keep"] == "me"

    def test_preserves_content(self):
        content = [{"type": "text", "text": "hello"}]
        original = MCPToolResult(content=content, meta={})
        updated = attach_payment_response_to_meta(original, make_settle_response())
        assert updated.content is content

    def test_response_stored_as_dict(self):
        original = MCPToolResult(content=[], meta={})
        sr = make_settle_response()
        updated = attach_payment_response_to_meta(original, sr)
        stored = updated.meta[MCP_PAYMENT_RESPONSE_META_KEY]
        assert isinstance(stored, dict)
        assert stored.get("success") is True


# ===========================================================================
# _extract_payment_required_from_object
# ===========================================================================


class TestExtractPaymentRequiredFromObject:
    def _valid_obj(self) -> dict:
        req = make_payment_requirements()
        return {
            "x402Version": 2,
            "accepts": [req.model_dump(by_alias=True)],
            "error": "",
        }

    def test_extracts_valid_object(self):
        obj = self._valid_obj()
        result = _extract_payment_required_from_object(obj)
        assert isinstance(result, PaymentRequired)

    def test_returns_none_missing_x402_version(self):
        obj = self._valid_obj()
        del obj["x402Version"]
        assert _extract_payment_required_from_object(obj) is None

    def test_returns_none_missing_accepts(self):
        obj = self._valid_obj()
        del obj["accepts"]
        assert _extract_payment_required_from_object(obj) is None

    def test_returns_none_empty_accepts(self):
        obj = self._valid_obj()
        obj["accepts"] = []
        assert _extract_payment_required_from_object(obj) is None

    def test_returns_none_accepts_not_list(self):
        obj = self._valid_obj()
        obj["accepts"] = "not-a-list"
        assert _extract_payment_required_from_object(obj) is None

    def test_accepts_snake_case_x402_version(self):
        obj = self._valid_obj()
        obj["x402_version"] = obj.pop("x402Version")
        result = _extract_payment_required_from_object(obj)
        assert isinstance(result, PaymentRequired)


# ===========================================================================
# extract_payment_required_from_result
# ===========================================================================


class TestExtractPaymentRequiredFromResult:
    def _make_pr_obj(self) -> dict:
        req = make_payment_requirements()
        return {
            "x402Version": 2,
            "accepts": [req.model_dump(by_alias=True)],
            "error": "",
        }

    def test_returns_none_for_non_error_result(self):
        result = MCPToolResult(content=[], is_error=False)
        assert extract_payment_required_from_result(result) is None

    def test_extracts_from_structured_content(self):
        obj = self._make_pr_obj()
        result = MCPToolResult(content=[], is_error=True, structured_content=obj)
        pr = extract_payment_required_from_result(result)
        assert isinstance(pr, PaymentRequired)

    def test_extracts_from_text_content_json(self):
        obj = self._make_pr_obj()
        json_str = json.dumps(obj)
        result = MCPToolResult(
            content=[{"type": "text", "text": json_str}],
            is_error=True,
        )
        pr = extract_payment_required_from_result(result)
        assert isinstance(pr, PaymentRequired)

    def test_structured_content_takes_priority_over_text(self):
        obj = self._make_pr_obj()
        # structured_content is valid; text content is invalid
        result = MCPToolResult(
            content=[{"type": "text", "text": "{}"}],
            is_error=True,
            structured_content=obj,
        )
        pr = extract_payment_required_from_result(result)
        assert isinstance(pr, PaymentRequired)

    def test_returns_none_when_no_valid_data(self):
        result = MCPToolResult(
            content=[{"type": "text", "text": '{"key": "value"}'}],
            is_error=True,
        )
        assert extract_payment_required_from_result(result) is None

    def test_returns_none_for_invalid_json_text(self):
        result = MCPToolResult(
            content=[{"type": "text", "text": "not-json"}],
            is_error=True,
        )
        assert extract_payment_required_from_result(result) is None

    def test_returns_none_for_empty_content(self):
        result = MCPToolResult(content=[], is_error=True)
        assert extract_payment_required_from_result(result) is None


# ===========================================================================
# create_tool_resource_url
# ===========================================================================


class TestCreateToolResourceUrl:
    def test_returns_mcp_scheme_url_by_default(self):
        url = create_tool_resource_url("my_tool")
        assert url == "mcp://tool/my_tool"

    def test_returns_custom_url_when_provided(self):
        url = create_tool_resource_url("ignored_name", custom_url="https://example.com/tool")
        assert url == "https://example.com/tool"

    def test_empty_custom_url_falls_through_to_default(self):
        # Falsy custom_url should use default
        url = create_tool_resource_url("my_tool", custom_url="")
        assert url == "mcp://tool/my_tool"


# ===========================================================================
# is_object
# ===========================================================================


class TestIsObject:
    def test_dict_is_object(self):
        assert is_object({}) is True
        assert is_object({"key": "val"}) is True

    def test_non_dict_types_are_not_objects(self):
        assert is_object(None) is False
        assert is_object("string") is False
        assert is_object(42) is False
        assert is_object([]) is False
        assert is_object(True) is False


# ===========================================================================
# create_payment_required_error
# ===========================================================================


class TestCreatePaymentRequiredError:
    def test_creates_error_with_default_message(self):
        pr = make_payment_required()
        err = create_payment_required_error(pr)
        assert isinstance(err, PaymentRequiredError)
        assert str(err) == "Payment required"
        assert err.payment_required is pr

    def test_creates_error_with_custom_message(self):
        pr = make_payment_required()
        err = create_payment_required_error(pr, message="Custom message")
        assert str(err) == "Custom message"

    def test_error_has_correct_code(self):
        pr = make_payment_required()
        err = create_payment_required_error(pr)
        assert err.code == MCP_PAYMENT_REQUIRED_CODE


# ===========================================================================
# extract_payment_required_from_error
# ===========================================================================


class TestExtractPaymentRequiredFromError:
    def _make_error_dict(self) -> dict:
        req = make_payment_requirements()
        pr_data = {
            "x402Version": 2,
            "accepts": [req.model_dump(by_alias=True)],
            "error": "",
        }
        return {"code": MCP_PAYMENT_REQUIRED_CODE, "data": pr_data}

    def test_returns_none_for_non_dict(self):
        assert extract_payment_required_from_error("string") is None
        assert extract_payment_required_from_error(None) is None
        assert extract_payment_required_from_error(42) is None

    def test_returns_none_for_wrong_code(self):
        err = self._make_error_dict()
        err["code"] = 500
        assert extract_payment_required_from_error(err) is None

    def test_returns_none_when_data_not_dict(self):
        err = {"code": MCP_PAYMENT_REQUIRED_CODE, "data": "string"}
        assert extract_payment_required_from_error(err) is None

    def test_returns_none_when_data_missing(self):
        err = {"code": MCP_PAYMENT_REQUIRED_CODE}
        assert extract_payment_required_from_error(err) is None

    def test_extracts_payment_required_from_valid_error(self):
        err = self._make_error_dict()
        pr = extract_payment_required_from_error(err)
        assert isinstance(pr, PaymentRequired)
        assert pr.x402_version == 2

    def test_handles_snake_case_x402_version_in_data(self):
        err = self._make_error_dict()
        err["data"]["x402_version"] = err["data"].pop("x402Version")
        pr = extract_payment_required_from_error(err)
        assert isinstance(pr, PaymentRequired)


# ===========================================================================
# convert_mcp_result
# ===========================================================================


class TestConvertMcpResult:
    def _make_sdk_result(self, content=None, is_error=False, meta=None, structured=None):
        obj = MagicMock()
        obj.content = content if content is not None else []
        obj.isError = is_error
        obj.is_error = is_error
        obj._meta = meta if meta is not None else {}
        obj.structuredContent = structured
        return obj

    def test_converts_basic_result(self):
        sdk_result = self._make_sdk_result(content=[{"type": "text", "text": "hello"}])
        result = convert_mcp_result(sdk_result)
        assert isinstance(result, MCPToolResult)
        assert result.content == [{"type": "text", "text": "hello"}]

    def test_converts_error_result(self):
        sdk_result = self._make_sdk_result(is_error=True)
        result = convert_mcp_result(sdk_result)
        assert result.is_error is True

    def test_non_list_content_becomes_empty_list(self):
        sdk_result = self._make_sdk_result()
        sdk_result.content = "not-a-list"
        result = convert_mcp_result(sdk_result)
        assert result.content == []

    def test_non_dict_meta_becomes_empty_dict(self):
        sdk_result = self._make_sdk_result()
        sdk_result._meta = "not-a-dict"
        result = convert_mcp_result(sdk_result)
        assert result.meta == {}

    def test_preserves_meta(self):
        sdk_result = self._make_sdk_result(meta={"x402/payment": "data"})
        result = convert_mcp_result(sdk_result)
        assert result.meta == {"x402/payment": "data"}

    def test_preserves_structured_content(self):
        structured = {"key": "value"}
        sdk_result = self._make_sdk_result(structured=structured)
        result = convert_mcp_result(sdk_result)
        assert result.structured_content == structured

    def test_missing_attributes_use_defaults(self):
        """Objects missing attributes should fall back to safe defaults."""
        obj = object()  # bare object with no attributes
        result = convert_mcp_result(obj)
        assert result.content == []
        assert result.is_error is False
        assert result.meta == {}
        assert result.structured_content is None


# ===========================================================================
# register_schemes
# ===========================================================================


class TestRegisterSchemes:
    def test_registers_v2_scheme_by_default(self):
        client = MagicMock()
        scheme = MagicMock()
        register_schemes(client, [{"network": "eip155:8453", "client": scheme}])
        client.register.assert_called_once_with("eip155:8453", scheme)
        client.register_v1.assert_not_called()

    def test_registers_v1_scheme_when_specified(self):
        client = MagicMock()
        scheme = MagicMock()
        register_schemes(client, [{"network": "eip155:8453", "client": scheme, "x402_version": 1}])
        client.register_v1.assert_called_once_with("eip155:8453", scheme)
        client.register.assert_not_called()

    def test_registers_multiple_schemes(self):
        client = MagicMock()
        s1, s2 = MagicMock(), MagicMock()
        register_schemes(
            client,
            [
                {"network": "eip155:8453", "client": s1},
                {"network": "eip155:1", "client": s2, "x402_version": 1},
            ],
        )
        assert client.register.call_count == 1
        assert client.register_v1.call_count == 1

    def test_no_schemes_no_calls(self):
        client = MagicMock()
        register_schemes(client, [])
        client.register.assert_not_called()
        client.register_v1.assert_not_called()


# ===========================================================================
# is_payment_required_error
# ===========================================================================


class TestIsPaymentRequiredError:
    def test_returns_true_for_payment_required_error(self):
        err = PaymentRequiredError("need payment")
        assert is_payment_required_error(err) is True

    def test_returns_false_for_generic_exception(self):
        assert is_payment_required_error(Exception("generic")) is False

    def test_returns_false_for_value_error(self):
        assert is_payment_required_error(ValueError("bad value")) is False

    def test_returns_false_for_non_exception(self):
        assert is_payment_required_error("string") is False
        assert is_payment_required_error(None) is False
