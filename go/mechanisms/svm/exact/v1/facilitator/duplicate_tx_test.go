package facilitator

import (
	"context"
	"testing"
	"time"

	x402 "github.com/coinbase/x402/go"
	"github.com/coinbase/x402/go/mechanisms/svm"
	solana "github.com/gagliardetto/solana-go"
	"github.com/stretchr/testify/assert"
)

func TestDuplicateSettlementCacheV1(t *testing.T) {
	t.Run("should reject duplicate transaction", func(t *testing.T) {
		cache := svm.NewSettlementCache()

		cache.Mu().Lock()
		cache.Entries()["txBase64A=="] = time.Now()
		cache.Mu().Unlock()

		assert.True(t, cache.IsDuplicate("txBase64A=="), "same transaction key should be detected as duplicate")
	})

	t.Run("should not conflict with distinct transactions", func(t *testing.T) {
		cache := svm.NewSettlementCache()

		cache.Mu().Lock()
		cache.Entries()["txBase64A=="] = time.Now()
		cache.Mu().Unlock()

		assert.False(t, cache.IsDuplicate("txBase64B=="), "different transaction key should not be a duplicate")
	})

	t.Run("should prune expired entries", func(t *testing.T) {
		cache := svm.NewSettlementCache()

		cache.Mu().Lock()
		cache.Entries()["expiredTx=="] = time.Now().Add(-150 * time.Second)
		cache.Entries()["freshTx=="] = time.Now()
		cache.Mu().Unlock()

		// IsDuplicate triggers pruning internally
		assert.False(t, cache.IsDuplicate("newTx=="), "new tx should not be a duplicate")

		cache.Mu().Lock()
		_, expiredExists := cache.Entries()["expiredTx=="]
		_, freshExists := cache.Entries()["freshTx=="]
		cache.Mu().Unlock()

		assert.False(t, expiredExists, "expired entry should be pruned")
		assert.True(t, freshExists, "fresh entry should survive pruning")
	})

	t.Run("duplicate settlement error constant is correct", func(t *testing.T) {
		assert.Equal(t, "duplicate_settlement", ErrDuplicateSettlement)
	})

	t.Run("constructor wires the shared cache into the scheme", func(t *testing.T) {
		cache := svm.NewSettlementCache()
		scheme := NewExactSvmSchemeV1(nil, cache)
		assert.Same(t, cache, scheme.settlementCache,
			"scheme should hold the exact cache instance that was injected")
	})

	t.Run("should prune only expired entries and keep fresh ones", func(t *testing.T) {
		cache := svm.NewSettlementCache()

		cache.Mu().Lock()
		cache.Entries()["expired-1"] = time.Now().Add(-150 * time.Second)
		cache.Entries()["expired-2"] = time.Now().Add(-130 * time.Second)
		cache.Entries()["fresh-1"] = time.Now()
		cache.Entries()["fresh-2"] = time.Now()
		cache.Mu().Unlock()

		// Trigger prune
		cache.IsDuplicate("trigger")

		cache.Mu().Lock()
		_, expired1 := cache.Entries()["expired-1"]
		_, expired2 := cache.Entries()["expired-2"]
		_, fresh1 := cache.Entries()["fresh-1"]
		_, fresh2 := cache.Entries()["fresh-2"]
		_, trigger := cache.Entries()["trigger"]
		cache.Mu().Unlock()

		assert.False(t, expired1, "expired entry should be pruned")
		assert.False(t, expired2, "expired entry should be pruned")
		assert.True(t, fresh1, "fresh entry should survive pruning")
		assert.True(t, fresh2, "fresh entry should survive pruning")
		assert.True(t, trigger, "newly inserted entry should be present")
	})

	t.Run("should prune all entries when all expired", func(t *testing.T) {
		cache := svm.NewSettlementCache()

		cache.Mu().Lock()
		cache.Entries()["old-1"] = time.Now().Add(-200 * time.Second)
		cache.Entries()["old-2"] = time.Now().Add(-200 * time.Second)
		cache.Entries()["old-3"] = time.Now().Add(-200 * time.Second)
		cache.Mu().Unlock()

		assert.False(t, cache.IsDuplicate("old-1"), "expired entry should not be a duplicate")
		assert.False(t, cache.IsDuplicate("old-2"), "expired entry should not be a duplicate")
		assert.False(t, cache.IsDuplicate("old-3"), "expired entry should not be a duplicate")
	})

	t.Run("should not prune any entries when all fresh", func(t *testing.T) {
		cache := svm.NewSettlementCache()

		assert.False(t, cache.IsDuplicate("new-1"))
		assert.False(t, cache.IsDuplicate("new-2"))
		assert.False(t, cache.IsDuplicate("new-3"))

		assert.True(t, cache.IsDuplicate("new-1"), "fresh entry should still be cached")
		assert.True(t, cache.IsDuplicate("new-2"), "fresh entry should still be cached")
		assert.True(t, cache.IsDuplicate("new-3"), "fresh entry should still be cached")
	})
}

func TestGetExtraReturnsManagedFeePayerV1(t *testing.T) {
	addresses := []solana.PublicKey{
		solana.MustPublicKeyFromBase58(svm.MemoProgramAddress),
		solana.MustPublicKeyFromBase58(svm.LighthouseProgramAddress),
	}
	scheme := NewExactSvmSchemeV1(mockFacilitatorSvmSignerV1{addresses: addresses})

	extra := scheme.GetExtra(x402.Network("solana:mainnet"))

	feePayer, ok := extra["feePayer"].(string)
	if !ok {
		t.Fatalf("expected feePayer string, got %T", extra["feePayer"])
	}

	assert.Contains(t, []string{addresses[0].String(), addresses[1].String()}, feePayer)
}

type mockFacilitatorSvmSignerV1 struct {
	addresses []solana.PublicKey
}

func (m mockFacilitatorSvmSignerV1) GetAddresses(context.Context, string) []solana.PublicKey {
	return m.addresses
}

func (mockFacilitatorSvmSignerV1) SignTransaction(context.Context, *solana.Transaction, solana.PublicKey, string) error {
	return nil
}

func (mockFacilitatorSvmSignerV1) SimulateTransaction(context.Context, *solana.Transaction, string) error {
	return nil
}

func (mockFacilitatorSvmSignerV1) SendTransaction(context.Context, *solana.Transaction, string) (solana.Signature, error) {
	return solana.Signature{}, nil
}

func (mockFacilitatorSvmSignerV1) ConfirmTransaction(context.Context, solana.Signature, string) error {
	return nil
}
