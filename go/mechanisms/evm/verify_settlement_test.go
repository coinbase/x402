package evm

import (
	"context"
	"errors"
	"testing"
)

// mockReceiptProvider implements ReceiptProvider for tests.
type mockReceiptProvider struct {
	receipt *TransactionReceipt
	err     error
}

func (m *mockReceiptProvider) WaitForTransactionReceipt(ctx context.Context, txHash string) (*TransactionReceipt, error) {
	return m.receipt, m.err
}

func TestVerifySettlement_Confirmed(t *testing.T) {
	signer := &mockReceiptProvider{
		receipt: &TransactionReceipt{
			Status:      TxStatusSuccess,
			BlockNumber: 12345,
			TxHash:      "0xabc",
		},
	}

	result, err := VerifySettlement(context.Background(), signer, "0xabc", "eip155:8453")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.Confirmed {
		t.Fatal("expected confirmed")
	}
	if result.BlockNumber != 12345 {
		t.Fatalf("expected block 12345, got %d", result.BlockNumber)
	}
	if result.Network != "eip155:8453" {
		t.Fatalf("expected network eip155:8453, got %s", result.Network)
	}
}

func TestVerifySettlement_Reverted(t *testing.T) {
	signer := &mockReceiptProvider{
		receipt: &TransactionReceipt{
			Status:      0,
			BlockNumber: 12345,
			TxHash:      "0xdef",
		},
	}

	result, err := VerifySettlement(context.Background(), signer, "0xdef", "eip155:8453")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Confirmed {
		t.Fatal("expected not confirmed")
	}
	if result.FailureReason == "" {
		t.Fatal("expected failure reason")
	}
}

func TestVerifySettlement_RPCError(t *testing.T) {
	signer := &mockReceiptProvider{
		err: errors.New("rpc connection refused"),
	}

	_, err := VerifySettlement(context.Background(), signer, "0xghi", "eip155:8453")
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestVerifySettlement_EmptyTxHash(t *testing.T) {
	signer := &mockReceiptProvider{}

	result, err := VerifySettlement(context.Background(), signer, "", "eip155:8453")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Confirmed {
		t.Fatal("expected not confirmed for empty hash")
	}
	if result.FailureReason == "" {
		t.Fatal("expected failure reason for empty hash")
	}
}
