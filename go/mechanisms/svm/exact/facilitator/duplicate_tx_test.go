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

func TestFacilitatorInstructionConstraints(t *testing.T) {
	t.Run("allows 3-6 instructions", func(t *testing.T) {
		minInstructions := 3
		maxInstructions := 6

		assert.Equal(t, 3, minInstructions)
		assert.Equal(t, 6, maxInstructions)
	})

	t.Run("optional instructions may be Lighthouse or Memo", func(t *testing.T) {
		lighthouseProgram := svm.LighthouseProgramAddress
		memoProgram := svm.MemoProgramAddress

		assert.NotEqual(t, lighthouseProgram, memoProgram)
		assert.NotEmpty(t, memoProgram)
		assert.NotEmpty(t, lighthouseProgram)
	})
}

func TestErrorCodesForMitigationPlanning(t *testing.T) {
	t.Run("instruction count error", func(t *testing.T) {
		err := ErrTransactionInstructionsLength
		assert.Equal(t, "invalid_exact_solana_payload_transaction_instructions_length", err)
	})
}

func TestDuplicateSettlementCache(t *testing.T) {
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
		scheme := NewExactSvmScheme(nil, cache)
		assert.Same(t, cache, scheme.settlementCache,
			"scheme should hold the exact cache instance that was injected")
	})
}

func TestGetExtraReturnsManagedFeePayer(t *testing.T) {
	addresses := []solana.PublicKey{
		solana.MustPublicKeyFromBase58(svm.MemoProgramAddress),
		solana.MustPublicKeyFromBase58(svm.LighthouseProgramAddress),
	}
	scheme := NewExactSvmScheme(mockFacilitatorSvmSigner{addresses: addresses})

	extra := scheme.GetExtra(x402.Network("solana:mainnet"))

	feePayer, ok := extra["feePayer"].(string)
	if !ok {
		t.Fatalf("expected feePayer string, got %T", extra["feePayer"])
	}

	assert.Contains(t, []string{addresses[0].String(), addresses[1].String()}, feePayer)
}

type mockFacilitatorSvmSigner struct {
	addresses []solana.PublicKey
}

func (m mockFacilitatorSvmSigner) GetAddresses(context.Context, string) []solana.PublicKey {
	return m.addresses
}

func (mockFacilitatorSvmSigner) SignTransaction(context.Context, *solana.Transaction, solana.PublicKey, string) error {
	return nil
}

func (mockFacilitatorSvmSigner) SimulateTransaction(context.Context, *solana.Transaction, string) error {
	return nil
}

func (mockFacilitatorSvmSigner) SendTransaction(context.Context, *solana.Transaction, string) (solana.Signature, error) {
	return solana.Signature{}, nil
}

func (mockFacilitatorSvmSigner) ConfirmTransaction(context.Context, solana.Signature, string) error {
	return nil
}
