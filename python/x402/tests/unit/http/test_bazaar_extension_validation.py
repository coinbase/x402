"""Tests for startup-time bazaar extension validation in middleware packages."""

from __future__ import annotations

import warnings
from unittest.mock import MagicMock, patch

import pytest

from x402.http.types import (
    PaymentOption,
    RouteConfig,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_payment_option():
    return PaymentOption(
        scheme="exact",
        pay_to="0x123",
        price="$0.01",
        network="eip155:84532",
    )


# ---------------------------------------------------------------------------
# FastAPI middleware validation tests
# ---------------------------------------------------------------------------


class TestFastAPIBazaarExtensionValidation:
    """Tests for bazaar extension validation in FastAPI middleware startup."""

    def test_no_extension_no_warning(self):
        """A route with no extensions should produce no bazaar warning."""
        from x402.http.middleware.fastapi import _validate_bazaar_extensions

        routes = {
            "GET /api/data": RouteConfig(
                accepts=[_make_payment_option()],
                extensions=None,
            )
        }

        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            _validate_bazaar_extensions(routes)

        bazaar_warnings = [w for w in caught if "bazaar" in str(w.message).lower()]
        assert len(bazaar_warnings) == 0

    def test_valid_extension_no_warning(self):
        """A route with a valid bazaar extension should produce no warning."""
        from x402.http.middleware.fastapi import _validate_bazaar_extensions

        routes = {
            "GET /api/data": RouteConfig(
                accepts=[_make_payment_option()],
                extensions={
                    "bazaar": {
                        "info": {
                            "input": {"type": "http", "method": "GET"},
                            "output": {"type": "string"},
                        },
                        "schema": {
                            "type": "object",
                            "properties": {
                                "input": {"type": "object"},
                                "output": {"type": "object"},
                            },
                            "required": ["input"],
                        },
                    }
                },
            )
        }

        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            _validate_bazaar_extensions(routes)

        bazaar_warnings = [w for w in caught if "bazaar" in str(w.message).lower()]
        assert len(bazaar_warnings) == 0

    def test_invalid_extension_emits_warning(self):
        """A route with schema requiring fields absent from info should emit a warning."""
        from x402.http.middleware.fastapi import _validate_bazaar_extensions

        routes = {
            "GET /api/data": RouteConfig(
                accepts=[_make_payment_option()],
                extensions={
                    "bazaar": {
                        "info": {
                            "input": {"type": "http", "method": "GET"},
                        },
                        "schema": {
                            "type": "object",
                            "properties": {
                                "input": {"type": "object"},
                                "jobs": {"type": "array"},
                                "count": {"type": "integer"},
                            },
                            "required": ["input", "jobs", "count"],
                        },
                    }
                },
            )
        }

        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            _validate_bazaar_extensions(routes)

        bazaar_warnings = [w for w in caught if "bazaar" in str(w.message).lower()]
        assert len(bazaar_warnings) == 1
        assert "invalid bazaar extension" in str(bazaar_warnings[0].message).lower()

    def test_non_bazaar_extension_not_warned(self):
        """Non-bazaar extensions should not trigger bazaar warnings."""
        from x402.http.middleware.fastapi import _validate_bazaar_extensions

        routes = {
            "GET /api/data": RouteConfig(
                accepts=[_make_payment_option()],
                extensions={
                    "other-extension": {
                        "info": {},
                        "schema": {"required": ["missing_field"]},
                    }
                },
            )
        }

        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            _validate_bazaar_extensions(routes)

        bazaar_warnings = [w for w in caught if "bazaar" in str(w.message).lower()]
        assert len(bazaar_warnings) == 0

    def test_validation_skipped_when_bazaar_unavailable(self):
        """When bazaar validation is not importable, no exception should be raised."""
        from x402.http.middleware.fastapi import _validate_bazaar_extensions

        routes = {
            "GET /api/data": RouteConfig(
                accepts=[_make_payment_option()],
                extensions={
                    "bazaar": {
                        "info": {},
                        "schema": {"required": ["missing_field"]},
                    }
                },
            )
        }

        with patch(
            "x402.http.middleware.fastapi._validate_bazaar_extensions.__module__",
            side_effect=ImportError,
        ):
            with warnings.catch_warnings(record=True):
                warnings.simplefilter("always")
                _validate_bazaar_extensions(routes)


# ---------------------------------------------------------------------------
# Flask middleware validation tests
# ---------------------------------------------------------------------------


try:
    import flask as _flask  # noqa: F401

    _HAS_FLASK = True
except ImportError:
    _HAS_FLASK = False


@pytest.mark.skipif(not _HAS_FLASK, reason="flask not installed")
class TestFlaskBazaarExtensionValidation:
    """Tests for bazaar extension validation in Flask middleware startup."""

    def test_no_extension_no_warning(self):
        """A route with no extensions should produce no bazaar warning."""
        from x402.http.middleware.flask import _validate_bazaar_extensions

        routes = {
            "GET /api/data": RouteConfig(
                accepts=[_make_payment_option()],
                extensions=None,
            )
        }

        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            _validate_bazaar_extensions(routes)

        bazaar_warnings = [w for w in caught if "bazaar" in str(w.message).lower()]
        assert len(bazaar_warnings) == 0

    def test_valid_extension_no_warning(self):
        """A route with a valid bazaar extension should produce no warning."""
        from x402.http.middleware.flask import _validate_bazaar_extensions

        routes = {
            "GET /api/data": RouteConfig(
                accepts=[_make_payment_option()],
                extensions={
                    "bazaar": {
                        "info": {
                            "input": {"type": "http", "method": "GET"},
                            "output": {"type": "string"},
                        },
                        "schema": {
                            "type": "object",
                            "properties": {
                                "input": {"type": "object"},
                                "output": {"type": "object"},
                            },
                            "required": ["input"],
                        },
                    }
                },
            )
        }

        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            _validate_bazaar_extensions(routes)

        bazaar_warnings = [w for w in caught if "bazaar" in str(w.message).lower()]
        assert len(bazaar_warnings) == 0

    def test_invalid_extension_emits_warning(self):
        """A route with an invalid bazaar extension should emit a warning."""
        from x402.http.middleware.flask import _validate_bazaar_extensions

        routes = {
            "GET /api/data": RouteConfig(
                accepts=[_make_payment_option()],
                extensions={
                    "bazaar": {
                        "info": {
                            "input": {"type": "http", "method": "GET"},
                        },
                        "schema": {
                            "type": "object",
                            "properties": {
                                "input": {"type": "object"},
                                "jobs": {"type": "array"},
                                "count": {"type": "integer"},
                            },
                            "required": ["input", "jobs", "count"],
                        },
                    }
                },
            )
        }

        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            _validate_bazaar_extensions(routes)

        bazaar_warnings = [w for w in caught if "bazaar" in str(w.message).lower()]
        assert len(bazaar_warnings) == 1
        assert "invalid bazaar extension" in str(bazaar_warnings[0].message).lower()


# ---------------------------------------------------------------------------
# Core server base no longer validates bazaar extensions
# ---------------------------------------------------------------------------


class TestCoreNoLongerValidatesBazaar:
    """Verify that the core HTTP server base does not emit bazaar warnings."""

    def test_core_does_not_warn_on_invalid_bazaar(self):
        """Core _validate_route_configuration should not emit bazaar warnings."""
        from x402.http.x402_http_server_base import x402HTTPServerBase

        mock_server = MagicMock()
        mock_server.has_registered_scheme.return_value = True
        mock_server.get_supported_kind.return_value = "exact"

        routes = {
            "GET /api/data": RouteConfig(
                accepts=[_make_payment_option()],
                extensions={
                    "bazaar": {
                        "info": {"input": {"type": "http", "method": "GET"}},
                        "schema": {
                            "type": "object",
                            "properties": {"input": {"type": "object"}, "jobs": {"type": "array"}},
                            "required": ["input", "jobs"],
                        },
                    }
                },
            )
        }

        base = x402HTTPServerBase.__new__(x402HTTPServerBase)
        base._server = mock_server
        base._routes_config = routes
        base._compiled_routes = []
        base._paywall_provider = None
        base._compile_routes(routes)

        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            errors = base._validate_route_configuration()

        assert errors == []
        bazaar_warnings = [w for w in caught if "bazaar" in str(w.message).lower()]
        assert len(bazaar_warnings) == 0
