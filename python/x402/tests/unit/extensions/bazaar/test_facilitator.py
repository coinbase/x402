"""Tests for Bazaar facilitator functions."""

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


class TestValidateDiscoveryExtension:
    """Tests for validate_discovery_extension function."""

    def test_valid_query_extension(self) -> None:
        """Test validating a valid query extension."""
        ext = declare_discovery_extension(
            input={"query": "test"},
            input_schema={"properties": {"query": {"type": "string"}}},
        )

        result = validate_discovery_extension(ext[BAZAAR])
        assert result.valid is True
        assert len(result.errors) == 0

    def test_valid_body_extension(self) -> None:
        """Test validating a valid body extension."""
        ext = declare_discovery_extension(
            input={"data": "test"},
            input_schema={"properties": {"data": {"type": "string"}}},
            body_type="json",
        )

        result = validate_discovery_extension(ext[BAZAAR])
        assert result.valid is True


class TestExtractDiscoveryInfo:
    """Tests for extract_discovery_info function."""

    def test_extract_v2_query_extension(self) -> None:
        """Test extracting discovery info from v2 payload with query extension."""
        ext = declare_discovery_extension(
            input={"city": "SF"},
            input_schema={"properties": {"city": {"type": "string"}}},
        )

        # Convert extension to dict format for payload
        ext_dict = ext[BAZAAR]
        if hasattr(ext_dict, "model_dump"):
            ext_dict = ext_dict.model_dump(by_alias=True)

        payload = {
            "x402Version": 2,
            "resource": {"url": "https://api.example.com/weather"},
            "extensions": {BAZAAR: ext_dict},
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

        ext_dict = ext[BAZAAR]
        if hasattr(ext_dict, "model_dump"):
            ext_dict = ext_dict.model_dump(by_alias=True)

        payload = {
            "x402Version": 2,
            "resource": {"url": "https://api.example.com/translate"},
            "extensions": {BAZAAR: ext_dict},
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


class TestExtractDiscoveryInfoFromExtension:
    """Tests for extract_discovery_info_from_extension function."""

    def test_extract_valid_extension(self) -> None:
        """Test extracting info from a valid extension."""
        ext = declare_discovery_extension(
            input={"q": "test"},
        )

        info = extract_discovery_info_from_extension(ext[BAZAAR])
        assert isinstance(info, QueryDiscoveryInfo)

    def test_extract_without_validation(self) -> None:
        """Test extracting info without validation."""
        ext = declare_discovery_extension(
            input={"q": "test"},
        )

        info = extract_discovery_info_from_extension(ext[BAZAAR], validate=False)
        assert info is not None


class TestValidateAndExtract:
    """Tests for validate_and_extract function."""

    def test_valid_extension(self) -> None:
        """Test validate_and_extract with valid extension."""
        ext = declare_discovery_extension(
            input={"query": "test"},
        )

        result = validate_and_extract(ext[BAZAAR])
        assert result.valid is True
        assert result.info is not None
        assert len(result.errors) == 0

    def test_returns_info_on_success(self) -> None:
        """Test that info is returned on successful validation."""
        ext = declare_discovery_extension(
            input={"name": "test"},
            body_type="json",
        )

        result = validate_and_extract(ext[BAZAAR])
        assert result.valid is True
        assert isinstance(result.info, BodyDiscoveryInfo)
