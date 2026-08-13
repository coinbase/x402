package paymentchannels

import (
	"testing"

	solana "github.com/gagliardetto/solana-go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestVerifyOpenTransactionAcceptsBuiltOpen(t *testing.T) {
	fixture := newOpenFixture(t)

	result, err := VerifyOpenTransaction(encodeTransaction(t, fixture.built.Transaction), fixture.expected())
	require.NoError(t, err)

	assert.Equal(t, fixture.built.ChannelID, result.ChannelID)
	assert.Equal(t, fixture.payerKey.PublicKey(), result.Payer)
	assert.Equal(t, fixture.deposit, result.Deposit)
	assert.Equal(t, fixture.graceSeconds, result.GracePeriod)
	assert.Equal(t, fixture.openSlot, result.OpenSlot)
	assert.Equal(t, fixture.salt, result.Salt)
	require.Len(t, result.Recipients, 1)
	assert.Equal(t, fixture.payTo.String(), result.Recipients[0].Recipient)
	assert.Equal(t, BasisPointsDenominator, result.Recipients[0].BPS)
}

func TestVerifyOpenTransactionRejectsDepositMismatch(t *testing.T) {
	fixture := newOpenFixture(t)
	expected := fixture.expected()
	expected.MaxCap = fixture.deposit + 1

	_, err := VerifyOpenTransaction(encodeTransaction(t, fixture.built.Transaction), expected)
	require.ErrorContains(t, err, "deposit 10000 != maxCap 10001")
}

func TestVerifyOpenTransactionRejectsMissingPayerSignature(t *testing.T) {
	fixture := newOpenFixture(t)
	fixture.built.Transaction.Signatures = make([]solana.Signature, len(fixture.built.Transaction.Signatures))

	_, err := VerifyOpenTransaction(encodeTransaction(t, fixture.built.Transaction), fixture.expected())
	require.ErrorContains(t, err, "missing signature for payload.from")
}

func TestResolveMemoData(t *testing.T) {
	memo := "order-42"
	data, err := resolveMemoData(&memo)
	require.NoError(t, err)
	assert.Equal(t, "order-42", string(data))

	nonce, err := resolveMemoData(nil)
	require.NoError(t, err)
	assert.Len(t, nonce, 32, "a random nonce is 16 bytes of hex")

	// A seller that advertises an empty memo gets an empty memo: substituting a
	// nonce would fail the facilitator's exact-match check.
	empty := ""
	data, err = resolveMemoData(&empty)
	require.NoError(t, err)
	assert.Empty(t, data)

	oversized := string(make([]byte, MaxMemoBytes+1))
	_, err = resolveMemoData(&oversized)
	require.ErrorContains(t, err, "exceeds maximum 256 bytes")
}
