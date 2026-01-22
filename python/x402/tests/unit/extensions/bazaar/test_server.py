"""Tests for Bazaar server extension."""

from x402.extensions.bazaar import (
    BAZAAR,
    bazaar_resource_server_extension,
    declare_discovery_extension,
)


class MockHTTPRequest:
    """Mock HTTP request context for testing."""

    def __init__(self, method: str = "GET") -> None:
        self._method = method

    @property
    def method(self) -> str:
        return self._method


class TestBazaarResourceServerExtension:
    """Tests for BazaarResourceServerExtension."""

    def test_extension_key(self) -> None:
        """Test extension key is correct."""
        assert bazaar_resource_server_extension.key == BAZAAR

    def test_enrich_with_http_context(self) -> None:
        """Test enriching declaration with HTTP context."""
        ext = declare_discovery_extension(
            input={"query": "test"},
        )
        declaration = ext[BAZAAR]

        # Convert to dict if needed
        if hasattr(declaration, "model_dump"):
            declaration = declaration.model_dump(by_alias=True)

        context = MockHTTPRequest(method="GET")
        enriched = bazaar_resource_server_extension.enrich_declaration(declaration, context)

        assert enriched["info"]["input"]["method"] == "GET"

    def test_enrich_post_method(self) -> None:
        """Test enriching with POST method."""
        ext = declare_discovery_extension(
            input={"data": "test"},
            body_type="json",
        )
        declaration = ext[BAZAAR]

        if hasattr(declaration, "model_dump"):
            declaration = declaration.model_dump(by_alias=True)

        context = MockHTTPRequest(method="POST")
        enriched = bazaar_resource_server_extension.enrich_declaration(declaration, context)

        assert enriched["info"]["input"]["method"] == "POST"

    def test_enrich_no_context(self) -> None:
        """Test enriching without HTTP context returns unchanged."""
        ext = declare_discovery_extension(
            input={"query": "test"},
        )
        declaration = ext[BAZAAR]

        if hasattr(declaration, "model_dump"):
            declaration = declaration.model_dump(by_alias=True)

        # Pass None context
        enriched = bazaar_resource_server_extension.enrich_declaration(declaration, None)

        # Should return unchanged (no method injection)
        assert enriched == declaration

    def test_enrich_invalid_context(self) -> None:
        """Test enriching with invalid context returns unchanged."""
        ext = declare_discovery_extension(
            input={"query": "test"},
        )
        declaration = ext[BAZAAR]

        if hasattr(declaration, "model_dump"):
            declaration = declaration.model_dump(by_alias=True)

        # Pass an object without method attribute
        enriched = bazaar_resource_server_extension.enrich_declaration(
            declaration, {"not_a_request": True}
        )

        assert enriched == declaration

    def test_schema_requires_method_after_enrich(self) -> None:
        """Test that schema requires method after enrichment."""
        ext = declare_discovery_extension(
            input={"query": "test"},
        )
        declaration = ext[BAZAAR]

        if hasattr(declaration, "model_dump"):
            declaration = declaration.model_dump(by_alias=True)

        context = MockHTTPRequest(method="DELETE")
        enriched = bazaar_resource_server_extension.enrich_declaration(declaration, context)

        schema = enriched.get("schema", {})
        input_schema = schema.get("properties", {}).get("input", {})
        required = input_schema.get("required", [])
        assert "method" in required

    def test_enrich_preserves_existing_data(self) -> None:
        """Test that enrichment preserves existing declaration data."""
        ext = declare_discovery_extension(
            input={"city": "San Francisco", "units": "celsius"},
            input_schema={
                "properties": {
                    "city": {"type": "string"},
                    "units": {"type": "string"},
                },
            },
        )
        declaration = ext[BAZAAR]

        if hasattr(declaration, "model_dump"):
            declaration = declaration.model_dump(by_alias=True)

        context = MockHTTPRequest(method="GET")
        enriched = bazaar_resource_server_extension.enrich_declaration(declaration, context)

        # Check original data preserved
        assert enriched["info"]["input"]["type"] == "http"
        # Check queryParams preserved
        query_params = enriched["info"]["input"].get("queryParams")
        if query_params:
            assert "city" in query_params or "city" in str(query_params)
