package facilitator

import (
	"context"
	"errors"
	"fmt"

	solana "github.com/gagliardetto/solana-go"
	computebudget "github.com/gagliardetto/solana-go/programs/compute-budget"
	"github.com/gagliardetto/solana-go/rpc"

	"github.com/x402-foundation/x402/go/v2/mechanisms/svm"
	"github.com/x402-foundation/x402/go/v2/mechanisms/svm/paymentchannels"
	"github.com/x402-foundation/x402/go/v2/mechanisms/svm/upto"
)

// simComputeUnitLimit is the Solana per-transaction compute maximum. Only used
// for facilitator-built simulations: the composite open + settle + distribute
// exceeds the 400,000 CU ceiling the client open is capped at.
const simComputeUnitLimit = 1_400_000

// expectedOpenChannel are the challenge-bound terms a confirmed channel account
// must match before the facilitator settles against it. They arrive as strings
// because that is how the challenge and payload carry them.
type expectedOpenChannel struct {
	AuthorizedSigner string
	Mint             string
	Payee            string
	Payer            string
	RentPayer        string
	Deposit          uint64
	GracePeriod      uint32
	Splits           []paymentchannels.Split
}

// channelKeys are a channel's onchain addresses as decoded from the account, so
// settlement builds instructions without parsing them back out of strings.
type channelKeys struct {
	ChannelID        solana.PublicKey
	AuthorizedSigner solana.PublicKey
	Mint             solana.PublicKey
	Payee            solana.PublicKey
	Payer            solana.PublicKey
	RentPayer        solana.PublicKey
}

// verifiedOpenChannel are the onchain channel facts retained from verification
// through settlement.
type verifiedOpenChannel struct {
	channelKeys
	Splits []paymentchannels.Split
}

// settlement projects a verified channel onto the settle+distribute inputs.
func (c *verifiedOpenChannel) settlement(tokenProgram solana.PublicKey, network string) settlementChannel {
	return settlementChannel{
		ChannelID:    c.ChannelID,
		Mint:         c.Mint,
		Payee:        c.Payee,
		Payer:        c.Payer,
		RentPayer:    c.RentPayer,
		TokenProgram: tokenProgram,
		Network:      network,
		Splits:       c.Splits,
	}
}

// fetchChannelAccount reads and decodes a channel account. The second return
// value reports whether the account exists at all.
func fetchChannelAccount(
	ctx context.Context,
	rpcClient *rpc.Client,
	channelID solana.PublicKey,
) (*paymentchannels.Channel, bool, error) {
	account, err := getChannelAccount(ctx, rpcClient, channelID)
	if err != nil {
		if errors.Is(err, rpc.ErrNotFound) {
			return nil, false, nil
		}
		return nil, false, fmt.Errorf("failed to fetch channel %s: %w", channelID, err)
	}
	if account == nil || account.Value == nil {
		return nil, false, nil
	}

	channel, err := paymentchannels.DecodeChannel(account.Value.Data.GetBinary())
	if err != nil {
		return nil, true, err
	}
	return channel, true, nil
}

// getChannelAccount reads a channel account at the commitment the facilitator
// confirms its own transactions at, so an open broadcast on a previous request
// is visible to this one.
func getChannelAccount(
	ctx context.Context,
	rpcClient *rpc.Client,
	channelID solana.PublicKey,
) (*rpc.GetAccountInfoResult, error) {
	return rpcClient.GetAccountInfoWithOpts(ctx, channelID, &rpc.GetAccountInfoOpts{
		Encoding:   solana.EncodingBase64,
		Commitment: upto.StateCommitment,
	})
}

// channelExists reports whether the channel PDA is already allocated onchain.
func channelExists(ctx context.Context, rpcClient *rpc.Client, channelID solana.PublicKey) (bool, error) {
	account, err := getChannelAccount(ctx, rpcClient, channelID)
	if err != nil {
		if errors.Is(err, rpc.ErrNotFound) {
			return false, nil
		}
		return false, fmt.Errorf("failed to fetch channel %s: %w", channelID, err)
	}
	return account != nil && account.Value != nil, nil
}

// fetchAndVerifyOpenChannel refetches the confirmed channel and rebinds it to
// the challenge terms before the facilitator settles against it.
func fetchAndVerifyOpenChannel(
	ctx context.Context,
	rpcClient *rpc.Client,
	channelID solana.PublicKey,
	expected expectedOpenChannel,
) (*verifiedOpenChannel, error) {
	channel, exists, err := fetchChannelAccount(ctx, rpcClient, channelID)
	if err != nil {
		return nil, err
	}
	if !exists {
		return nil, fmt.Errorf("channel %s does not exist", channelID)
	}
	return verifyOpenChannelAccount(channelID, channel, expected)
}

// verifyOpenChannelAccount binds a decoded channel account to the terms the
// facilitator verified in the submitted open. The onchain account — not the
// client payload — is the source of truth for settlement.
func verifyOpenChannelAccount(
	channelID solana.PublicKey,
	channel *paymentchannels.Channel,
	expected expectedOpenChannel,
) (*verifiedOpenChannel, error) {
	if channel.Status != paymentchannels.StatusOpen {
		return nil, fmt.Errorf("channel %s is not open (status %s)", channelID, channel.Status)
	}

	bindings := []struct {
		label  string
		actual string
		wanted string
	}{
		{"mint", channel.Mint.String(), expected.Mint},
		{"payee", channel.Payee.String(), expected.Payee},
		{"authorized signer", channel.AuthorizedSigner.String(), expected.AuthorizedSigner},
		{"rent payer", channel.RentPayer.String(), expected.RentPayer},
		{"payer", channel.Payer.String(), expected.Payer},
	}
	for _, binding := range bindings {
		if binding.actual != binding.wanted {
			return nil, fmt.Errorf("channel %s %s != expected %s", binding.label, binding.actual, binding.wanted)
		}
	}

	if channel.GracePeriod != expected.GracePeriod {
		return nil, fmt.Errorf("channel grace period %d != expected %d", channel.GracePeriod, expected.GracePeriod)
	}
	if channel.Deposit != expected.Deposit {
		return nil, fmt.Errorf("channel deposit %d != expected %d", channel.Deposit, expected.Deposit)
	}

	expectedHash, err := paymentchannels.DistributionHash(expected.Splits)
	if err != nil {
		return nil, err
	}
	if channel.DistributionHash != expectedHash {
		return nil, fmt.Errorf("channel distribution does not match the expected recipient split")
	}

	return &verifiedOpenChannel{
		channelKeys: channelKeys{
			ChannelID:        channelID,
			AuthorizedSigner: channel.AuthorizedSigner,
			Mint:             channel.Mint,
			Payee:            channel.Payee,
			Payer:            channel.Payer,
			RentPayer:        channel.RentPayer,
		},
		Splits: expected.Splits,
	}, nil
}

// broadcastOpen co-signs the fee-payer slot of the client's partially signed
// open, broadcasts it, and waits for confirmation.
func broadcastOpen(
	ctx context.Context,
	signer svm.FacilitatorSvmSigner,
	feePayer solana.PublicKey,
	network string,
	openTransactionBase64 string,
) (string, error) {
	tx, err := svm.DecodeTransaction(openTransactionBase64)
	if err != nil {
		return "", err
	}
	if err := signer.SignTransaction(ctx, tx, feePayer, network); err != nil {
		return "", err
	}
	signature, err := signer.SendTransaction(ctx, tx, network)
	if err != nil {
		return "", err
	}
	if err := signer.ConfirmTransaction(ctx, signature, network); err != nil {
		return "", err
	}
	return signature.String(), nil
}

// settlementChannel are the channel facts needed to build settle+distribute,
// for both the pre-broadcast simulation and the real claim. The authorized
// signer is absent because it travels with the voucher, which the simulation
// does not carry.
type settlementChannel struct {
	ChannelID    solana.PublicKey
	Mint         solana.PublicKey
	Payee        solana.PublicKey
	Payer        solana.PublicKey
	RentPayer    solana.PublicKey
	TokenProgram solana.PublicKey
	Network      string
	Splits       []paymentchannels.Split
}

// simulateOpenSettleDistribute simulates open + settle_and_seal(has_voucher=0)
// + distribute against live state before broadcasting the open, so settlement
// account failures reject the payment without escrowing the client's deposit.
//
// The simulated transaction is facilitator-owned and never broadcast: the
// client's instructions are kept verbatim, the compute-unit limit is raised to
// the per-transaction max, and the payer's signature is absent (simulation runs
// with signature verification off).
func simulateOpenSettleDistribute(
	ctx context.Context,
	rpcClient *rpc.Client,
	signer svm.FacilitatorSvmSigner,
	feePayer solana.PublicKey,
	openTransactionBase64 string,
	channel settlementChannel,
) error {
	openTx, err := svm.DecodeTransaction(openTransactionBase64)
	if err != nil {
		return err
	}

	computeLimitIx, err := computebudget.NewSetComputeUnitLimitInstructionBuilder().
		SetUnits(simComputeUnitLimit).
		ValidateAndBuild()
	if err != nil {
		return fmt.Errorf("failed to build compute limit instruction: %w", err)
	}
	instructions := []solana.Instruction{computeLimitIx}

	for _, compiled := range openTx.Message.Instructions {
		program, err := openTx.Message.Program(compiled.ProgramIDIndex)
		if err != nil {
			return fmt.Errorf("failed to resolve open instruction program: %w", err)
		}
		// Keep the client's priority fee; its compute-unit limit is replaced above.
		isPriorityFee := len(compiled.Data) > 0 && compiled.Data[0] == paymentchannels.ComputeBudgetSetUnitPrice
		if program.Equals(solana.ComputeBudget) && !isPriorityFee {
			continue
		}
		accounts, err := compiled.ResolveInstructionAccounts(&openTx.Message)
		if err != nil {
			return fmt.Errorf("failed to resolve open instruction accounts: %w", err)
		}
		instructions = append(instructions, solana.NewInstruction(program, accounts, compiled.Data))
	}

	settleInstructions, err := buildSettleAndDistribute(channel, nil)
	if err != nil {
		return err
	}
	instructions = append(instructions, settleInstructions...)

	return simulateInstructions(ctx, rpcClient, signer, feePayer, channel.Network, instructions)
}

// voucherArgs carry a signed voucher into settle_and_seal via the Ed25519
// precompile. A nil voucher seals the channel at zero (full refund).
type voucherArgs struct {
	AuthorizedSigner solana.PublicKey
	SignatureBase58  string
	CumulativeAmount uint64
	ExpiresAt        int64
}

// buildSettleAndDistribute builds the settlement instruction sequence:
// an optional Ed25519 precompile carrying the voucher, settle_and_seal, and
// distribute. The precompile must immediately precede settle_and_seal because
// the program reads the voucher from the instruction at index -1.
func buildSettleAndDistribute(
	channel settlementChannel,
	voucher *voucherArgs,
) ([]solana.Instruction, error) {
	var instructions []solana.Instruction

	if voucher != nil {
		signature, err := solana.SignatureFromBase58(voucher.SignatureBase58)
		if err != nil {
			return nil, fmt.Errorf("voucher signature is not valid base58: %w", err)
		}
		message := paymentchannels.EncodeVoucherMessage(
			channel.ChannelID, voucher.CumulativeAmount, voucher.ExpiresAt,
		)
		precompile, err := paymentchannels.BuildEd25519VerifyInstruction(
			message, signature[:], voucher.AuthorizedSigner,
		)
		if err != nil {
			return nil, err
		}
		instructions = append(instructions, precompile)
	}

	instructions = append(instructions, paymentchannels.BuildSettleAndSealInstruction(
		channel.ChannelID, channel.Payee, voucher != nil,
	))

	distribute, err := paymentchannels.BuildDistributeInstruction(paymentchannels.DistributeInstructionArgs{
		Channel:      channel.ChannelID,
		Payer:        channel.Payer,
		Payee:        channel.Payee,
		RentPayer:    channel.RentPayer,
		Mint:         channel.Mint,
		TokenProgram: channel.TokenProgram,
		Splits:       channel.Splits,
		Network:      channel.Network,
	})
	if err != nil {
		return nil, err
	}
	return append(instructions, distribute), nil
}

// buildSignedTransaction compiles instructions into a fee-payer-signed
// transaction anchored to a fresh blockhash.
func buildSignedTransaction(
	ctx context.Context,
	rpcClient *rpc.Client,
	signer svm.FacilitatorSvmSigner,
	feePayer solana.PublicKey,
	network string,
	instructions []solana.Instruction,
) (*solana.Transaction, error) {
	latest, err := rpcClient.GetLatestBlockhash(ctx, upto.BlockhashCommitment)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch latest blockhash: %w", err)
	}

	builder := solana.NewTransactionBuilder().
		SetRecentBlockHash(latest.Value.Blockhash).
		SetFeePayer(feePayer)
	for _, instruction := range instructions {
		builder = builder.AddInstruction(instruction)
	}
	tx, err := builder.Build()
	if err != nil {
		return nil, fmt.Errorf("failed to build transaction: %w", err)
	}
	tx.Message.SetVersion(solana.MessageVersionV0)

	// Size the signature array to the header before signing: solana-go only
	// grows it to the signer's own index, which would leave a short array (and
	// a malformed wire transaction) when another required signer is absent.
	tx.Signatures = make([]solana.Signature, tx.Message.Header.NumRequiredSignatures)
	if err := signer.SignTransaction(ctx, tx, feePayer, network); err != nil {
		return nil, err
	}
	return tx, nil
}

// simulateInstructions simulates a facilitator-built instruction list without
// broadcasting. Signature verification is disabled because these transactions
// are never landed and the composite open simulation carries an unsigned payer.
func simulateInstructions(
	ctx context.Context,
	rpcClient *rpc.Client,
	signer svm.FacilitatorSvmSigner,
	feePayer solana.PublicKey,
	network string,
	instructions []solana.Instruction,
) error {
	tx, err := buildSignedTransaction(ctx, rpcClient, signer, feePayer, network, instructions)
	if err != nil {
		return err
	}

	result, err := rpcClient.SimulateTransactionWithOpts(ctx, tx, &rpc.SimulateTransactionOpts{
		SigVerify:              false,
		ReplaceRecentBlockhash: true,
		Commitment:             upto.StateCommitment,
	})
	if err != nil {
		return fmt.Errorf("settlement simulation failed: %w", err)
	}
	if result != nil && result.Value != nil && result.Value.Err != nil {
		return fmt.Errorf("settlement simulation failed: %v", result.Value.Err)
	}
	return nil
}

// submitInstructions signs, broadcasts, and confirms an instruction list.
func submitInstructions(
	ctx context.Context,
	rpcClient *rpc.Client,
	signer svm.FacilitatorSvmSigner,
	feePayer solana.PublicKey,
	network string,
	instructions []solana.Instruction,
) (string, error) {
	tx, err := buildSignedTransaction(ctx, rpcClient, signer, feePayer, network, instructions)
	if err != nil {
		return "", err
	}

	signature, err := signer.SendTransaction(ctx, tx, network)
	if err != nil {
		return "", err
	}
	if err := signer.ConfirmTransaction(ctx, signature, network); err != nil {
		return signature.String(), err
	}
	return signature.String(), nil
}
