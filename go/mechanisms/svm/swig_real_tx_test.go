package svm_test

import (
	"context"
	"encoding/binary"
	"testing"

	solana "github.com/gagliardetto/solana-go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/coinbase/x402/go/mechanisms/svm"
	"github.com/coinbase/x402/go/mechanisms/svm/exact/facilitator"
	"github.com/coinbase/x402/go/types"
)

// Real confirmed Swig smart wallet USDC transfer on devnet.
// tx: 2TAkeCETVcsbtmK1UMdgk2BZVdWQjnv7s2s7QUYv3Ynaqh36iXVdwM1ong8hmRw4Za3Yw8CkjgVwiyUpGR6SQP1g
const realSwigTxBase64 = "AkiVWpmnwCMi7VKkTgzdR2vqY1fOSr14KPzUnzCNQpeOMif5NskDc4uS+gOp8RgsErjrnGLEYL1N" +
	"268w+qF+dge3oCdndWRM1K0yufH+fFvkZZ4Bs3zo54vRPaX9frRvVfnjAvIaF+LrUcesSgDzelLub" +
	"NZgz/xTZpMF+M73W2QBgAIBBAqZaoBA6PatAWpRvzksIlZIPBdwhETOtNqkgD0atmy0InVOnwjWNA" +
	"xK9dVi7s3ExZUKIESvFVgLxy2EuifanfHXNuKlxHOPekji0xlP2QWZWAXWe2Waz6nHvKl8rEzDOBW" +
	"YZE9jRaDJ3Di+pFN1xwc5xnR4DB9Ie84lQHbJaXPMB+psglirF8mTyZ49SOemjo+02LMohN2jyoK" +
	"VBiPYUEFBZOwM3pq0f7lZsDDur9i+ue/ujyUjQwUnXvJRe7/+3hMDBkZv5SEXMv/srbpyw5vnvIz" +
	"lu8X3EmssQ5s6QAAAAA0M6ULh58UG4hjfDX3xxS+v3DUp5I1nTR2yTHW1TMy+Bt324ddloZPZy+F" +
	"Gzut5rBy0he1fWzeROoz1hX7/AKk7RCyzkSFX8TqTPQE0KC0DK1/+zQGi2/G3eQYI3wAup78zWM" +
	"i4yXOAY9JrFqsFFkNRq8dONAlh9AOdsB99f/m6AwYACQNkAAAAAAAAAAYABQKAGgYABwcCAwEIBA" +
	"kFHAsAEwAAAAAAAQMEBAUGAQoADAEAAAAAAAAABgIA"

const (
	feePayer = "BKsZvzPUY6VT2GpLMxx6fA6fuC8MK3hVxwdjK8yqmqSR"
	swigPDA  = "4hFTuZxrMbZciAxA9DcLYYC9vupNuw89v527ys6PvRo2"
	payTo    = "EkkpfzUdwwgeqWb25hWcSi2c5gquELLUB3Z2asr1Xroo"
)

func decodeTx(t *testing.T) *solana.Transaction {
	t.Helper()
	tx, err := svm.DecodeTransaction(realSwigTxBase64)
	require.NoError(t, err)
	return tx
}

// --- Test 1: IsSwigTransaction detection ---

func TestRealSwigTx_IsSwigTransaction(t *testing.T) {
	tx := decodeTx(t)
	assert.True(t, svm.IsSwigTransaction(tx), "expected real devnet tx to be detected as Swig")
}

// --- Test 2: ParseSwigTransaction ---

func TestRealSwigTx_ParseSwigTransaction(t *testing.T) {
	tx := decodeTx(t)
	result, err := svm.ParseSwigTransaction(tx)
	require.NoError(t, err)

	t.Run("flattened instruction count", func(t *testing.T) {
		assert.Len(t, result.Instructions, 3)
	})

	t.Run("swig PDA matches", func(t *testing.T) {
		assert.Equal(t, swigPDA, result.SwigPDA)
	})

	t.Run("transfer checked discriminator", func(t *testing.T) {
		transferIx := result.Instructions[2]
		require.True(t, len(transferIx.Data) > 0, "transfer instruction data should not be empty")
		assert.Equal(t, byte(12), transferIx.Data[0], "expected TransferChecked discriminator (12)")
	})

	t.Run("transfer checked amount and decimals", func(t *testing.T) {
		transferIx := result.Instructions[2]
		require.True(t, len(transferIx.Data) >= 10, "transfer instruction data too short")
		amount := binary.LittleEndian.Uint64(transferIx.Data[1:9])
		decimals := transferIx.Data[9]
		assert.Equal(t, uint64(1), amount)
		assert.Equal(t, byte(6), decimals)
	})

	t.Run("compute budget instructions sorted correctly", func(t *testing.T) {
		// First instruction should be SetComputeUnitLimit (disc=2)
		assert.Equal(t, byte(2), result.Instructions[0].Data[0], "expected SetComputeUnitLimit at index 0")
		// Second instruction should be SetComputeUnitPrice (disc=3)
		assert.Equal(t, byte(3), result.Instructions[1].Data[0], "expected SetComputeUnitPrice at index 1")
	})
}

// --- Test 3: NormalizeTransaction ---

func TestRealSwigTx_NormalizeTransaction(t *testing.T) {
	tx := decodeTx(t)
	normalized, err := svm.NormalizeTransaction(tx)
	require.NoError(t, err)

	t.Run("payer is swig PDA", func(t *testing.T) {
		assert.Equal(t, swigPDA, normalized.Payer)
	})

	t.Run("three instructions", func(t *testing.T) {
		assert.Len(t, normalized.Instructions, 3)
	})
}

// --- Test 4: Full verify pipeline ---

type mockFacilitatorSigner struct{}

func (m *mockFacilitatorSigner) GetAddresses(_ context.Context, _ string) []solana.PublicKey {
	return []solana.PublicKey{solana.MustPublicKeyFromBase58(feePayer)}
}

func (m *mockFacilitatorSigner) SignTransaction(_ context.Context, _ *solana.Transaction, _ solana.PublicKey, _ string) error {
	return nil
}

func (m *mockFacilitatorSigner) SimulateTransaction(_ context.Context, _ *solana.Transaction, _ string) error {
	return nil
}

func (m *mockFacilitatorSigner) SendTransaction(_ context.Context, _ *solana.Transaction, _ string) (solana.Signature, error) {
	return solana.Signature{}, nil
}

func (m *mockFacilitatorSigner) ConfirmTransaction(_ context.Context, _ solana.Signature, _ string) error {
	return nil
}

func TestRealSwigTx_VerifyPipeline(t *testing.T) {
	signer := &mockFacilitatorSigner{}
	scheme := facilitator.NewExactSvmScheme(signer)

	requirements := types.PaymentRequirements{
		Scheme:  "exact",
		Network: svm.SolanaDevnetCAIP2,
		Asset:   svm.USDCDevnetAddress,
		Amount:  "1",
		PayTo:   payTo,
		Extra:   map[string]interface{}{"feePayer": feePayer},
	}

	payload := types.PaymentPayload{
		X402Version: 2,
		Resource: &types.ResourceInfo{
			URL:         "http://example.com/protected",
			Description: "Test resource",
			MimeType:    "application/json",
		},
		Accepted: requirements,
		Payload:  map[string]interface{}{"transaction": realSwigTxBase64},
	}

	ctx := context.Background()
	result, err := scheme.Verify(ctx, payload, requirements, nil)

	t.Run("verify returns no error", func(t *testing.T) {
		assert.NoError(t, err)
		require.NotNil(t, result)
	})

	t.Run("verify is valid", func(t *testing.T) {
		require.NotNil(t, result)
		assert.True(t, result.IsValid)
	})

	t.Run("payer is swig PDA", func(t *testing.T) {
		require.NotNil(t, result)
		assert.Equal(t, swigPDA, result.Payer)
	})
}
