package paymentchannels

import (
	"crypto/rand"
	"encoding/binary"
	"encoding/hex"
	"fmt"

	solana "github.com/gagliardetto/solana-go"

	"github.com/x402-foundation/x402/go/v2/mechanisms/svm"
)

// MaxMemoBytes is the maximum byte length of the seller-defined memo.
const MaxMemoBytes = svm.MaxMemoBytes

// memoProgramID is the SPL Memo program. The memo makes concurrent opens with
// otherwise identical parameters unique transactions.
var memoProgramID = solana.MustPublicKeyFromBase58(svm.MemoProgramAddress)

// BuildOpenArgs are the inputs for the client-side `open` transaction.
type BuildOpenArgs struct {
	Payer            solana.PublicKey
	Payee            solana.PublicKey
	Mint             solana.PublicKey
	AuthorizedSigner solana.PublicKey
	FeePayer         solana.PublicKey
	TokenProgram     solana.PublicKey
	Deposit          uint64
	Blockhash        solana.Hash
	OpenSlot         uint64
	GracePeriod      uint32
	Recipients       []Split
	// Salt is the channel-derivation salt; a random u64 is used when nil.
	Salt *uint64
	// Memo is the seller-defined memo (extra.memo) when set, including the
	// empty string. A random hex nonce is emitted when nil.
	Memo *string
}

// BuiltOpen is an unsigned `open` transaction plus the channel facts the
// caller must echo in its payload.
type BuiltOpen struct {
	ChannelID   solana.PublicKey
	Transaction *solana.Transaction
	Deposit     uint64
	Salt        uint64
	OpenSlot    uint64
}

// BuildOpenTransaction builds the fee-payer-sponsored `open` transaction. The
// returned transaction is unsigned: the payer signs it as the client
// authorization and the sponsor co-signs before broadcast.
func BuildOpenTransaction(args BuildOpenArgs) (*BuiltOpen, error) {
	salt, err := resolveSalt(args.Salt)
	if err != nil {
		return nil, err
	}

	openIx, channelID, err := BuildOpenInstruction(OpenInstructionArgs{
		Payer:            args.Payer,
		RentPayer:        args.FeePayer,
		Payee:            args.Payee,
		Mint:             args.Mint,
		AuthorizedSigner: args.AuthorizedSigner,
		TokenProgram:     args.TokenProgram,
		Args: OpenArgs{
			Salt:        salt,
			Deposit:     args.Deposit,
			GracePeriod: args.GracePeriod,
			OpenSlot:    args.OpenSlot,
			Recipients:  args.Recipients,
		},
	})
	if err != nil {
		return nil, err
	}

	memoData, err := resolveMemoData(args.Memo)
	if err != nil {
		return nil, err
	}
	memoIx := solana.NewInstruction(memoProgramID, solana.AccountMetaSlice{}, memoData)

	tx, err := solana.NewTransactionBuilder().
		AddInstruction(openIx).
		AddInstruction(memoIx).
		SetRecentBlockHash(args.Blockhash).
		SetFeePayer(args.FeePayer).
		Build()
	if err != nil {
		return nil, fmt.Errorf("failed to build open transaction: %w", err)
	}
	tx.Message.SetVersion(solana.MessageVersionV0)

	return &BuiltOpen{
		ChannelID:   channelID,
		Transaction: tx,
		Deposit:     args.Deposit,
		Salt:        salt,
		OpenSlot:    args.OpenSlot,
	}, nil
}

func resolveSalt(salt *uint64) (uint64, error) {
	if salt != nil {
		return *salt, nil
	}
	buf := make([]byte, 8)
	if _, err := rand.Read(buf); err != nil {
		return 0, fmt.Errorf("failed to generate channel salt: %w", err)
	}
	return binary.LittleEndian.Uint64(buf), nil
}

func resolveMemoData(memo *string) ([]byte, error) {
	if memo != nil {
		if len(*memo) > MaxMemoBytes {
			return nil, fmt.Errorf("extra.memo exceeds maximum %d bytes", MaxMemoBytes)
		}
		return []byte(*memo), nil
	}
	nonce := make([]byte, 16)
	if _, err := rand.Read(nonce); err != nil {
		return nil, fmt.Errorf("failed to generate memo nonce: %w", err)
	}
	return []byte(hex.EncodeToString(nonce)), nil
}
