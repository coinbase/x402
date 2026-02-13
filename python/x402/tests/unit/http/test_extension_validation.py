"""Tests for bazaar extension validation at server startup."""

from __future__ import annotations

import logging
from unittest.mock import MagicMock

import pytest

from x402.http.x402_http_server_base import x402HTTPServerBase


# =============================================================================
# Helpers
# =============================================================================


def _make_server(routes_config: dict) -> x402HTTPServerBase:
    """Create an x402HTTPServerBase with a mock underlying server."""
    mock_server = MagicMock()
    mock_server.initialize = MagicMock()
    mock_server.has_registered_scheme = MagicMock(return_value=True)
    mock_server.get_supported_kind = MagicMock(return_value=True)
    return x402HTTPServerBase(server=mock_server, routes=routes_config)


# =============================================================================
# Tests
# =============================================================================


class TestValidateExtensions:
    """Tests for _validate_extensions() on x402HTTPServerBase."""

    def test_valid_bazaar_extension_no_warnings(self) -> None:
        """Valid bazaar extension should produce no warnings."""
        routes = {
            "GET /api/jobs": {
                "accepts": [
                    {
                        "scheme": "exact",
                        "payTo": "0x123",
                        "price": "$0.01",
                        "network": "eip155:84532",
                    }
                ],
                "extensions": {
                    "bazaar": {
                        "info": {
                            "input": {
                                "type": "http",
                                "method": "GET",
                            },
                        },
                        "schema": {
                            "$schema": "https://json-schema.org/draft/2020-12/schema",
                            "type": "object",
                            "properties": {
                                "input": {
                                    "type": "object",
                                    "properties": {
                                        "type": {"type": "string", "const": "http"},
                                        "method": {
                                            "type": "string",
                                            "enum": ["GET"],
                                        },
                                    },
                                    "required": ["type", "method"],
                                },
                            },
                            "required": ["input"],
                        },
                    },
                },
            },
        }
        server = _make_server(routes)
        warnings = server._validate_extensions()
        assert warnings == []

    def test_invalid_bazaar_extension_emits_warning(self, caplog: pytest.LogCaptureFixture) -> None:
        """Invalid bazaar extension should emit warning but not raise."""
        routes = {
            "GET /api/jobs": {
                "accepts": [
                    {
                        "scheme": "exact",
                        "payTo": "0x123",
                        "price": "$0.01",
                        "network": "eip155:84532",
                    }
                ],
                "extensions": {
                    "bazaar": {
                        "info": {
                            "input": {
                                "type": "http",
                                "method": "GET",
                            },
                            # Missing "output" required by schema
                        },
                        "schema": {
                            "$schema": "https://json-schema.org/draft/2020-12/schema",
                            "type": "object",
                            "properties": {
                                "input": {
                                    "type": "object",
                                    "properties": {
                                        "type": {"type": "string"},
                                        "method": {"type": "string"},
                                    },
                                    "required": ["type", "method"],
                                },
                                "output": {
                                    "type": "object",
                                    "properties": {
                                        "jobs": {"type": "array"},
                                        "count": {"type": "number"},
                                    },
                                    "required": ["jobs", "count"],
                                },
                            },
                            "required": ["input", "output"],
                        },
                    },
                },
            },
        }
        server = _make_server(routes)
        with caplog.at_level(logging.WARNING):
            warnings = server._validate_extensions()

        assert len(warnings) > 0
        assert "Bazaar extension validation warning" in warnings[0]

    def test_no_bazaar_extension_no_validation(self) -> None:
        """Routes without bazaar extensions should trigger no validation."""
        routes = {
            "GET /api/data": {
                "accepts": [
                    {
                        "scheme": "exact",
                        "payTo": "0x123",
                        "price": "$0.01",
                        "network": "eip155:84532",
                    }
                ],
                "description": "No extensions",
            },
        }
        server = _make_server(routes)
        warnings = server._validate_extensions()
        assert warnings == []

    def test_bug_report_missing_required_field(self, caplog: pytest.LogCaptureFixture) -> None:
        """Schema requires ["jobs", "count"] but info only has jobs -- should warn."""
        routes = {
            "GET /api/jobs": {
                "accepts": [
                    {
                        "scheme": "exact",
                        "payTo": "0x123",
                        "price": "$0.01",
                        "network": "eip155:84532",
                    }
                ],
                "extensions": {
                    "bazaar": {
                        "info": {
                            "input": {
                                "type": "http",
                                "method": "GET",
                            },
                            "output": {
                                "jobs": [{"title": "Engineer"}],
                                # "count" is missing but required by schema
                            },
                        },
                        "schema": {
                            "$schema": "https://json-schema.org/draft/2020-12/schema",
                            "type": "object",
                            "properties": {
                                "input": {
                                    "type": "object",
                                    "properties": {
                                        "type": {"type": "string"},
                                        "method": {"type": "string"},
                                    },
                                    "required": ["type", "method"],
                                },
                                "output": {
                                    "type": "object",
                                    "properties": {
                                        "jobs": {"type": "array"},
                                        "count": {"type": "number"},
                                    },
                                    "required": ["jobs", "count"],
                                },
                            },
                            "required": ["input", "output"],
                        },
                    },
                },
            },
        }
        server = _make_server(routes)
        with caplog.at_level(logging.WARNING):
            warnings = server._validate_extensions()

        assert len(warnings) > 0
        assert "Bazaar extension validation warning" in warnings[0]
