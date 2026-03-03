package svm

import (
	"encoding/binary"
	"errors"
	"fmt"

	solana "github.com/gagliardetto/solana-go"
)

// SwigNormalizer detects and flattens Swig smart-wallet transactions into the
// same NormalizedTransaction shape used by regular transactions.
type SwigNormalizer struct{}

func (s *SwigNormalizer) CanHandle(tx *solana.Transaction) bool {
	return IsSwigTransaction(tx)
}

func (s *SwigNormalizer) Normalize(tx *solana.Transaction) (*NormalizedTransaction, error) {
	result, err := ParseSwigTransaction(tx)
	if err != nil {
		return nil, err
	}
	return &NormalizedTransaction{
		Instructions: result.Instructions,
		Payer:        result.SwigPDA,
	}, nil
}

// SwigCompactInstruction is a decoded compact instruction embedded in a Swig
// SignV2 instruction payload.  Indices reference the SignV2 instruction's
// own account list, not the outer transaction's global account keys.
type SwigCompactInstruction struct {
	ProgramIDIndex uint8
	Accounts       []uint8
	Data           []byte
}

// DecodeSwigCompactInstructions parses the compact instructions embedded in the
// data payload of a Swig SignV2 instruction.
//
// Outer instruction data layout:
//
//	[0..1]  discriminator         U16 LE
//	[2..3]  instructionPayloadLen U16 LE
//	[4..7]  roleId                U32 LE
//	[8..]   compact instructions  (instructionPayloadLen bytes)
//
// Compact instructions payload:
//
//	[0]         numInstructions U8
//	[1..]       compact instruction entries...
//
// Each CompactInstruction:
//
//	[0]         programIDIndex U8
//	[1]         numAccounts    U8
//	[2..N+1]    accounts       []U8
//	[N+2..N+3]  dataLen        U16 LE
//	[N+4..]     data           raw bytes
func DecodeSwigCompactInstructions(data []byte) ([]SwigCompactInstruction, error) {
	if len(data) < 4 {
		return nil, fmt.Errorf("swig instruction data too short: need ≥4 bytes, got %d", len(data))
	}

	instructionPayloadLen := int(binary.LittleEndian.Uint16(data[2:4]))
	startOffset := 8
	if len(data) < startOffset+instructionPayloadLen {
		return nil, fmt.Errorf("swig instruction data truncated: payload needs %d bytes but only %d available after offset %d",
			instructionPayloadLen, len(data)-startOffset, startOffset)
	}

	var results []SwigCompactInstruction
	offset := startOffset + 1 // skip numInstructions count byte
	endOffset := startOffset + instructionPayloadLen

	for offset < endOffset {
		if offset >= len(data) {
			break
		}

		// programIDIndex: U8
		programIDIndex := data[offset]
		offset++

		// numAccounts: U8
		if offset >= endOffset {
			break
		}
		numAccounts := int(data[offset])
		offset++

		// accounts: []U8
		if offset+numAccounts > endOffset {
			break
		}
		accounts := make([]uint8, numAccounts)
		copy(accounts, data[offset:offset+numAccounts])
		offset += numAccounts

		// dataLen: U16 LE
		if offset+2 > endOffset {
			break
		}
		dataLen := int(binary.LittleEndian.Uint16(data[offset : offset+2]))
		offset += 2

		// instruction data
		if offset+dataLen > endOffset {
			break
		}
		instrData := make([]byte, dataLen)
		copy(instrData, data[offset:offset+dataLen])
		offset += dataLen

		results = append(results, SwigCompactInstruction{
			ProgramIDIndex: programIDIndex,
			Accounts:       accounts,
			Data:           instrData,
		})
	}

	return results, nil
}

// IsSwigTransaction returns true when the transaction has a Swig layout:
//   - Every instruction is one of: compute budget, secp256r1 precompile, or Swig SignV2
//   - At least one Swig SignV2 instruction is present
func IsSwigTransaction(tx *solana.Transaction) bool {
	instructions := tx.Message.Instructions
	if len(instructions) == 0 {
		return false
	}

	secp256r1Pubkey := solana.MustPublicKeyFromBase58(Secp256r1PrecompileAddress)
	swigPubkey := solana.MustPublicKeyFromBase58(SwigProgramAddress)

	hasSignV2 := false
	for _, inst := range instructions {
		if int(inst.ProgramIDIndex) >= len(tx.Message.AccountKeys) {
			return false
		}
		progID := tx.Message.AccountKeys[inst.ProgramIDIndex]
		if progID.Equals(solana.ComputeBudget) || progID.Equals(secp256r1Pubkey) {
			continue
		}
		if progID.Equals(swigPubkey) {
			if len(inst.Data) < 2 {
				return false
			}
			discriminator := binary.LittleEndian.Uint16(inst.Data[0:2])
			if discriminator != SwigSignV2Discriminator {
				return false
			}
			hasSignV2 = true
			continue
		}
		return false // unrecognized instruction
	}
	return hasSignV2
}

// ParseSwigResult holds the flattened instructions and the Swig PDA address.
type ParseSwigResult struct {
	Instructions []solana.CompiledInstruction
	SwigPDA      string
}

// ParseSwigTransaction flattens a Swig transaction into the same instruction
// layout as a regular one. It collects non-precompile, non-SignV2 outer
// instructions (compute budgets) and resolves the compact instructions embedded
// in each SignV2 instruction.
//
// A transaction may contain multiple SignV2 instructions. All must reference
// the same Swig PDA (accounts[0]).
func ParseSwigTransaction(tx *solana.Transaction) (*ParseSwigResult, error) {
	instructions := tx.Message.Instructions
	if len(instructions) == 0 {
		return nil, errors.New("no instructions")
	}

	secp256r1Pubkey := solana.MustPublicKeyFromBase58(Secp256r1PrecompileAddress)
	swigPubkey := solana.MustPublicKeyFromBase58(SwigProgramAddress)

	// 1. Single pass: separate SignV2 instructions from the rest
	var result []solana.CompiledInstruction
	var signV2Instructions []solana.CompiledInstruction
	for _, inst := range instructions {
		progID := tx.Message.AccountKeys[inst.ProgramIDIndex]
		if progID.Equals(secp256r1Pubkey) {
			continue // skip precompile
		}
		if progID.Equals(swigPubkey) {
			signV2Instructions = append(signV2Instructions, inst)
		} else {
			result = append(result, inst) // compute budget and other non-precompile instructions
		}
	}

	if len(signV2Instructions) == 0 {
		return nil, errors.New("invalid_exact_svm_payload_no_transfer_instruction")
	}

	// 2. Process each SignV2 instruction
	swigPDA := ""
	for _, signV2 := range signV2Instructions {
		// Extract Swig PDA from SignV2's first account
		if len(signV2.Accounts) < 2 {
			return nil, errors.New("invalid_exact_svm_payload_no_transfer_instruction")
		}
		if int(signV2.Accounts[0]) >= len(tx.Message.AccountKeys) {
			return nil, errors.New("invalid_exact_svm_payload_no_transfer_instruction")
		}
		swigConfigKey := tx.Message.AccountKeys[signV2.Accounts[0]]
		pda := swigConfigKey.String()

		// Enforce all SignV2 instructions share the same PDA
		if swigPDA == "" {
			swigPDA = pda
		} else if pda != swigPDA {
			return nil, errors.New("swig_pda_mismatch: all SignV2 instructions must reference the same Swig PDA")
		}

		// Validate Swig wallet address derivation (cross-check accounts[0] and accounts[1])
		if int(signV2.Accounts[1]) >= len(tx.Message.AccountKeys) {
			return nil, errors.New("invalid_swig_wallet_address_derivation")
		}
		actualWalletAddress := tx.Message.AccountKeys[signV2.Accounts[1]]
		expectedWalletAddress, _, err := solana.FindProgramAddress(
			[][]byte{[]byte("swig-wallet-address"), swigConfigKey.Bytes()},
			swigPubkey,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to derive swig wallet address: %w", err)
		}
		if !actualWalletAddress.Equals(expectedWalletAddress) {
			return nil, errors.New("invalid_swig_wallet_address_derivation")
		}

		// Decode compact instructions from SignV2 data
		compactInstructions, err := DecodeSwigCompactInstructions(signV2.Data)
		if err != nil {
			return nil, err
		}

		// Resolve compact instructions: remap local indices through signV2.Accounts
		for _, ci := range compactInstructions {
			if int(ci.ProgramIDIndex) >= len(signV2.Accounts) {
				return nil, fmt.Errorf("compact instruction programIDIndex %d out of range (signV2 has %d accounts)",
					ci.ProgramIDIndex, len(signV2.Accounts))
			}
			accounts := make([]uint16, len(ci.Accounts))
			for j, a := range ci.Accounts {
				if int(a) >= len(signV2.Accounts) {
					return nil, fmt.Errorf("compact instruction account index %d out of range (signV2 has %d accounts)",
						a, len(signV2.Accounts))
				}
				accounts[j] = signV2.Accounts[a]
			}
			result = append(result, solana.CompiledInstruction{
				ProgramIDIndex: signV2.Accounts[ci.ProgramIDIndex],
				Accounts:       accounts,
				Data:           ci.Data,
			})
		}
	}

	return &ParseSwigResult{
		Instructions: result,
		SwigPDA:      swigPDA,
	}, nil
}
