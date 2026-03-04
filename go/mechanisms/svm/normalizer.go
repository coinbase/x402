package svm

import (
	"errors"

	solana "github.com/gagliardetto/solana-go"
)

// NormalizedTransaction is the output of a TransactionNormalizer: a flat
// instruction list and the address of the entity paying the token transfer.
type NormalizedTransaction struct {
	Instructions []solana.CompiledInstruction
	Payer        string
}

// TransactionNormalizer knows how to detect and flatten a particular wallet
// type's transaction layout into a NormalizedTransaction.
type TransactionNormalizer interface {
	CanHandle(tx *solana.Transaction) bool
	Normalize(tx *solana.Transaction) (*NormalizedTransaction, error)
}

// RegularNormalizer is the fallback normalizer for standard (non-smart-wallet)
// transactions. It returns the transaction's instructions as-is and derives the
// payer from the first TransferChecked instruction.
type RegularNormalizer struct{}

func (r *RegularNormalizer) CanHandle(_ *solana.Transaction) bool {
	return true
}

func (r *RegularNormalizer) Normalize(tx *solana.Transaction) (*NormalizedTransaction, error) {
	payer, err := GetTokenPayerFromTransaction(tx)
	if err != nil {
		return nil, err
	}
	return &NormalizedTransaction{
		Instructions: tx.Message.Instructions,
		Payer:        payer,
	}, nil
}

// DefaultNormalizers is the ordered list of normalizers tried by
// NormalizeTransaction. Specific wallet types come first; RegularNormalizer is
// the catch-all fallback.
var DefaultNormalizers = []TransactionNormalizer{
	&SwigNormalizer{},
	&RegularNormalizer{},
}

// NormalizeTransaction runs the default normalizer chain against tx and returns
// the first successful result.
func NormalizeTransaction(tx *solana.Transaction) (*NormalizedTransaction, error) {
	for _, n := range DefaultNormalizers {
		if n.CanHandle(tx) {
			return n.Normalize(tx)
		}
	}
	return nil, errors.New("no normalizer found for transaction")
}
