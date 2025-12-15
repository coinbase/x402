package x402

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"sync"
	"time"
)

// SettlementCache provides idempotency for settle operations by caching
// successful settlement responses and tracking in-flight requests.
// This prevents duplicate transaction submissions when clients retry
// after timeouts or network failures.
type SettlementCache struct {
	mu       sync.Mutex
	results  map[string]*SettleResponse
	expiry   map[string]time.Time
	inFlight map[string]chan struct{}
	ttl      time.Duration
}

// NewSettlementCache creates a new settlement cache with the specified TTL.
func NewSettlementCache(ttl time.Duration) *SettlementCache {
	return &SettlementCache{
		results:  make(map[string]*SettleResponse),
		expiry:   make(map[string]time.Time),
		inFlight: make(map[string]chan struct{}),
		ttl:      ttl,
	}
}

// GenerateSettlementKey creates a unique key from payment payload bytes.
// Uses SHA256 hash of the full payload which includes the authorization
// signature and nonce, ensuring uniqueness per payment attempt.
func GenerateSettlementKey(payloadBytes []byte) string {
	hash := sha256.Sum256(payloadBytes)
	return hex.EncodeToString(hash[:])
}

// SettlementStatus represents the result of checking the cache.
type SettlementStatus int

const (
	// StatusNotFound means no cached result and no in-flight request.
	StatusNotFound SettlementStatus = iota
	// StatusCached means a cached result was found.
	StatusCached
	// StatusInFlight means another request is currently processing this settlement.
	StatusInFlight
)

// CheckAndMark atomically checks the cache and marks the key as in-flight if needed.
// Returns:
// - StatusCached + result if a cached result exists
// - StatusInFlight + wait channel if another request is processing
// - StatusNotFound + done channel if this request should proceed (now marked in-flight)
func (c *SettlementCache) CheckAndMark(key string) (SettlementStatus, *SettleResponse, chan struct{}) {
	c.mu.Lock()
	defer c.mu.Unlock()

	// Check for cached result first
	if expiry, exists := c.expiry[key]; exists {
		if time.Now().Before(expiry) {
			if result, ok := c.results[key]; ok {
				return StatusCached, result, nil
			}
		}
		// Expired - clean it up
		delete(c.results, key)
		delete(c.expiry, key)
	}

	// Check if in-flight
	if done, exists := c.inFlight[key]; exists {
		return StatusInFlight, nil, done
	}

	// Mark as in-flight
	done := make(chan struct{})
	c.inFlight[key] = done
	return StatusNotFound, nil, done
}

// WaitForResult waits for an in-flight request to complete, respecting context cancellation.
// Returns the cached result if available, or nil if the in-flight request failed.
func (c *SettlementCache) WaitForResult(ctx context.Context, key string, done chan struct{}) (*SettleResponse, error) {
	select {
	case <-done:
		// In-flight request completed, check for cached result
		return c.Get(key)
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

// Get retrieves a cached settlement response if it exists and hasn't expired.
// Returns the response and nil error if found, nil and nil otherwise.
func (c *SettlementCache) Get(key string) (*SettleResponse, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	expiry, exists := c.expiry[key]
	if !exists {
		return nil, nil
	}

	if time.Now().After(expiry) {
		// Expired - clean it up
		delete(c.results, key)
		delete(c.expiry, key)
		return nil, nil
	}

	return c.results[key], nil
}

// Complete marks a settlement as complete, caches the response,
// and signals any waiting goroutines.
func (c *SettlementCache) Complete(key string, response *SettleResponse, done chan struct{}) {
	c.mu.Lock()
	defer c.mu.Unlock()

	// Cache the result
	c.results[key] = response
	c.expiry[key] = time.Now().Add(c.ttl)

	// Remove from in-flight
	delete(c.inFlight, key)

	// Signal waiters
	close(done)

	// Lazy cleanup of expired entries
	c.cleanupExpiredLocked()
}

// Fail removes the in-flight marker without caching a result,
// allowing the settlement to be retried.
func (c *SettlementCache) Fail(key string, done chan struct{}) {
	c.mu.Lock()
	defer c.mu.Unlock()

	// Remove from in-flight without caching
	delete(c.inFlight, key)

	// Signal waiters (they'll retry since no result cached)
	close(done)
}

// cleanupExpiredLocked removes expired entries. Must be called with lock held.
func (c *SettlementCache) cleanupExpiredLocked() {
	now := time.Now()
	for key, expiry := range c.expiry {
		if now.After(expiry) {
			delete(c.results, key)
			delete(c.expiry, key)
		}
	}
}
