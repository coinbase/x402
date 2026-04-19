package svm

import (
	"sync"
	"testing"
	"time"
)

func TestNewSettlementCache(t *testing.T) {
	c := NewSettlementCache()
	if c == nil {
		t.Fatal("NewSettlementCache() returned nil")
	}
	if len(c.Entries()) != 0 {
		t.Errorf("NewSettlementCache() entries = %d, want 0", len(c.Entries()))
	}
}

func TestIsDuplicate_NewKey(t *testing.T) {
	c := NewSettlementCache()
	got := c.IsDuplicate("tx1")
	if got {
		t.Error("IsDuplicate(new key) = true, want false")
	}
	if _, exists := c.Entries()["tx1"]; !exists {
		t.Error("IsDuplicate(new key) did not record the key")
	}
}

func TestIsDuplicate_ExistingKey(t *testing.T) {
	c := NewSettlementCache()
	c.IsDuplicate("tx1") // record it
	got := c.IsDuplicate("tx1")
	if !got {
		t.Error("IsDuplicate(existing key) = false, want true")
	}
}

func TestIsDuplicate_MultipleDistinctKeys(t *testing.T) {
	c := NewSettlementCache()
	keys := []string{"txA", "txB", "txC"}
	for _, k := range keys {
		if c.IsDuplicate(k) {
			t.Errorf("IsDuplicate(%q) = true on first call, want false", k)
		}
	}
	if len(c.Entries()) != 3 {
		t.Errorf("Entries() count = %d, want 3", len(c.Entries()))
	}
	// Each should now be a duplicate
	for _, k := range keys {
		if !c.IsDuplicate(k) {
			t.Errorf("IsDuplicate(%q) = false on second call, want true", k)
		}
	}
}

func TestIsDuplicate_EmptyStringKey(t *testing.T) {
	c := NewSettlementCache()
	got := c.IsDuplicate("")
	if got {
		t.Error("IsDuplicate(\"\") = true on first call, want false")
	}
	if !c.IsDuplicate("") {
		t.Error("IsDuplicate(\"\") = false on second call, want true")
	}
}

func TestIsDuplicate_ExpiredKeyIsNotDuplicate(t *testing.T) {
	c := NewSettlementCache()
	// Manually insert a stale entry older than SettlementTTL.
	c.Mu().Lock()
	c.Entries()["oldtx"] = time.Now().Add(-(SettlementTTL + time.Second))
	c.Mu().Unlock()

	// IsDuplicate should prune the expired entry and treat it as new.
	got := c.IsDuplicate("oldtx")
	if got {
		t.Error("IsDuplicate(expired key) = true, want false (expired entry should be pruned)")
	}
}

func TestIsDuplicate_FreshKeyIsStillDuplicate(t *testing.T) {
	c := NewSettlementCache()
	// Insert with a near-but-not-expired timestamp.
	c.Mu().Lock()
	c.Entries()["recenttx"] = time.Now().Add(-(SettlementTTL / 2))
	c.Mu().Unlock()

	got := c.IsDuplicate("recenttx")
	if !got {
		t.Error("IsDuplicate(recent key within TTL) = false, want true")
	}
}

func TestIsDuplicate_PrunesOnlyExpiredEntries(t *testing.T) {
	c := NewSettlementCache()
	c.Mu().Lock()
	c.Entries()["old"] = time.Now().Add(-(SettlementTTL + time.Second))
	c.Entries()["fresh"] = time.Now()
	c.Mu().Unlock()

	// Trigger prune by calling IsDuplicate with any key.
	c.IsDuplicate("trigger")

	c.Mu().Lock()
	_, oldExists := c.Entries()["old"]
	_, freshExists := c.Entries()["fresh"]
	c.Mu().Unlock()

	if oldExists {
		t.Error("prune() did not remove the expired 'old' entry")
	}
	if !freshExists {
		t.Error("prune() incorrectly removed the fresh entry")
	}
}

func TestIsDuplicate_ConcurrentSafety(t *testing.T) {
	c := NewSettlementCache()
	const goroutines = 50

	var wg sync.WaitGroup
	wg.Add(goroutines)
	for i := 0; i < goroutines; i++ {
		go func(id int) {
			defer wg.Done()
			key := "concurrent-key"
			c.IsDuplicate(key)
		}(i)
	}
	wg.Wait()

	// After all goroutines ran, the key must exist exactly once.
	c.Mu().Lock()
	count := len(c.Entries())
	c.Mu().Unlock()
	if count != 1 {
		t.Errorf("after concurrent IsDuplicate calls, Entries() count = %d, want 1", count)
	}
}

func TestIsDuplicate_ConcurrentDistinctKeys(t *testing.T) {
	c := NewSettlementCache()
	const goroutines = 20

	var wg sync.WaitGroup
	wg.Add(goroutines)
	results := make([]bool, goroutines)
	for i := 0; i < goroutines; i++ {
		go func(id int) {
			defer wg.Done()
			// Each goroutine uses a unique key — all should return false.
			results[id] = c.IsDuplicate("unique-" + string(rune('A'+id)))
		}(i)
	}
	wg.Wait()

	for i, dup := range results {
		if dup {
			t.Errorf("goroutine %d: IsDuplicate(unique key) = true, want false", i)
		}
	}
}
