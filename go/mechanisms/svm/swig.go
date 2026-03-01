package svm

import (
	"encoding/binary"
	"errors"
	"fmt"

	solana "github.com/gagliardetto/solana-go"
)

// SwigCompactInstruction is a decoded compact instruction embedded in a Swig
// signV1/signV2 instruction payload.  Indices reference the outer transaction's
// account key list.
type SwigCompactInstruction struct {
	ProgramIDIndex uint8
	Accounts       []uint8
	Data           []byte
}

// DecodeSwigCompactInstructions parses the compact instructions embedded in the
// data payload of a Swig signV1/signV2 instruction.
//
// Outer instruction data layout:
//
//	[0..1]  discriminator         U16 LE
//	[2..3]  instructionPayloadLen U16 LE
//	[4..7]  roleId                U32 LE
//	[8..]   compact instructions  (instructionPayloadLen bytes)
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
	offset := startOffset
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
//   - All instructions except the last are compute budget or secp256r1 precompile
//   - The last instruction is Swig program with SignV2 discriminator
func IsSwigTransaction(tx *solana.Transaction) bool {
	instructions := tx.Message.Instructions
	if len(instructions) == 0 {
		return false
	}

	secp256r1Pubkey := solana.MustPublicKeyFromBase58(Secp256r1PrecompileAddress)
	swigPubkey := solana.MustPublicKeyFromBase58(SwigProgramAddress)

	// All instructions except the last must be compute budget or secp256r1 precompile
	for i := 0; i < len(instructions)-1; i++ {
		if int(instructions[i].ProgramIDIndex) >= len(tx.Message.AccountKeys) {
			return false
		}
		progID := tx.Message.AccountKeys[instructions[i].ProgramIDIndex]
		if !progID.Equals(solana.ComputeBudget) && !progID.Equals(secp256r1Pubkey) {
			return false
		}
	}

	// Last instruction must be Swig program with SignV2 discriminator
	lastInst := instructions[len(instructions)-1]
	if int(lastInst.ProgramIDIndex) >= len(tx.Message.AccountKeys) {
		return false
	}
	progID := tx.Message.AccountKeys[lastInst.ProgramIDIndex]
	if !progID.Equals(swigPubkey) {
		return false
	}
	if len(lastInst.Data) < 2 {
		return false
	}
	discriminator := binary.LittleEndian.Uint16(lastInst.Data[0:2])
	return discriminator == SwigSignV2Discriminator
}

// ParseSwigResult holds the flattened instructions and the Swig PDA address.
type ParseSwigResult struct {
	Instructions []solana.CompiledInstruction
	SwigPDA      string
}

// ParseSwigTransaction flattens a Swig transaction into the same instruction
// layout as a regular one. It collects non-precompile outer instructions
// (compute budgets) and resolves the compact instructions embedded in the
// SignV2 instruction.
func ParseSwigTransaction(tx *solana.Transaction) (*ParseSwigResult, error) {
	instructions := tx.Message.Instructions
	if len(instructions) == 0 {
		return nil, errors.New("no instructions")
	}

	secp256r1Pubkey := solana.MustPublicKeyFromBase58(Secp256r1PrecompileAddress)

	// 1. Collect non-precompile outer instructions (compute budgets)
	var result []solana.CompiledInstruction
	for i := 0; i < len(instructions)-1; i++ {
		progID := tx.Message.AccountKeys[instructions[i].ProgramIDIndex]
		if !progID.Equals(secp256r1Pubkey) {
			result = append(result, instructions[i])
		}
	}

	// 2. Last instruction is SignV2
	signV2 := instructions[len(instructions)-1]

	// 3. Extract Swig PDA from SignV2's first account
	if len(signV2.Accounts) < 1 {
		return nil, errors.New("invalid_exact_svm_payload_no_transfer_instruction")
	}
	if int(signV2.Accounts[0]) >= len(tx.Message.AccountKeys) {
		return nil, errors.New("invalid_exact_svm_payload_no_transfer_instruction")
	}
	swigPDA := tx.Message.AccountKeys[signV2.Accounts[0]].String()

	// 4. Decode compact instructions from SignV2 data
	compactInstructions, err := DecodeSwigCompactInstructions(signV2.Data)
	if err != nil {
		return nil, err
	}

	// 5. Resolve compact instructions: widen uint8 → uint16 for CompiledInstruction
	for _, ci := range compactInstructions {
		accounts := make([]uint16, len(ci.Accounts))
		for j, a := range ci.Accounts {
			accounts[j] = uint16(a)
		}
		result = append(result, solana.CompiledInstruction{
			ProgramIDIndex: uint16(ci.ProgramIDIndex),
			Accounts:       accounts,
			Data:           ci.Data,
		})
	}

	return &ParseSwigResult{
		Instructions: result,
		SwigPDA:      swigPDA,
	}, nil
}
