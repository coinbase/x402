"""Tests for x402 interfaces and protocol definitions.

This module tests the core interfaces, particularly FacilitatorContext
and FacilitatorExtension classes.
"""

import pytest

from x402.interfaces import FacilitatorContext, FacilitatorExtension


class TestFacilitatorExtension:
    """Test FacilitatorExtension base class."""

    def test_creation(self):
        """Test that FacilitatorExtension can be created with a key."""
        ext = FacilitatorExtension(key="test_extension")
        assert ext.key == "test_extension"

    def test_frozen_dataclass(self):
        """Test that FacilitatorExtension is frozen (immutable)."""
        ext = FacilitatorExtension(key="test")

        # Should not be able to modify the key
        with pytest.raises(AttributeError):
            ext.key = "modified"

    def test_hashable(self):
        """Test that FacilitatorExtension is hashable due to frozen=True."""
        ext1 = FacilitatorExtension(key="test")
        ext2 = FacilitatorExtension(key="test")
        ext3 = FacilitatorExtension(key="other")

        # Should be able to use as dict key
        test_dict = {ext1: "value1", ext2: "value2", ext3: "value3"}

        # Same key should overwrite
        assert len(test_dict) == 2
        assert test_dict[ext1] == "value2"  # ext2 overwrote ext1
        assert test_dict[ext3] == "value3"

    def test_equality(self):
        """Test that extensions with same key are equal."""
        ext1 = FacilitatorExtension(key="test")
        ext2 = FacilitatorExtension(key="test")
        ext3 = FacilitatorExtension(key="other")

        assert ext1 == ext2
        assert ext1 != ext3


class TestFacilitatorContext:
    """Test FacilitatorContext class."""

    def test_creation_empty(self):
        """Test creating FacilitatorContext with no extensions."""
        context = FacilitatorContext({})
        assert context.get_extension("any_key") is None

    def test_creation_with_extensions(self):
        """Test creating FacilitatorContext with extensions."""
        ext1 = FacilitatorExtension(key="ext1")
        ext2 = FacilitatorExtension(key="ext2")
        extensions = {"ext1": ext1, "ext2": ext2}

        context = FacilitatorContext(extensions)
        assert context.get_extension("ext1") == ext1
        assert context.get_extension("ext2") == ext2

    def test_get_extension_exists(self):
        """Test get_extension returns correct extension when it exists."""
        ext = FacilitatorExtension(key="test_ext")
        context = FacilitatorContext({"test_ext": ext})

        result = context.get_extension("test_ext")
        assert result == ext
        assert result.key == "test_ext"

    def test_get_extension_not_exists(self):
        """Test get_extension returns None when extension doesn't exist."""
        context = FacilitatorContext({"existing": FacilitatorExtension(key="existing")})

        result = context.get_extension("nonexistent")
        assert result is None

    def test_get_extension_case_sensitive(self):
        """Test that get_extension is case-sensitive."""
        ext = FacilitatorExtension(key="TestExt")
        context = FacilitatorContext({"TestExt": ext})

        assert context.get_extension("TestExt") == ext
        assert context.get_extension("testext") is None
        assert context.get_extension("TESTEXT") is None

    def test_extension_isolation(self):
        """Test that modifying original extensions dict doesn't affect context."""
        ext1 = FacilitatorExtension(key="ext1")
        ext2 = FacilitatorExtension(key="ext2")
        original_extensions = {"ext1": ext1}

        context = FacilitatorContext(original_extensions)

        # Modify original dict
        original_extensions["ext2"] = ext2

        # Context should not see the modification
        assert context.get_extension("ext1") == ext1
        assert context.get_extension("ext2") is None

    def test_has_extension(self):
        """Test has_extension method."""
        ext = FacilitatorExtension(key="test_ext")
        context = FacilitatorContext({"test_ext": ext})

        assert context.has_extension("test_ext") is True
        assert context.has_extension("nonexistent") is False

    def test_get_extension_keys(self):
        """Test get_extension_keys method."""
        ext1 = FacilitatorExtension(key="ext1")
        ext2 = FacilitatorExtension(key="ext2")
        ext3 = FacilitatorExtension(key="ext3")

        context = FacilitatorContext({
            "ext2": ext2,
            "ext1": ext1,
            "ext3": ext3
        })

        keys = context.get_extension_keys()
        assert set(keys) == {"ext1", "ext2", "ext3"}
        assert len(keys) == 3

    def test_get_extension_keys_empty(self):
        """Test get_extension_keys with no extensions."""
        context = FacilitatorContext({})
        assert context.get_extension_keys() == []

    def test_get_extension_count(self):
        """Test get_extension_count method."""
        # Empty context
        context_empty = FacilitatorContext({})
        assert context_empty.get_extension_count() == 0

        # Context with extensions
        ext1 = FacilitatorExtension(key="ext1")
        ext2 = FacilitatorExtension(key="ext2")
        context_with_exts = FacilitatorContext({"ext1": ext1, "ext2": ext2})
        assert context_with_exts.get_extension_count() == 2


class MockExtension(FacilitatorExtension):
    """Mock extension for testing custom extensions."""

    def __init__(self, key: str, value: str = "default"):
        super().__init__(key=key)
        self.value = value


class TestCustomExtensions:
    """Test behavior with custom extension subclasses."""

    def test_custom_extension_subclass(self):
        """Test that custom extension subclasses work properly."""
        mock_ext = MockExtension(key="mock", value="test_value")
        context = FacilitatorContext({"mock": mock_ext})

        retrieved = context.get_extension("mock")
        assert retrieved == mock_ext
        assert isinstance(retrieved, MockExtension)
        assert retrieved.value == "test_value"

    def test_mixed_extension_types(self):
        """Test context with mixed extension types."""
        base_ext = FacilitatorExtension(key="base")
        mock_ext = MockExtension(key="mock", value="test")

        context = FacilitatorContext({
            "base": base_ext,
            "mock": mock_ext
        })

        assert context.get_extension("base") == base_ext
        assert context.get_extension("mock") == mock_ext
        assert isinstance(context.get_extension("mock"), MockExtension)

    def test_extension_with_special_characters(self):
        """Test extensions with special characters in keys."""
        ext1 = FacilitatorExtension(key="ext-with-dashes")
        ext2 = FacilitatorExtension(key="ext_with_underscores")
        ext3 = FacilitatorExtension(key="ext.with.dots")

        context = FacilitatorContext({
            "ext-with-dashes": ext1,
            "ext_with_underscores": ext2,
            "ext.with.dots": ext3
        })

        assert context.get_extension("ext-with-dashes") == ext1
        assert context.get_extension("ext_with_underscores") == ext2
        assert context.get_extension("ext.with.dots") == ext3


class TestFacilitatorContextEdgeCases:
    """Test edge cases and error conditions."""

    def test_none_extension_value(self):
        """Test behavior when extension value is None."""
        # This should probably not happen in practice, but test defensive behavior
        context = FacilitatorContext({"null_ext": None})
        result = context.get_extension("null_ext")
        assert result is None

    def test_empty_string_key(self):
        """Test behavior with empty string as key."""
        ext = FacilitatorExtension(key="")
        context = FacilitatorContext({"": ext})

        result = context.get_extension("")
        assert result == ext

    def test_unicode_keys(self):
        """Test context with unicode keys."""
        ext1 = FacilitatorExtension(key="café")
        ext2 = FacilitatorExtension(key="测试")

        context = FacilitatorContext({
            "café": ext1,
            "测试": ext2
        })

        assert context.get_extension("café") == ext1
        assert context.get_extension("测试") == ext2

    def test_numeric_string_keys(self):
        """Test context with numeric string keys."""
        ext = FacilitatorExtension(key="123")
        context = FacilitatorContext({"123": ext})

        assert context.get_extension("123") == ext
        assert context.get_extension(123) is None  # Type mismatch should return None
