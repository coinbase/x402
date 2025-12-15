package x402

import (
	"context"
	"sync"
	"testing"
	"time"
)

func TestGenerateSettlementKey(t *testing.T) {
	payload1 := []byte(`{"x402Version":2,"payload":{"nonce":"123"},"accepted":{"scheme":"exact"}}`)
	payload2 := []byte(`{"x402Version":2,"payload":{"nonce":"456"},"accepted":{"scheme":"exact"}}`)

	key1 := GenerateSettlementKey(payload1)
	key2 := GenerateSettlementKey(payload2)
	key3 := GenerateSettlementKey(payload1)

	// Same payload should produce same key
	if key1 != key3 {
		t.Errorf("Expected same payload to produce same key, got %s and %s", key1, key3)
	}

	// Different payload should produce different key
	if key1 == key2 {
		t.Errorf("Expected different payloads to produce different keys")
	}

	// Key should be hex string (64 chars for SHA256)
	if len(key1) != 64 {
		t.Errorf("Expected key to be 64 hex chars, got %d", len(key1))
	}
}

func TestSettlementCache_CheckAndMark_Cached(t *testing.T) {
	cache := NewSettlementCache(5 * time.Minute)
	key := "test-key"
	response := &SettleResponse{
		Success:     true,
		Transaction: "0x123",
		Payer:       "0xabc",
		Network:     "eip155:1",
	}

	// First call should return NotFound and mark in-flight
	status, result, done := cache.CheckAndMark(key)
	if status != StatusNotFound {
		t.Errorf("Expected StatusNotFound, got %v", status)
	}
	if result != nil {
		t.Error("Expected nil result for NotFound")
	}

	// Complete the settlement
	cache.Complete(key, response, done)

	// Second call should return Cached
	status, result, _ = cache.CheckAndMark(key)
	if status != StatusCached {
		t.Errorf("Expected StatusCached, got %v", status)
	}
	if result == nil || result.Transaction != "0x123" {
		t.Errorf("Expected cached result with transaction 0x123")
	}
}

func TestSettlementCache_CheckAndMark_InFlight(t *testing.T) {
	cache := NewSettlementCache(5 * time.Minute)
	key := "inflight-test"

	// First call marks in-flight
	status1, _, done1 := cache.CheckAndMark(key)
	if status1 != StatusNotFound {
		t.Errorf("Expected StatusNotFound, got %v", status1)
	}

	// Second call should see in-flight
	status2, _, done2 := cache.CheckAndMark(key)
	if status2 != StatusInFlight {
		t.Errorf("Expected StatusInFlight, got %v", status2)
	}

	// Both should have the same channel
	if done1 != done2 {
		t.Error("Expected same done channel for in-flight requests")
	}
}

func TestSettlementCache_Expiry(t *testing.T) {
	cache := NewSettlementCache(50 * time.Millisecond)
	key := "expiry-test"
	response := &SettleResponse{Success: true, Transaction: "0x999"}

	status, _, done := cache.CheckAndMark(key)
	if status != StatusNotFound {
		t.Fatalf("Expected StatusNotFound, got %v", status)
	}
	cache.Complete(key, response, done)

	// Should be cached immediately
	status, result, _ := cache.CheckAndMark(key)
	if status != StatusCached {
		t.Error("Expected StatusCached immediately after complete")
	}
	if result == nil {
		t.Error("Expected non-nil result")
	}

	// Wait for expiry
	time.Sleep(60 * time.Millisecond)

	// Should be expired (treated as NotFound)
	status, _, done = cache.CheckAndMark(key)
	if status != StatusNotFound {
		t.Errorf("Expected StatusNotFound after expiry, got %v", status)
	}
	cache.Fail(key, done) // Clean up
}

func TestSettlementCache_Fail(t *testing.T) {
	cache := NewSettlementCache(5 * time.Minute)
	key := "fail-test"

	// Mark as in-flight
	status, _, done := cache.CheckAndMark(key)
	if status != StatusNotFound {
		t.Fatalf("Expected StatusNotFound, got %v", status)
	}

	// Fail the settlement
	cache.Fail(key, done)

	// Should be able to retry (not cached, not in-flight)
	status, _, done2 := cache.CheckAndMark(key)
	if status != StatusNotFound {
		t.Errorf("Expected StatusNotFound after fail (retry allowed), got %v", status)
	}
	cache.Fail(key, done2) // Clean up
}

func TestSettlementCache_WaitForResult_Success(t *testing.T) {
	cache := NewSettlementCache(5 * time.Minute)
	key := "wait-test"
	response := &SettleResponse{Success: true, Transaction: "0xwaited"}

	// First request marks in-flight
	_, _, done := cache.CheckAndMark(key)

	var wg sync.WaitGroup
	var waitResult *SettleResponse
	var waitErr error

	// Second request waits
	wg.Add(1)
	go func() {
		defer wg.Done()
		ctx := context.Background()
		waitResult, waitErr = cache.WaitForResult(ctx, key, done)
	}()

	// Give waiter time to start
	time.Sleep(10 * time.Millisecond)

	// Complete the settlement
	cache.Complete(key, response, done)

	wg.Wait()

	if waitErr != nil {
		t.Errorf("Expected no error, got %v", waitErr)
	}
	if waitResult == nil || waitResult.Transaction != "0xwaited" {
		t.Errorf("Expected result with transaction 0xwaited, got %v", waitResult)
	}
}

func TestSettlementCache_WaitForResult_ContextCancelled(t *testing.T) {
	cache := NewSettlementCache(5 * time.Minute)
	key := "cancel-test"

	// Mark in-flight
	_, _, done := cache.CheckAndMark(key)

	ctx, cancel := context.WithCancel(context.Background())

	var wg sync.WaitGroup
	var waitErr error

	wg.Add(1)
	go func() {
		defer wg.Done()
		_, waitErr = cache.WaitForResult(ctx, key, done)
	}()

	// Give waiter time to start
	time.Sleep(10 * time.Millisecond)

	// Cancel context
	cancel()

	wg.Wait()

	if waitErr != context.Canceled {
		t.Errorf("Expected context.Canceled, got %v", waitErr)
	}

	// Clean up
	cache.Fail(key, done)
}

func TestSettlementCache_ConcurrentWaiters(t *testing.T) {
	cache := NewSettlementCache(5 * time.Minute)
	key := "concurrent-test"

	// First request marks in-flight
	status, _, done := cache.CheckAndMark(key)
	if status != StatusNotFound {
		t.Fatalf("Expected StatusNotFound, got %v", status)
	}

	var wg sync.WaitGroup
	results := make([]*SettleResponse, 3)
	errors := make([]error, 3)

	// Start 3 goroutines that wait for the result
	for i := 0; i < 3; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			ctx := context.Background()
			results[idx], errors[idx] = cache.WaitForResult(ctx, key, done)
		}(i)
	}

	// Give waiters time to start
	time.Sleep(10 * time.Millisecond)

	// Complete with a result
	response := &SettleResponse{Success: true, Transaction: "0xshared"}
	cache.Complete(key, response, done)

	wg.Wait()

	// All should have the same result
	for i := 0; i < 3; i++ {
		if errors[i] != nil {
			t.Errorf("Goroutine %d got error: %v", i, errors[i])
			continue
		}
		if results[i] == nil {
			t.Errorf("Goroutine %d got nil result", i)
			continue
		}
		if results[i].Transaction != "0xshared" {
			t.Errorf("Goroutine %d got wrong transaction: %s", i, results[i].Transaction)
		}
	}
}

func TestSettlementCache_AtomicCheckAndMark(t *testing.T) {
	cache := NewSettlementCache(5 * time.Minute)
	key := "atomic-test"

	var wg sync.WaitGroup
	notFoundCount := 0
	inFlightCount := 0
	var mu sync.Mutex

	// Launch 10 goroutines simultaneously
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			status, _, _ := cache.CheckAndMark(key)
			mu.Lock()
			if status == StatusNotFound {
				notFoundCount++
			} else if status == StatusInFlight {
				inFlightCount++
			}
			mu.Unlock()
		}()
	}

	wg.Wait()

	// Exactly one should have gotten NotFound (owns the slot)
	if notFoundCount != 1 {
		t.Errorf("Expected exactly 1 NotFound, got %d", notFoundCount)
	}

	// Rest should have gotten InFlight
	if inFlightCount != 9 {
		t.Errorf("Expected 9 InFlight, got %d", inFlightCount)
	}
}
