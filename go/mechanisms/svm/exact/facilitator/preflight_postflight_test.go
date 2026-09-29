package facilitator

import (
	"context"
	"errors"
	"testing"

	solana "github.com/gagliardetto/solana-go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	x402 "github.com/x402-foundation/x402/go/v2"
)

// setupInstruction/finishInstruction stand in for arbitrary operator-configured
// preflight/postflight instructions in the tests below. accounts, if provided,
// are attached as readonly non-signer account metas (used to simulate the fee
// payer appearing in a matched tuple's accounts).
func setupInstruction(programID solana.PublicKey, discriminator []byte, accounts ...solana.PublicKey) solana.Instruction {
	metas := make(solana.AccountMetaSlice, 0, len(accounts))
	for _, acc := range accounts {
		metas = append(metas, solana.NewAccountMeta(acc, false, false))
	}
	return solana.NewInstruction(programID, metas, discriminator)
}

func TestExactSvmScheme_Path1RejectsUnmatchedLeadingInstructionNoAllowlist(t *testing.T) {
	setupProgram := solana.NewWallet().PublicKey()
	f := buildExactFixtureWithInstructions(t,
		[]solana.Instruction{setupInstruction(setupProgram, []byte{0xaa})}, nil)

	signer := &mockExactSvmSigner{addresses: []solana.PublicKey{f.facilitatorAddr}}
	scheme := NewExactSvmScheme(signer)
	_, err := scheme.Verify(context.Background(), f.payload, f.requirements, nil)
	var ve *x402.VerifyError
	require.Error(t, err)
	require.True(t, errors.As(err, &ve))
	assert.Equal(t, ErrUnknownInstruction, ve.InvalidReason)
}

func TestExactSvmScheme_Path1AcceptsPreflightTupleMatch(t *testing.T) {
	setupProgram := solana.NewWallet().PublicKey()
	f := buildExactFixtureWithInstructions(t,
		[]solana.Instruction{setupInstruction(setupProgram, []byte{0xaa})}, nil)

	signer := &mockExactSvmSigner{addresses: []solana.PublicKey{f.facilitatorAddr}}
	scheme := NewExactSvmScheme(signer, &Config{
		PreflightInstructionAllowlist: []InstructionTuple{
			{{ProgramID: setupProgram, Discriminator: []byte{0xaa}}},
		},
	})
	resp, err := scheme.Verify(context.Background(), f.payload, f.requirements, nil)
	require.NoError(t, err)
	assert.True(t, resp.IsValid)
}

func TestExactSvmScheme_Path1AcceptsPostflightTupleMatch(t *testing.T) {
	finishProgram := solana.NewWallet().PublicKey()
	f := buildExactFixtureWithInstructions(t,
		nil, []solana.Instruction{setupInstruction(finishProgram, []byte{0xbb})})

	signer := &mockExactSvmSigner{addresses: []solana.PublicKey{f.facilitatorAddr}}
	scheme := NewExactSvmScheme(signer, &Config{
		PostflightInstructionAllowlist: []InstructionTuple{
			{{ProgramID: finishProgram, Discriminator: []byte{0xbb}}},
		},
	})
	resp, err := scheme.Verify(context.Background(), f.payload, f.requirements, nil)
	require.NoError(t, err)
	assert.True(t, resp.IsValid)
}

func TestExactSvmScheme_Path1RejectsNonMatchingPreflightTuple(t *testing.T) {
	setupProgram := solana.NewWallet().PublicKey()
	f := buildExactFixtureWithInstructions(t,
		[]solana.Instruction{setupInstruction(setupProgram, []byte{0xff})}, nil)

	signer := &mockExactSvmSigner{addresses: []solana.PublicKey{f.facilitatorAddr}}
	scheme := NewExactSvmScheme(signer, &Config{
		PreflightInstructionAllowlist: []InstructionTuple{
			{{ProgramID: setupProgram, Discriminator: []byte{0xaa}}},
		},
	})
	_, err := scheme.Verify(context.Background(), f.payload, f.requirements, nil)
	var ve *x402.VerifyError
	require.Error(t, err)
	require.True(t, errors.As(err, &ve))
	assert.Equal(t, ErrUnknownInstruction, ve.InvalidReason)
}

func TestExactSvmScheme_Path1RejectsNonMatchingPostflightTuple(t *testing.T) {
	finishProgram := solana.NewWallet().PublicKey()
	f := buildExactFixtureWithInstructions(t,
		nil, []solana.Instruction{setupInstruction(finishProgram, []byte{0xff})})

	signer := &mockExactSvmSigner{addresses: []solana.PublicKey{f.facilitatorAddr}}
	scheme := NewExactSvmScheme(signer, &Config{
		PostflightInstructionAllowlist: []InstructionTuple{
			{{ProgramID: finishProgram, Discriminator: []byte{0xbb}}},
		},
	})
	_, err := scheme.Verify(context.Background(), f.payload, f.requirements, nil)
	var ve *x402.VerifyError
	require.Error(t, err)
	require.True(t, errors.As(err, &ve))
	assert.Equal(t, ErrUnknownInstruction, ve.InvalidReason)
}

func TestExactSvmScheme_Path1AcceptsPreflightTupleWithInterspersedGuard(t *testing.T) {
	setupProgram := solana.NewWallet().PublicKey()
	finishProgram := solana.NewWallet().PublicKey()
	f := buildExactFixtureWithInstructions(t,
		[]solana.Instruction{
			setupInstruction(setupProgram, []byte{0xaa}),
			lighthouseInstruction(),
			setupInstruction(finishProgram, []byte{0xbb}),
		}, nil)

	signer := &mockExactSvmSigner{addresses: []solana.PublicKey{f.facilitatorAddr}}
	scheme := NewExactSvmScheme(signer, &Config{
		PreflightInstructionAllowlist: []InstructionTuple{
			{
				{ProgramID: setupProgram, Discriminator: []byte{0xaa}},
				{ProgramID: finishProgram, Discriminator: []byte{0xbb}},
			},
		},
	})
	resp, err := scheme.Verify(context.Background(), f.payload, f.requirements, nil)
	require.NoError(t, err)
	assert.True(t, resp.IsValid)
}

func TestExactSvmScheme_Path1RejectsFeePayerNotIsolatedInPreflightTuple(t *testing.T) {
	setupProgram := solana.NewWallet().PublicKey()

	f := buildExactFixtureWithInstructionsFn(t,
		func(facilitatorAddr solana.PublicKey) []solana.Instruction {
			return []solana.Instruction{setupInstruction(setupProgram, []byte{0xaa}, facilitatorAddr)}
		},
		func(solana.PublicKey) []solana.Instruction { return nil },
	)

	signer := &mockExactSvmSigner{addresses: []solana.PublicKey{f.facilitatorAddr}}
	scheme := NewExactSvmScheme(signer, &Config{
		PreflightInstructionAllowlist: []InstructionTuple{
			{{ProgramID: setupProgram, Discriminator: []byte{0xaa}}},
		},
	})
	_, err := scheme.Verify(context.Background(), f.payload, f.requirements, nil)
	var ve *x402.VerifyError
	require.Error(t, err)
	require.True(t, errors.As(err, &ve))
	assert.Equal(t, ErrPreflightPostflightFeePayerNotIsolated, ve.InvalidReason)
}

func TestExactSvmScheme_Path1RejectsFeePayerNotIsolatedInPostflightTuple(t *testing.T) {
	finishProgram := solana.NewWallet().PublicKey()

	f := buildExactFixtureWithInstructionsFn(t,
		func(solana.PublicKey) []solana.Instruction { return nil },
		func(facilitatorAddr solana.PublicKey) []solana.Instruction {
			return []solana.Instruction{setupInstruction(finishProgram, []byte{0xbb}, facilitatorAddr)}
		},
	)

	signer := &mockExactSvmSigner{addresses: []solana.PublicKey{f.facilitatorAddr}}
	scheme := NewExactSvmScheme(signer, &Config{
		PostflightInstructionAllowlist: []InstructionTuple{
			{{ProgramID: finishProgram, Discriminator: []byte{0xbb}}},
		},
	})
	_, err := scheme.Verify(context.Background(), f.payload, f.requirements, nil)
	var ve *x402.VerifyError
	require.Error(t, err)
	require.True(t, errors.As(err, &ve))
	assert.Equal(t, ErrPreflightPostflightFeePayerNotIsolated, ve.InvalidReason)
}

func TestExactSvmScheme_Path1AcceptsTupleWithLongDiscriminator(t *testing.T) {
	setupProgram := solana.NewWallet().PublicKey()
	finishProgram := solana.NewWallet().PublicKey()
	longDiscriminator := []byte{0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08}

	f := buildExactFixtureWithInstructions(t,
		[]solana.Instruction{setupInstruction(setupProgram, longDiscriminator)},
		[]solana.Instruction{setupInstruction(finishProgram, []byte{0xbb})})

	signer := &mockExactSvmSigner{addresses: []solana.PublicKey{f.facilitatorAddr}}
	scheme := NewExactSvmScheme(signer, &Config{
		PreflightInstructionAllowlist: []InstructionTuple{
			{{ProgramID: setupProgram, Discriminator: longDiscriminator}},
		},
		PostflightInstructionAllowlist: []InstructionTuple{
			{{ProgramID: finishProgram, Discriminator: []byte{0xbb}}},
		},
	})
	resp, err := scheme.Verify(context.Background(), f.payload, f.requirements, nil)
	require.NoError(t, err)
	assert.True(t, resp.IsValid)
}
