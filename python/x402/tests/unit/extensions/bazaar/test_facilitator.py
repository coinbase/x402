"""Tests for Bazaar facilitator functions."""

import json
import os
import pathlib
import socket
import subprocess
import sys
import threading

from x402.extensions.bazaar import (
    BAZAAR,
    BodyDiscoveryInfo,
    QueryDiscoveryInfo,
    declare_discovery_extension,
    extract_discovery_info,
    extract_discovery_info_from_extension,
    validate_and_extract,
    validate_discovery_extension,
)
from x402.extensions.bazaar.facilitator import _is_valid_route_template

# This directory (python/x402/) sits directly on sys.path under pytest's rootdir, which makes
# its own `http/`, `extensions/`, `mechanisms/`, `schemas/`, and `mcp/` source directories
# importable as bare top-level names (`import http`, not just `import x402.http`). That shadows
# the stdlib `http` package, which `urllib.request` (used internally by `jsonschema` to fetch
# remote `$ref`s) imports internally — turning a real SSRF attempt into an unrelated ImportError
# instead of an outbound request. The SSRF reproduction tests below run the actual validation
# call in a subprocess rooted one directory up (`_PYTHON_DIR`, the parent of this `x402/`
# package directory) so stdlib imports resolve normally, exactly as they would for anyone
# depending on this package normally rather than running pytest from inside it.
_PYTHON_DIR = pathlib.Path(__file__).resolve().parents[5]


def _validate_discovery_extension_in_subprocess(schema: dict, info: dict) -> dict:
    script = (
        "import json, sys\n"
        "from x402.extensions.bazaar import validate_discovery_extension\n"
        "schema = json.loads(sys.argv[1])\n"
        "info = json.loads(sys.argv[2])\n"
        "result = validate_discovery_extension({'schema': schema, 'info': info})\n"
        "print(json.dumps({'valid': result.valid, 'errors': result.errors}))\n"
    )
    proc = subprocess.run(
        [sys.executable, "-c", script, json.dumps(schema), json.dumps(info)],
        cwd=str(_PYTHON_DIR),
        env={**os.environ, "PYTHONPATH": str(_PYTHON_DIR)},
        capture_output=True,
        text=True,
        timeout=10,
    )
    assert proc.returncode == 0, f"subprocess failed: {proc.stderr}"
    return json.loads(proc.stdout)


def _extract_discovery_info_in_subprocess(payload: dict) -> dict:
    script = (
        "import json, sys\n"
        "from x402.extensions.bazaar import extract_discovery_info\n"
        "payload = json.loads(sys.argv[1])\n"
        "discovered = extract_discovery_info(payload, {}, validate=True)\n"
        "print(json.dumps({'discovered': discovered is not None}))\n"
    )
    proc = subprocess.run(
        [sys.executable, "-c", script, json.dumps(payload)],
        cwd=str(_PYTHON_DIR),
        env={**os.environ, "PYTHONPATH": str(_PYTHON_DIR)},
        capture_output=True,
        text=True,
        timeout=10,
    )
    assert proc.returncode == 0, f"subprocess failed: {proc.stderr}"
    return json.loads(proc.stdout)


class TestIsValidRouteTemplate:
    """Direct unit tests for the _is_valid_route_template helper."""

    def test_returns_false_for_none_input(self) -> None:
        assert _is_valid_route_template(None) is False

    def test_returns_false_for_empty_string(self) -> None:
        assert _is_valid_route_template("") is False

    def test_returns_false_for_paths_not_starting_with_slash(self) -> None:
        assert _is_valid_route_template("users/123") is False
        assert _is_valid_route_template("relative/path") is False
        assert _is_valid_route_template("no-slash") is False

    def test_returns_false_for_paths_containing_dotdot(self) -> None:
        assert _is_valid_route_template("/users/../admin") is False
        assert _is_valid_route_template("/../etc/passwd") is False
        assert _is_valid_route_template("/users/..") is False

    def test_returns_false_for_paths_containing_scheme(self) -> None:
        assert _is_valid_route_template("http://evil.com/path") is False
        assert _is_valid_route_template("/users/http://evil") is False
        assert _is_valid_route_template("javascript://foo") is False

    def test_returns_true_for_valid_paths(self) -> None:
        assert _is_valid_route_template("/users/:userId") is True
        assert _is_valid_route_template("/api/v1/items") is True
        assert _is_valid_route_template("/products/:productId/reviews/:reviewId") is True
        assert _is_valid_route_template("/weather/:country/:city") is True

    def test_returns_false_for_paths_with_spaces_or_invalid_chars(self) -> None:
        assert _is_valid_route_template("/users/ bad") is False
        assert _is_valid_route_template("/path with spaces") is False

    def test_dotdot_segment_prefix_is_rejected(self) -> None:
        assert _is_valid_route_template("/users/..hidden") is False

    def test_rejects_percent_encoded_traversal_sequences(self) -> None:
        assert _is_valid_route_template("/users/%2e%2e/admin") is False
        assert _is_valid_route_template("/users/%2E%2E/admin") is False


class TestValidateDiscoveryExtension:
    """Tests for validate_discovery_extension function."""

    def test_valid_query_extension(self) -> None:
        """Test validating a valid query extension (enriched with method per spec)."""
        ext = declare_discovery_extension(
            input={"query": "test"},
            input_schema={"properties": {"query": {"type": "string"}}},
        )
        inner = ext[BAZAAR.key]
        inner["info"]["input"]["method"] = "GET"

        result = validate_discovery_extension(inner)
        assert result.valid is True
        assert len(result.errors) == 0

    def test_valid_body_extension(self) -> None:
        """Test validating a valid body extension (enriched with method per spec)."""
        ext = declare_discovery_extension(
            input={"data": "test"},
            input_schema={"properties": {"data": {"type": "string"}}},
            body_type="json",
        )
        inner = ext[BAZAAR.key]
        inner["info"]["input"]["method"] = "POST"

        result = validate_discovery_extension(inner)
        assert result.valid is True

    def test_method_required_enforcement(self) -> None:
        """Test that validation fails when method is absent per spec."""
        ext = declare_discovery_extension(
            input={"query": "test"},
            input_schema={"properties": {"query": {"type": "string"}}},
        )

        result = validate_discovery_extension(ext[BAZAAR.key])
        assert result.valid is False
        assert any("method" in e for e in result.errors)


class TestExtractDiscoveryInfo:
    """Tests for extract_discovery_info function."""

    def test_extract_v2_query_extension(self) -> None:
        """Test extracting discovery info from v2 payload with query extension."""
        ext = declare_discovery_extension(
            input={"city": "SF"},
            input_schema={"properties": {"city": {"type": "string"}}},
        )

        # Convert extension to dict format for payload
        ext_dict = ext[BAZAAR.key]
        if hasattr(ext_dict, "model_dump"):
            ext_dict = ext_dict.model_dump(by_alias=True)
        ext_dict["info"]["input"]["method"] = "GET"

        payload = {
            "x402Version": 2,
            "resource": {"url": "https://api.example.com/weather"},
            "extensions": {BAZAAR.key: ext_dict},
            "accepted": {},
        }
        requirements = {"scheme": "exact", "network": "eip155:8453"}

        result = extract_discovery_info(payload, requirements)

        assert result is not None
        assert result.resource_url == "https://api.example.com/weather"
        assert result.x402_version == 2
        assert isinstance(result.discovery_info, QueryDiscoveryInfo)

    def test_extract_v2_body_extension(self) -> None:
        """Test extracting discovery info from v2 payload with body extension."""
        ext = declare_discovery_extension(
            input={"text": "hello"},
            body_type="json",
        )

        ext_dict = ext[BAZAAR.key]
        if hasattr(ext_dict, "model_dump"):
            ext_dict = ext_dict.model_dump(by_alias=True)
        ext_dict["info"]["input"]["method"] = "POST"

        payload = {
            "x402Version": 2,
            "resource": {"url": "https://api.example.com/translate"},
            "extensions": {BAZAAR.key: ext_dict},
            "accepted": {},
        }
        requirements = {}

        result = extract_discovery_info(payload, requirements)

        assert result is not None
        assert isinstance(result.discovery_info, BodyDiscoveryInfo)

    def test_extract_missing_extension(self) -> None:
        """Test extracting when no bazaar extension is present."""
        payload = {
            "x402Version": 2,
            "resource": {"url": "https://api.example.com/data"},
            "extensions": {},
            "accepted": {},
        }
        requirements = {}

        result = extract_discovery_info(payload, requirements)
        assert result is None

    def test_extract_no_extensions(self) -> None:
        """Test extracting when extensions field is missing."""
        payload = {
            "x402Version": 2,
            "resource": {"url": "https://api.example.com/data"},
            "accepted": {},
        }
        requirements = {}

        result = extract_discovery_info(payload, requirements)
        assert result is None

    def test_strip_query_params_from_v2_resource_url(self) -> None:
        """Test that query params are stripped from v2 resourceUrl."""
        ext = declare_discovery_extension(
            input={"city": "NYC"},
            input_schema={"properties": {"city": {"type": "string"}}},
        )

        ext_dict = ext[BAZAAR.key]
        if hasattr(ext_dict, "model_dump"):
            ext_dict = ext_dict.model_dump(by_alias=True)
        ext_dict["info"]["input"]["method"] = "GET"

        payload = {
            "x402Version": 2,
            "resource": {"url": "https://api.example.com/weather?city=NYC&units=metric"},
            "extensions": {BAZAAR.key: ext_dict},
            "accepted": {},
        }

        result = extract_discovery_info(payload, {})

        assert result is not None
        assert result.resource_url == "https://api.example.com/weather"

    def test_strip_hash_sections_from_v2_resource_url(self) -> None:
        """Test that hash sections are stripped from v2 resourceUrl."""
        ext = declare_discovery_extension(
            input={},
            input_schema={"properties": {}},
        )

        ext_dict = ext[BAZAAR.key]
        if hasattr(ext_dict, "model_dump"):
            ext_dict = ext_dict.model_dump(by_alias=True)
        ext_dict["info"]["input"]["method"] = "GET"

        payload = {
            "x402Version": 2,
            "resource": {"url": "https://api.example.com/docs#section-1"},
            "extensions": {BAZAAR.key: ext_dict},
            "accepted": {},
        }

        result = extract_discovery_info(payload, {})

        assert result is not None
        assert result.resource_url == "https://api.example.com/docs"

    def test_strip_query_params_and_hash_from_v2_resource_url(self) -> None:
        """Test that both query params and hash sections are stripped from v2 resourceUrl."""
        ext = declare_discovery_extension(
            input={},
            input_schema={"properties": {}},
        )

        ext_dict = ext[BAZAAR.key]
        if hasattr(ext_dict, "model_dump"):
            ext_dict = ext_dict.model_dump(by_alias=True)
        ext_dict["info"]["input"]["method"] = "GET"

        payload = {
            "x402Version": 2,
            "resource": {"url": "https://api.example.com/page?foo=bar#anchor"},
            "extensions": {BAZAAR.key: ext_dict},
            "accepted": {},
        }

        result = extract_discovery_info(payload, {})

        assert result is not None
        assert result.resource_url == "https://api.example.com/page"

    def test_strip_query_params_from_v1_resource_url(self) -> None:
        """Test that query params are stripped from v1 resourceUrl."""
        v1_requirements = {
            "scheme": "exact",
            "network": "eip155:8453",
            "maxAmountRequired": "10000",
            "resource": "https://api.example.com/search?q=test&page=1",
            "description": "Search",
            "mimeType": "application/json",
            "outputSchema": {
                "input": {
                    "type": "http",
                    "method": "GET",
                    "discoverable": True,
                    "queryParams": {"q": "string", "page": "number"},
                },
            },
            "payTo": "0x...",
            "maxTimeoutSeconds": 300,
            "asset": "0x...",
            "extra": {},
        }

        v1_payload = {
            "x402Version": 1,
            "scheme": "exact",
            "network": "eip155:8453",
            "payload": {},
        }

        result = extract_discovery_info(v1_payload, v1_requirements)

        assert result is not None
        assert result.resource_url == "https://api.example.com/search"

    def test_strip_hash_sections_from_v1_resource_url(self) -> None:
        """Test that hash sections are stripped from v1 resourceUrl."""
        v1_requirements = {
            "scheme": "exact",
            "network": "eip155:8453",
            "maxAmountRequired": "10000",
            "resource": "https://api.example.com/docs#section",
            "description": "Docs",
            "mimeType": "application/json",
            "outputSchema": {
                "input": {
                    "type": "http",
                    "method": "GET",
                    "discoverable": True,
                },
            },
            "payTo": "0x...",
            "maxTimeoutSeconds": 300,
            "asset": "0x...",
            "extra": {},
        }

        v1_payload = {
            "x402Version": 1,
            "scheme": "exact",
            "network": "eip155:8453",
            "payload": {},
        }

        result = extract_discovery_info(v1_payload, v1_requirements)

        assert result is not None
        assert result.resource_url == "https://api.example.com/docs"


class TestExtractDiscoveryInfoFromExtension:
    """Tests for extract_discovery_info_from_extension function."""

    def test_extract_valid_extension(self) -> None:
        """Test extracting info from a valid extension."""
        ext = declare_discovery_extension(
            input={"q": "test"},
        )
        inner = ext[BAZAAR.key]
        inner["info"]["input"]["method"] = "GET"

        info = extract_discovery_info_from_extension(inner)
        assert isinstance(info, QueryDiscoveryInfo)

    def test_extract_without_validation(self) -> None:
        """Test extracting info without validation."""
        ext = declare_discovery_extension(
            input={"q": "test"},
        )

        info = extract_discovery_info_from_extension(ext[BAZAAR.key], validate=False)
        assert info is not None


class TestValidateAndExtract:
    """Tests for validate_and_extract function."""

    def test_valid_extension(self) -> None:
        """Test validate_and_extract with valid extension."""
        ext = declare_discovery_extension(
            input={"query": "test"},
        )
        inner = ext[BAZAAR.key]
        inner["info"]["input"]["method"] = "GET"

        result = validate_and_extract(inner)
        assert result.valid is True
        assert result.info is not None
        assert len(result.errors) == 0

    def test_returns_info_on_success(self) -> None:
        """Test that info is returned on successful validation."""
        ext = declare_discovery_extension(
            input={"name": "test"},
            body_type="json",
        )
        inner = ext[BAZAAR.key]
        inner["info"]["input"]["method"] = "POST"

        result = validate_and_extract(inner)
        assert result.valid is True
        assert isinstance(result.info, BodyDiscoveryInfo)


class TestDynamicRoutesFacilitator:
    """Tests for dynamic route handling in the facilitator."""

    def test_route_template_used_for_canonical_url(self) -> None:
        """When routeTemplate is present, it should override the concrete URL path."""
        ext = declare_discovery_extension(input={})
        declaration = ext[BAZAAR.key]
        if hasattr(declaration, "model_dump"):
            declaration = declaration.model_dump(by_alias=True)
        # Inject routeTemplate as if the server extension enriched it
        declaration["routeTemplate"] = "/users/:userId"
        declaration["info"]["input"]["pathParams"] = {"userId": "123"}

        payload = {
            "x402Version": 2,
            "scheme": "exact",
            "network": "eip155:8453",
            "payload": {},
            "accepted": {},
            "resource": {"url": "http://example.com/users/123"},
            "extensions": {BAZAAR.key: declaration},
        }

        discovered = extract_discovery_info(payload, {}, validate=False)

        assert discovered is not None
        assert discovered.resource_url == "http://example.com/users/:userId"
        assert discovered.route_template == "/users/:userId"

    def test_static_route_uses_concrete_url(self) -> None:
        """Without routeTemplate, the stripped concrete URL should be used."""
        ext = declare_discovery_extension(
            input={"query": "test"},
            input_schema={"properties": {"query": {"type": "string"}}},
        )
        declaration = ext[BAZAAR.key]
        if hasattr(declaration, "model_dump"):
            declaration = declaration.model_dump(by_alias=True)

        payload = {
            "x402Version": 2,
            "scheme": "exact",
            "network": "eip155:8453",
            "payload": {},
            "accepted": {},
            "resource": {"url": "http://example.com/search?q=test"},
            "extensions": {BAZAAR.key: declaration},
        }

        discovered = extract_discovery_info(payload, {}, validate=False)

        assert discovered is not None
        assert discovered.resource_url == "http://example.com/search"
        assert discovered.route_template is None


class _HitCountingServer:
    """Minimal raw-socket HTTP server used to prove (or disprove) SSRF.

    Deliberately avoids the stdlib `http.server` module: this package has its own top-level
    `http` module (x402.http), which shadows the stdlib `http` package during test collection.
    """

    def __init__(self) -> None:
        self.hits = 0
        self._sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self._sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self._sock.bind(("127.0.0.1", 0))
        self._sock.listen(5)
        self.url = f"http://127.0.0.1:{self._sock.getsockname()[1]}"
        self._thread = threading.Thread(target=self._serve, daemon=True)
        self._thread.start()

    def _serve(self) -> None:
        while True:
            try:
                conn, _ = self._sock.accept()
            except OSError:
                return
            self.hits += 1
            conn.recv(4096)
            body = b'{"type": "object"}'
            response = (
                b"HTTP/1.1 200 OK\r\n"
                b"Content-Type: application/json\r\n"
                b"Content-Length: " + str(len(body)).encode() + b"\r\n"
                b"Connection: close\r\n\r\n" + body
            )
            conn.sendall(response)
            conn.close()

    def shutdown(self) -> None:
        self._sock.close()


def _start_hit_counting_server() -> _HitCountingServer:
    return _HitCountingServer()


class TestValidateDiscoveryExtensionSSRF:
    """Reproduces CWE-918: a client-controlled schema `$ref` must never be dereferenced.

    `jsonschema`'s default registry (`_REMOTE_WARNING_REGISTRY`) resolves any unregistered
    `$ref` via `urllib.request.urlopen`, which fetches both http(s):// and file:// URIs, before
    only *warning* that the behavior is deprecated. Since `schema` arrives in the client's
    payment payload, this is a real SSRF / local file disclosure vector
    (go/extensions/bazaar equivalent: facilitator.go's hasExternalSchemaReference).
    """

    def test_rejects_ref_over_http_without_dereferencing_it(self) -> None:
        server = _start_hit_counting_server()
        url = server.url
        try:
            result = _validate_discovery_extension_in_subprocess(
                schema={"$ref": f"{url}/attacker-schema.json"},
                info={"input": {"type": "http", "method": "GET"}},
            )

            assert server.hits == 0, (
                "an attacker-controlled $ref must never cause an outbound HTTP request "
                "(CWE-918 SSRF)"
            )
            assert result["valid"] is False, "schema with an external $ref must be rejected"
        finally:
            server.shutdown()

    def test_rejects_ref_via_file_uri_without_reading_the_file(self) -> None:
        # Deliberately written inside the repo tree rather than the pytest `tmp_path` fixture's
        # system temp dir: this test's sandbox denies reads outside the repo, which would mask
        # the vulnerability by making an unguarded jsonschema.validate() *fail* for the wrong
        # reason (a read error) instead of the right one (a real local file read succeeding).
        secret = pathlib.Path(__file__).parent / "_tmp_ssrf_test_secret.json"
        secret.write_text('{"type": "object"}')
        try:
            result = _validate_discovery_extension_in_subprocess(
                schema={"$ref": secret.as_uri()},
                info={"input": {"type": "http", "method": "GET"}},
            )

            assert result["valid"] is False, "schema with a file:// $ref must be rejected"
        finally:
            secret.unlink()

    def test_rejects_ref_nested_inside_schema_properties(self) -> None:
        server = _start_hit_counting_server()
        url = server.url
        try:
            result = _validate_discovery_extension_in_subprocess(
                schema={"properties": {"input": {"$ref": f"{url}/attacker-schema.json"}}},
                info={"input": {"type": "http", "method": "GET"}},
            )

            assert server.hits == 0, "nested $ref must not be dereferenced"
            assert result["valid"] is False
        finally:
            server.shutdown()

    def test_still_validates_schemas_with_only_local_fragment_refs(self) -> None:
        extension = {
            "info": {"input": {"type": "http", "method": "GET"}},
            "schema": {
                "$ref": "#/definitions/root",
                "definitions": {"root": {"type": "object"}},
            },
        }

        result = validate_discovery_extension(extension)
        assert result.valid is True, f"local fragment $ref should still work: {result.errors}"


class TestExtractDiscoveryInfoSSRF:
    """End-to-end reproduction matching the real attack path: a client's paymentPayload with a
    malicious extensions.bazaar.schema, processed via extract_discovery_info(validate=True) the
    way a facilitator's OnAfterVerify hook does.
    """

    def test_extract_discovery_info_does_not_dereference_malicious_ref(self) -> None:
        server = _start_hit_counting_server()
        url = server.url
        try:
            payload = {
                "x402Version": 2,
                "scheme": "exact",
                "network": "eip155:84532",
                "payload": {},
                "accepted": {},
                "resource": {"url": "http://api.example.com/weather"},
                "extensions": {
                    BAZAAR.key: {
                        "info": {"input": {"type": "http", "method": "GET"}},
                        "schema": {"$ref": f"{url}/attacker-schema.json"},
                    },
                },
            }

            result = _extract_discovery_info_in_subprocess(payload)

            assert server.hits == 0, (
                "an attacker-controlled $ref in extensions.bazaar.schema must never cause "
                "the facilitator to make an outbound HTTP request (CWE-918 SSRF)"
            )
            assert result["discovered"] is False, (
                "a schema containing an external $ref should fail validation, not silently "
                "succeed"
            )
        finally:
            server.shutdown()
