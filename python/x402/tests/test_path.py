import pytest
from x402.path import path_is_match


class TestExactMatch:
    def test_exact_match_success(self):
        assert path_is_match("/api/users", "/api/users") is True

    def test_exact_match_failure(self):
        assert path_is_match("/api/users", "/api/posts") is False

    def test_exact_match_trailing_slash(self):
        assert path_is_match("/api/users", "/api/users/") is False
        assert path_is_match("/api/users/", "/api/users") is False

    def test_exact_match_case_sensitive(self):
        assert path_is_match("/API/Users", "/api/users") is False


class TestGlobPatterns:
    def test_single_wildcard(self):
        assert path_is_match("/api/*", "/api/users") is True
        assert path_is_match("/api/*", "/api/posts") is True
        assert path_is_match("/api/*", "/api/") is True

    def test_wildcard_no_match(self):
        # fnmatch * matches any characters including /
        assert path_is_match("/api/*", "/api/users/123") is True
        assert path_is_match("/api/*", "/other/path") is False

    def test_double_wildcard(self):
        assert path_is_match("/api/**", "/api/users") is True
        assert path_is_match("/api/**", "/api/users/123") is True

    def test_middle_wildcard(self):
        assert path_is_match("/api/*/profile", "/api/users/profile") is True
        assert path_is_match("/api/*/profile", "/api/123/profile") is True
        assert path_is_match("/api/*/profile", "/api/users/settings") is False

    def test_question_mark_wildcard(self):
        assert path_is_match("/api/user?", "/api/users") is True
        assert path_is_match("/api/user?", "/api/user1") is True
        assert path_is_match("/api/user?", "/api/user") is False
        assert path_is_match("/api/user?", "/api/userss") is False

    def test_match_all(self):
        assert path_is_match("*", "/any/path") is True
        assert path_is_match("*", "/") is True


class TestRegexPatterns:
    def test_regex_basic(self):
        assert path_is_match("regex:^/api/users$", "/api/users") is True
        assert path_is_match("regex:^/api/users$", "/api/users/123") is False

    def test_regex_with_digits(self):
        assert path_is_match(r"regex:^/api/users/\d+$", "/api/users/123") is True
        assert path_is_match(r"regex:^/api/users/\d+$", "/api/users/abc") is False

    def test_regex_partial_match(self):
        # re.match only matches from the start
        assert path_is_match("regex:/api", "/api/users") is True
        assert path_is_match("regex:users", "/api/users") is False

    def test_regex_with_groups(self):
        assert path_is_match(r"regex:^/api/(users|posts)$", "/api/users") is True
        assert path_is_match(r"regex:^/api/(users|posts)$", "/api/posts") is True
        assert path_is_match(r"regex:^/api/(users|posts)$", "/api/comments") is False


class TestListPatterns:
    def test_list_with_exact_matches(self):
        patterns = ["/api/users", "/api/posts"]
        assert path_is_match(patterns, "/api/users") is True
        assert path_is_match(patterns, "/api/posts") is True
        assert path_is_match(patterns, "/api/comments") is False

    def test_list_with_mixed_patterns(self):
        patterns = ["/api/users", "/api/posts/*", "regex:^/v2/.*$"]
        assert path_is_match(patterns, "/api/users") is True
        assert path_is_match(patterns, "/api/posts/123") is True
        assert path_is_match(patterns, "/v2/anything") is True
        assert path_is_match(patterns, "/other") is False

    def test_empty_list(self):
        assert path_is_match([], "/api/users") is False

    def test_single_item_list(self):
        assert path_is_match(["/api/users"], "/api/users") is True


class TestEdgeCases:
    def test_empty_pattern(self):
        assert path_is_match("", "") is True
        assert path_is_match("", "/api") is False

    def test_empty_request_path(self):
        assert path_is_match("/api", "") is False
        assert path_is_match("*", "") is True

    def test_root_path(self):
        assert path_is_match("/", "/") is True
        assert path_is_match("/*", "/anything") is True

    def test_special_characters_in_path(self):
        assert path_is_match("/api/user@domain.com", "/api/user@domain.com") is True

    def test_unicode_path(self):
        assert path_is_match("/api/users", "/api/users") is True

    def test_invalid_type_returns_false(self):
        # Test with invalid types (not str or list)
        assert path_is_match(123, "/api/users") is False  # type: ignore
        assert path_is_match(None, "/api/users") is False  # type: ignore
