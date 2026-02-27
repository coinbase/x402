package svm

import (
	"encoding/binary"
	"errors"
	"fmt"
	"strconv"

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

// IsSwigSignInstruction returns true when inst belongs to the Swig program AND
// its first two data bytes encode the signV1 (4) or signV2 (11) discriminator
// in U16 little-endian format.
func IsSwigSignInstruction(tx *solana.Transaction, inst solana.CompiledInstruction) bool {
	if int(inst.ProgramIDIndex) >= len(tx.Message.AccountKeys) {
		return false
	}
	progID := tx.Message.AccountKeys[inst.ProgramIDIndex]
	swigPubkey, err := solana.PublicKeyFromBase58(SwigProgramAddress)
	if err != nil {
		return false
	}
	if !progID.Equals(swigPubkey) {
		return false
	}
	if len(inst.Data) < 2 {
		return false
	}
	discriminator := binary.LittleEndian.Uint16(inst.Data[0:2])
	return discriminator == SwigSignV1Discriminator || discriminator == SwigSignV2Discriminator
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

// splTransferCheckedDiscriminator is the SPL Token / Token-2022 transferChecked discriminator.
const splTransferCheckedDiscriminator byte = 12

// VerifySwigTransfer verifies that the Swig signV1/signV2 instruction inst
// contains a valid SPL TransferChecked compact instruction that satisfies the
// payment requirements.  On success it returns the Swig PDA address (the
// effective payer).
//
// Security invariants checked (mirrors the regular wallet path):
//   - Swig PDA is not one of the facilitator's signer addresses
//   - Inner compact instruction uses the correct mint (asset)
//   - Inner destination ATA matches the expected ATA for payTo
//   - Inner transfer amount >= amount
func VerifySwigTransfer(
	tx *solana.Transaction,
	inst solana.CompiledInstruction,
	asset string,
	payTo string,
	amount string,
	signerAddresses []string,
) (string, error) {
	// Swig PDA is accounts[0] of the outer instruction
	if len(inst.Accounts) < 1 {
		return "", errors.New("invalid_exact_svm_payload_no_transfer_instruction")
	}
	if int(inst.Accounts[0]) >= len(tx.Message.AccountKeys) {
		return "", errors.New("invalid_exact_svm_payload_no_transfer_instruction")
	}
	swigPDA := tx.Message.AccountKeys[inst.Accounts[0]].String()

	// SECURITY: Swig PDA must not be a facilitator signer address
	for _, signerAddr := range signerAddresses {
		if swigPDA == signerAddr {
			return "", errors.New("invalid_exact_svm_payload_transaction_fee_payer_transferring_funds")
		}
	}

	// Decode embedded compact instructions
	compactInstructions, err := DecodeSwigCompactInstructions(inst.Data)
	if err != nil || len(compactInstructions) == 0 {
		return "", errors.New("invalid_exact_svm_payload_no_transfer_instruction")
	}

	// Find the SPL TransferChecked compact instruction
	var transferIx *SwigCompactInstruction
	for i := range compactInstructions {
		ci := &compactInstructions[i]
		if int(ci.ProgramIDIndex) >= len(tx.Message.AccountKeys) {
			continue
		}
		progID := tx.Message.AccountKeys[ci.ProgramIDIndex]
		if (progID == solana.TokenProgramID || progID == solana.Token2022ProgramID) &&
			len(ci.Data) >= 1 && ci.Data[0] == splTransferCheckedDiscriminator {
			transferIx = ci
			break
		}
	}

	if transferIx == nil {
		return "", errors.New("invalid_exact_svm_payload_no_transfer_instruction")
	}

	// TransferChecked accounts: [source, mint, destination, authority]
	if len(transferIx.Accounts) < 3 {
		return "", errors.New("invalid_exact_svm_payload_no_transfer_instruction")
	}

	// Verify mint address — accounts[1]
	if int(transferIx.Accounts[1]) >= len(tx.Message.AccountKeys) {
		return "", errors.New("invalid_exact_svm_payload_mint_mismatch")
	}
	mintAddr := tx.Message.AccountKeys[transferIx.Accounts[1]].String()
	if mintAddr != asset {
		return "", errors.New("invalid_exact_svm_payload_mint_mismatch")
	}

	// Verify destination ATA — accounts[2]
	if int(transferIx.Accounts[2]) >= len(tx.Message.AccountKeys) {
		return "", errors.New("invalid_exact_svm_payload_recipient_mismatch")
	}
	destATA := tx.Message.AccountKeys[transferIx.Accounts[2]]

	payToPubkey, err := solana.PublicKeyFromBase58(payTo)
	if err != nil {
		return "", errors.New("invalid_exact_svm_payload_recipient_mismatch")
	}

	mintPubkey, err := solana.PublicKeyFromBase58(asset)
	if err != nil {
		return "", errors.New("invalid_exact_svm_payload_mint_mismatch")
	}

	expectedDestATA, _, err := solana.FindAssociatedTokenAddress(payToPubkey, mintPubkey)
	if err != nil {
		return "", errors.New("invalid_exact_svm_payload_recipient_mismatch")
	}

	if destATA.String() != expectedDestATA.String() {
		return "", errors.New("invalid_exact_svm_payload_recipient_mismatch")
	}

	// Verify amount — bytes 1-8 of compact instruction data (U64 LE)
	// transferChecked data layout: [0]=discriminator, [1..8]=amount, [9]=decimals
	if len(transferIx.Data) < 9 {
		return "", errors.New("invalid_exact_svm_payload_no_transfer_instruction")
	}
	txAmount := binary.LittleEndian.Uint64(transferIx.Data[1:9])

	requiredAmount, err := strconv.ParseUint(amount, 10, 64)
	if err != nil {
		return "", errors.New("invalid_exact_svm_payload_amount_insufficient")
	}

	if txAmount < requiredAmount {
		return "", errors.New("invalid_exact_svm_payload_amount_insufficient")
	}

	return swigPDA, nil
}
