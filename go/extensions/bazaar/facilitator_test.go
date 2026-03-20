package bazaar

// Internal tests for unexported facilitator helpers.
// Uses package bazaar (not bazaar_test) to access unexported functions.

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestValidateRouteTemplate(t *testing.T) {
	t.Run("returns empty string for empty input", func(t *testing.T) {
		assert.Equal(t, "", validateRouteTemplate(""))
	})

	t.Run("returns empty string for paths not starting with /", func(t *testing.T) {
		assert.Equal(t, "", validateRouteTemplate("users/123"))
		assert.Equal(t, "", validateRouteTemplate("relative/path"))
		assert.Equal(t, "", validateRouteTemplate("no-slash"))
	})

	t.Run("returns empty string for paths containing ..", func(t *testing.T) {
		assert.Equal(t, "", validateRouteTemplate("/users/../admin"))
		assert.Equal(t, "", validateRouteTemplate("/../etc/passwd"))
		assert.Equal(t, "", validateRouteTemplate("/users/.."))
	})

	t.Run("returns empty string for paths containing ://", func(t *testing.T) {
		assert.Equal(t, "", validateRouteTemplate("http://evil.com/path"))
		assert.Equal(t, "", validateRouteTemplate("/users/http://evil"))
		assert.Equal(t, "", validateRouteTemplate("javascript://foo"))
	})

	t.Run("returns valid paths unchanged", func(t *testing.T) {
		assert.Equal(t, "/users/:userId", validateRouteTemplate("/users/:userId"))
		assert.Equal(t, "/api/v1/items", validateRouteTemplate("/api/v1/items"))
		assert.Equal(t, "/products/:productId/reviews/:reviewId", validateRouteTemplate("/products/:productId/reviews/:reviewId"))
	})

	t.Run("edge case: /users/..hidden is rejected (contains ..)", func(t *testing.T) {
		// A segment like "..hidden" contains ".." as a substring, so it is rejected.
		// This is intentionally conservative.
		assert.Equal(t, "", validateRouteTemplate("/users/..hidden"))
	})

	// NOTE: URL-encoded traversal sequences like '%2e%2e' are NOT currently rejected.
	// validateRouteTemplate checks for the literal string ".." only. If encoded-path
	// handling is ever added (e.g. decoding before matching), this function should be
	// updated to also reject '%2e%2e', '%2E%2E', and similar variants.
}

func TestExtractPathParams(t *testing.T) {
	t.Run("returns empty map when URL path has fewer segments than pattern (bracket)", func(t *testing.T) {
		result := extractPathParams("/users/[userId]", "/api/other", true)
		assert.Equal(t, map[string]string{}, result)
	})

	t.Run("extracts single param from matching path (bracket)", func(t *testing.T) {
		result := extractPathParams("/users/[userId]", "/users/123", true)
		assert.Equal(t, map[string]string{"userId": "123"}, result)
	})

	t.Run("extracts multiple params from matching path (bracket)", func(t *testing.T) {
		result := extractPathParams("/users/[userId]/posts/[postId]", "/users/42/posts/7", true)
		assert.Equal(t, map[string]string{"userId": "42", "postId": "7"}, result)
	})

	t.Run("extracts single param from matching path (colon)", func(t *testing.T) {
		result := extractPathParams("/users/:userId", "/users/123", false)
		assert.Equal(t, map[string]string{"userId": "123"}, result)
	})

	t.Run("extracts multiple params from matching path (colon)", func(t *testing.T) {
		result := extractPathParams("/users/:userId/posts/:postId", "/users/42/posts/7", false)
		assert.Equal(t, map[string]string{"userId": "42", "postId": "7"}, result)
	})

	t.Run("returns empty map when URL path mismatches (colon)", func(t *testing.T) {
		result := extractPathParams("/users/:userId", "/api/other", false)
		assert.Equal(t, map[string]string{}, result)
	})
}

func TestNormalizeResourceURL(t *testing.T) {
	t.Run("uses routeTemplate as canonical path when present", func(t *testing.T) {
		result := normalizeResourceURL("https://api.example.com/users/123?foo=bar#frag", "/users/:userId")
		assert.Equal(t, "https://api.example.com/users/:userId", result)
	})

	t.Run("strips query params and fragment when no routeTemplate", func(t *testing.T) {
		result := normalizeResourceURL("https://api.example.com/search?q=test#section", "")
		assert.Equal(t, "https://api.example.com/search", result)
	})

	t.Run("returns original URL on parse error with routeTemplate", func(t *testing.T) {
		// url.Parse rarely fails but we exercise the fallback branch.
		result := normalizeResourceURL("://invalid", "/route")
		// Fallback: stripQueryParams is called, which may also fail on invalid URL,
		// returning the original.
		assert.NotEmpty(t, result)
	})

}
