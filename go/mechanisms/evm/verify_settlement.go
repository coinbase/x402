package evm

import (
	"context"
	"fmt"
)

// ReceiptProvider can retrieve a transaction receipt from the blockchain.
// FacilitatorEvmSigner satisfies this interface.
type ReceiptProvider interface {
	WaitForTransactionReceipt(ctx context.Context, txHash string) (*TransactionReceipt, error)
}

// SettlementVerification contains the result of verifying a settlement
// transaction on-chain.
type SettlementVerification struct {
	// Confirmed is true if the transaction was mined and succeeded.
	Confirmed bool `json:"confirmed"`

	// BlockNumber is the block in which the transaction was included.
	// Zero when the transaction is unconfirmed or failed.
	BlockNumber uint64 `json:"blockNumber,omitempty"`

	// TxHash is the transaction hash that was verified.
	TxHash string `json:"txHash"`

	// Network is the CAIP-2 network identifier where verification was performed.
	Network string `json:"network"`

	// FailureReason describes why verification failed, if applicable.
	FailureReason string `json:"failureReason,omitempty"`
}

// VerifySettlement confirms that a settlement transaction was included in a
// block and succeeded. It queries the blockchain for the transaction receipt
// using the provided signer's WaitForTransactionReceipt method.
//
// Returns a SettlementVerification with Confirmed=true if the transaction
// was mined with a success status. Returns Confirmed=false with a
// FailureReason if the transaction failed or could not be found.
func VerifySettlement(ctx context.Context, provider ReceiptProvider, txHash string, network string) (*SettlementVerification, error) {
	if txHash == "" {
		return &SettlementVerification{
			Confirmed:     false,
			TxHash:        txHash,
			Network:       network,
			FailureReason: "empty transaction hash",
		}, nil
	}

	receipt, err := provider.WaitForTransactionReceipt(ctx, txHash)
	if err != nil {
		return nil, fmt.Errorf("failed to get transaction receipt for %s: %w", txHash, err)
	}

	if receipt.Status != TxStatusSuccess {
		return &SettlementVerification{
			Confirmed:     false,
			BlockNumber:   receipt.BlockNumber,
			TxHash:        receipt.TxHash,
			Network:       network,
			FailureReason: fmt.Sprintf("transaction reverted with status %d", receipt.Status),
		}, nil
	}

	return &SettlementVerification{
		Confirmed:   true,
		BlockNumber: receipt.BlockNumber,
		TxHash:      receipt.TxHash,
		Network:     network,
	}, nil
}
