package facilitator

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	x402 "github.com/x402-foundation/x402/go/v2"
	"github.com/x402-foundation/x402/go/v2/extensions/erc20approvalgassponsor"
	"github.com/x402-foundation/x402/go/v2/mechanisms/evm"
	"github.com/x402-foundation/x402/go/v2/types"
)

// plainEIP3009Payload builds a payment payload + requirements signed by a deployed smart
// wallet whose signature the mock signer cannot directly verify (EIP-1271 always reports
// invalid), so classification falls through to the "smart wallet, verified via simulation"
// path used by real ERC-1271 wallets. Simulation stays disabled (SimulateInSettle: false),
// so settle proceeds straight to broadcast — no ERC-6492 deployment step involved.
func plainEIP3009Payload(t *testing.T) (types.PaymentPayload, types.PaymentRequirements) {
	t.Helper()
	const (
		payer = "0x1234567890123456789012345678901234567890"
		payTo = "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0"
		token = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
	)
	p := &evm.ExactEIP3009Payload{
		Signature: "0x" + strings.Repeat("11", 65),
		Authorization: evm.ExactEIP3009Authorization{
			From:        payer,
			To:          payTo,
			Value:       "1000000",
			ValidAfter:  "0",
			ValidBefore: "99999999999",
			Nonce:       "0x" + strings.Repeat("00", 32),
		},
	}
	requirements := types.PaymentRequirements{
		Scheme:  "exact",
		Network: "eip155:84532",
		Amount:  "1000000",
		Asset:   token,
		PayTo:   payTo,
		Extra:   map[string]interface{}{"name": "USDC", "version": "2"},
	}
	return types.PaymentPayload{X402Version: 2, Payload: p.ToMap(), Accepted: requirements}, requirements
}

// A receipt-wait failure after broadcast (RPC error, timeout) is non-terminal: the transfer
// may still land on chain. Settle must report `settlement_pending` with the broadcast
// transaction hash rather than losing it behind a generic error.
func TestSettleEIP3009_ReceiptWaitFailureReturnsSettlementPending(t *testing.T) {
	const (
		payer = "0x1234567890123456789012345678901234567890"
		token = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
	)
	payload, requirements := plainEIP3009Payload(t)
	signer := &settleMockSigner{
		codeByAddress: map[string][]byte{
			strings.ToLower(token): {0x60, 0x60}, // asset is a deployed contract
			strings.ToLower(payer): {0x60, 0x60}, // payer is a deployed smart wallet
		},
		receiptErr: fmt.Errorf("rpc: timeout waiting for receipt"),
	}
	scheme := NewExactEvmScheme(signer, &ExactEvmSchemeConfig{})

	resp, err := scheme.Settle(context.Background(), payload, requirements, nil)
	if err == nil {
		t.Fatalf("expected settlement_pending error, got success: %+v", resp)
	}

	se := &x402.SettleError{}
	if !errors.As(err, &se) {
		t.Fatalf("expected *x402.SettleError, got %T: %v", err, err)
	}
	if se.ErrorReason != ErrSettlementPending {
		t.Fatalf("expected reason %q, got %q", ErrSettlementPending, se.ErrorReason)
	}
	wantTxHash := "0x" + strings.Repeat("ab", 32) // fixed hash returned by settleMockSigner.WriteContract
	if se.Transaction != wantTxHash {
		t.Fatalf("expected transaction %q preserved despite receipt-wait failure, got %q", wantTxHash, se.Transaction)
	}
}

// mockErc20ApprovalSigner wraps settleMockSigner with SendTransactions to satisfy
// erc20approvalgassponsor.Erc20ApprovalGasSponsoringSigner for the ERC-20 approval branch.
type mockErc20ApprovalSigner struct {
	*settleMockSigner
	sendTxHashes []string
	sendTxErr    error
}

func (m *mockErc20ApprovalSigner) SendTransactions(ctx context.Context, transactions []erc20approvalgassponsor.TransactionRequest) ([]string, error) {
	return m.sendTxHashes, m.sendTxErr
}

func TestSettlePermit2_ERC20ApprovalIncompleteHashesReturnedWithoutError(t *testing.T) {
	const (
		payer = "0x1234567890123456789012345678901234567890"
		token = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
		payTo = "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0"
	)
	requirements := types.PaymentRequirements{
		Scheme:  "exact",
		Network: "eip155:84532",
		Amount:  "1000000",
		Asset:   token,
		PayTo:   payTo,
	}
	permit2Payload := &evm.ExactPermit2Payload{
		Signature: "0x" + strings.Repeat("11", 65),
		Permit2Authorization: evm.Permit2Authorization{
			From: payer,
			Permitted: evm.Permit2TokenPermissions{
				Token:  token,
				Amount: "1000000",
			},
			Spender:  evm.X402ExactPermit2ProxyAddress,
			Nonce:    "1",
			Deadline: fmt.Sprintf("%d", time.Now().Unix()+10000),
			Witness: evm.Permit2Witness{
				To:         payTo,
				ValidAfter: "0",
			},
		},
	}
	payload := types.PaymentPayload{
		X402Version: 2,
		Payload:     permit2Payload.ToMap(),
		Accepted:    requirements,
		Extensions: map[string]interface{}{
			erc20approvalgassponsor.ERC20ApprovalGasSponsoring.Key(): map[string]interface{}{
				"info": &erc20approvalgassponsor.Info{
					From:              payer,
					Asset:             token,
					Spender:           evm.PERMIT2Address,
					Amount:            "1000000",
					SignedTransaction: "0x02",
					Version:           erc20approvalgassponsor.ERC20ApprovalGasSponsoringVersion,
				},
			},
		},
	}
	signer := &settleMockSigner{
		codeByAddress: map[string][]byte{
			strings.ToLower(token): {0x60, 0x60},
			strings.ToLower(payer): {0x60, 0x60},
		},
	}
	extSigner := &mockErc20ApprovalSigner{
		settleMockSigner: &settleMockSigner{},
		sendTxHashes:     []string{"0xapproval"},
	}
	ext := &erc20approvalgassponsor.Erc20ApprovalFacilitatorExtension{Signer: extSigner}
	facilCtx := x402.NewFacilitatorContext(map[string]x402.FacilitatorExtension{
		erc20approvalgassponsor.ERC20ApprovalGasSponsoring.Key(): ext,
	})

	_, err := SettlePermit2(context.Background(), signer, payload, requirements, permit2Payload, facilCtx, nil)
	if err == nil {
		t.Fatal("expected error when extension signer returns incomplete transaction hashes")
	}
	se := &x402.SettleError{}
	if !errors.As(err, &se) {
		t.Fatalf("expected *x402.SettleError, got %T: %v", err, err)
	}
	if se.ErrorReason == ErrSettlementPending {
		t.Errorf("must not report settlement_pending with an empty transaction hash, got reason=%q transaction=%q", se.ErrorReason, se.Transaction)
	}
}

// Same non-terminal receipt-wait failure, exercised through the Permit2 settle path.
func TestSettlePermit2_ReceiptWaitFailureReturnsSettlementPending(t *testing.T) {
	const (
		payer = "0x1234567890123456789012345678901234567890"
		token = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
		payTo = "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0"
	)
	requirements := types.PaymentRequirements{
		Scheme:  "exact",
		Network: "eip155:84532",
		Amount:  "1000000",
		Asset:   token,
		PayTo:   payTo,
	}
	permit2Payload := &evm.ExactPermit2Payload{
		Signature: "0x" + strings.Repeat("11", 65),
		Permit2Authorization: evm.Permit2Authorization{
			From: payer,
			Permitted: evm.Permit2TokenPermissions{
				Token:  token,
				Amount: "1000000",
			},
			Spender:  evm.X402ExactPermit2ProxyAddress,
			Nonce:    "1",
			Deadline: fmt.Sprintf("%d", time.Now().Unix()+10000),
			Witness: evm.Permit2Witness{
				To:         payTo,
				ValidAfter: "0",
			},
		},
	}
	payload := types.PaymentPayload{X402Version: 2, Payload: permit2Payload.ToMap(), Accepted: requirements}
	signer := &settleMockSigner{
		codeByAddress: map[string][]byte{
			strings.ToLower(token): {0x60, 0x60}, // asset is a deployed contract
			strings.ToLower(payer): {0x60, 0x60}, // deployed contract so the ERC-1271 fallback applies
		},
		receiptErr: fmt.Errorf("rpc: timeout waiting for receipt"),
	}

	resp, err := SettlePermit2(context.Background(), signer, payload, requirements, permit2Payload, nil, nil)
	if err == nil {
		t.Fatalf("expected settlement_pending error, got success: %+v", resp)
	}

	se := &x402.SettleError{}
	if !errors.As(err, &se) {
		t.Fatalf("expected *x402.SettleError, got %T: %v", err, err)
	}
	if se.ErrorReason != ErrSettlementPending {
		t.Fatalf("expected reason %q, got %q", ErrSettlementPending, se.ErrorReason)
	}
	wantTxHash := "0x" + strings.Repeat("ab", 32) // fixed hash returned by settleMockSigner.WriteContract
	if se.Transaction != wantTxHash {
		t.Fatalf("expected transaction %q preserved despite receipt-wait failure, got %q", wantTxHash, se.Transaction)
	}
}
