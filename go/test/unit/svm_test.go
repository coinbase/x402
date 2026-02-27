// Package unit_test contains unit tests for the SVM mechanism
package unit_test

import (
	"encoding/binary"
	"testing"

	solana "github.com/gagliardetto/solana-go"

	x402 "github.com/coinbase/x402/go"
	svm "github.com/coinbase/x402/go/mechanisms/svm"
	svmserver "github.com/coinbase/x402/go/mechanisms/svm/exact/server"
)

// TestSolanaServerPriceParsing tests V2 server price parsing
func TestSolanaServerPriceParsing(t *testing.T) {
	server := svmserver.NewExactSvmScheme()
	network := x402.Network(svm.SolanaDevnetCAIP2)

	tests := []struct {
		name          string
		price         x402.Price
		expectedAsset string
		shouldError   bool
	}{
		{
			name:          "Simple decimal",
			price:         "0.10",
			expectedAsset: svm.USDCDevnetAddress,
			shouldError:   false,
		},
		{
			name:          "Dollar sign",
			price:         "$0.10",
			expectedAsset: svm.USDCDevnetAddress,
			shouldError:   false,
		},
		{
			name:          "With currency",
			price:         "0.10 USDC",
			expectedAsset: svm.USDCDevnetAddress,
			shouldError:   false,
		},
		{
			name:          "Float",
			price:         float64(0.10),
			expectedAsset: svm.USDCDevnetAddress,
			shouldError:   false,
		},
		{
			name:          "Integer",
			price:         1,
			expectedAsset: svm.USDCDevnetAddress,
			shouldError:   false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := server.ParsePrice(tt.price, network)
			if tt.shouldError && err == nil {
				t.Fatal("Expected error but got none")
			}
			if !tt.shouldError && err != nil {
				t.Fatalf("Unexpected error: %v", err)
			}
			if !tt.shouldError {
				if result.Asset != tt.expectedAsset {
					t.Errorf("Expected asset %s, got %s", tt.expectedAsset, result.Asset)
				}
				if result.Amount == "" {
					t.Error("Expected non-empty amount")
				}
			}
		})
	}
}

// TestSolanaUtilities tests utility functions
func TestSolanaUtilities(t *testing.T) {
	t.Run("NormalizeNetwork", func(t *testing.T) {
		tests := []struct {
			input    string
			expected string
			isError  bool
		}{
			{svm.SolanaMainnetV1, svm.SolanaMainnetCAIP2, false},
			{svm.SolanaDevnetV1, svm.SolanaDevnetCAIP2, false},
			{svm.SolanaTestnetV1, svm.SolanaTestnetCAIP2, false},
			{svm.SolanaMainnetCAIP2, svm.SolanaMainnetCAIP2, false},
			{"invalid", "", true},
		}

		for _, tt := range tests {
			result, err := svm.NormalizeNetwork(tt.input)
			if tt.isError && err == nil {
				t.Errorf("Expected error for input %s", tt.input)
			}
			if !tt.isError && err != nil {
				t.Errorf("Unexpected error for input %s: %v", tt.input, err)
			}
			if !tt.isError && result != tt.expected {
				t.Errorf("For input %s, expected %s, got %s", tt.input, tt.expected, result)
			}
		}
	})

	t.Run("ValidateSolanaAddress", func(t *testing.T) {
		validAddresses := []string{
			"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC mainnet
			"11111111111111111111111111111111",             // System program
			"4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU", // USDC devnet
		}

		invalidAddresses := []string{
			"",
			"invalid",
			"0x1234567890123456789012345678901234567890", // EVM address
			"123",
		}

		for _, addr := range validAddresses {
			if !svm.ValidateSolanaAddress(addr) {
				t.Errorf("Expected %s to be valid", addr)
			}
		}

		for _, addr := range invalidAddresses {
			if svm.ValidateSolanaAddress(addr) {
				t.Errorf("Expected %s to be invalid", addr)
			}
		}
	})

	t.Run("ParseAmount", func(t *testing.T) {
		tests := []struct {
			amount   string
			decimals int
			expected uint64
		}{
			{"1", 6, 1000000},
			{"0.1", 6, 100000},
			{"0.01", 6, 10000},
			{"1.5", 6, 1500000},
			{"100", 6, 100000000},
		}

		for _, tt := range tests {
			result, err := svm.ParseAmount(tt.amount, tt.decimals)
			if err != nil {
				t.Errorf("Unexpected error for %s: %v", tt.amount, err)
			}
			if result != tt.expected {
				t.Errorf("For %s with %d decimals, expected %d, got %d", tt.amount, tt.decimals, tt.expected, result)
			}
		}
	})

	t.Run("FormatAmount", func(t *testing.T) {
		tests := []struct {
			amount   uint64
			decimals int
			expected string
		}{
			{1000000, 6, "1"},
			{100000, 6, "0.1"},
			{10000, 6, "0.01"},
			{1500000, 6, "1.5"},
			{100000000, 6, "100"},
		}

		for _, tt := range tests {
			result := svm.FormatAmount(tt.amount, tt.decimals)
			if result != tt.expected {
				t.Errorf("For %d with %d decimals, expected %s, got %s", tt.amount, tt.decimals, tt.expected, result)
			}
		}
	})
}

// TestSolanaIsValidNetwork tests network validation
func TestSolanaIsValidNetwork(t *testing.T) {
	validNetworks := []string{
		svm.SolanaMainnetCAIP2,
		svm.SolanaDevnetCAIP2,
		svm.SolanaTestnetCAIP2,
		svm.SolanaMainnetV1,
		svm.SolanaDevnetV1,
		svm.SolanaTestnetV1,
	}

	invalidNetworks := []string{
		"ethereum",
		"base",
		"invalid:network",
		"",
	}

	for _, network := range validNetworks {
		if !svm.IsValidNetwork(network) {
			t.Errorf("Expected %s to be valid", network)
		}
	}

	for _, network := range invalidNetworks {
		if svm.IsValidNetwork(network) {
			t.Errorf("Expected %s to be invalid", network)
		}
	}
}

// TestSolanaGetNetworkConfig tests network config retrieval
func TestSolanaGetNetworkConfig(t *testing.T) {
	tests := []struct {
		input        string
		expectedCAIP string
		shouldError  bool
	}{
		{svm.SolanaMainnetV1, svm.SolanaMainnetCAIP2, false},
		{svm.SolanaMainnetCAIP2, svm.SolanaMainnetCAIP2, false},
		{svm.SolanaDevnetV1, svm.SolanaDevnetCAIP2, false},
		{"invalid", "", true},
	}

	for _, tt := range tests {
		config, err := svm.GetNetworkConfig(tt.input)
		if tt.shouldError && err == nil {
			t.Errorf("Expected error for %s", tt.input)
		}
		if !tt.shouldError && err != nil {
			t.Errorf("Unexpected error for %s: %v", tt.input, err)
		}
		if !tt.shouldError {
			if config.CAIP2 != tt.expectedCAIP {
				t.Errorf("Expected CAIP2 %s, got %s", tt.expectedCAIP, config.CAIP2)
			}
		}
	}
}

// TestSolanaMessageVersioning tests message version setting
func TestSolanaMessageVersioning(t *testing.T) {
	t.Run("SetVersionToV0", func(t *testing.T) {
		// Test that we can set the message version to V0
		// This is important for cross-platform compatibility with Python/TypeScript facilitators
		msg := solana.Message{
			Header: solana.MessageHeader{
				NumRequiredSignatures:       1,
				NumReadonlySignedAccounts:   0,
				NumReadonlyUnsignedAccounts: 0,
			},
			AccountKeys:     []solana.PublicKey{solana.MustPublicKeyFromBase58("11111111111111111111111111111111")},
			RecentBlockhash: solana.MustHashFromBase58("11111111111111111111111111111111"),
		}

		// Default should be legacy
		if msg.IsVersioned() {
			t.Error("New message should be legacy by default")
		}

		// Set to V0
		msg.SetVersion(solana.MessageVersionV0)

		// Should now be versioned
		if !msg.IsVersioned() {
			t.Error("Message should be versioned after SetVersion(V0)")
		}
	})

	t.Run("VersionedTransactionSerialization", func(t *testing.T) {
		// Create a message and set it to V0
		msg := solana.Message{
			Header: solana.MessageHeader{
				NumRequiredSignatures:       1,
				NumReadonlySignedAccounts:   0,
				NumReadonlyUnsignedAccounts: 0,
			},
			AccountKeys:     []solana.PublicKey{solana.MustPublicKeyFromBase58("11111111111111111111111111111111")},
			RecentBlockhash: solana.MustHashFromBase58("11111111111111111111111111111111"),
		}
		msg.SetVersion(solana.MessageVersionV0)

		// Serialize
		msgBytes, err := msg.MarshalBinary()
		if err != nil {
			t.Fatalf("Failed to marshal message: %v", err)
		}

		// First byte should be version marker (128 for v0)
		if msgBytes[0] != 128 {
			t.Errorf("Expected first byte to be 128 (v0 marker), got %d", msgBytes[0])
		}
	})
}

// ─── Swig wallet tests ────────────────────────────────────────────────────────

// buildSwigInstructionData constructs synthetic Swig signV2 instruction bytes
// containing a single compact instruction entry.
func buildSwigInstructionData(
	programIDIndex uint8,
	accounts []uint8,
	instrData []byte,
) []byte {
	// Compact instruction entry:
	//   [0]      programIDIndex U8
	//   [1]      numAccounts    U8
	//   [2..N+1] accounts       []U8
	//   [N+2..N+3] dataLen      U16 LE
	//   [N+4..]  data
	entry := []byte{programIDIndex, uint8(len(accounts))}
	entry = append(entry, accounts...)
	dl := make([]byte, 2)
	binary.LittleEndian.PutUint16(dl, uint16(len(instrData)))
	entry = append(entry, dl...)
	entry = append(entry, instrData...)

	// Outer Swig instruction:
	//   [0..1] discriminator         = 11 (signV2, U16 LE)
	//   [2..3] instructionPayloadLen = len(entry) (U16 LE)
	//   [4..7] roleId               = 0
	//   [8..]  entry
	outer := make([]byte, 8+len(entry))
	binary.LittleEndian.PutUint16(outer[0:], svm.SwigSignV2Discriminator)
	binary.LittleEndian.PutUint16(outer[2:], uint16(len(entry)))
	copy(outer[8:], entry)
	return outer
}

// buildTransferCheckedData constructs the 10-byte data payload for SPL TransferChecked.
// Layout: [0]=12 (discriminator), [1..8]=amount U64 LE, [9]=decimals
func buildTransferCheckedData(amount uint64, decimals uint8) []byte {
	data := make([]byte, 10)
	data[0] = 12 // transferChecked discriminator
	binary.LittleEndian.PutUint64(data[1:], amount)
	data[9] = decimals
	return data
}

// TestDecodeSwigCompactInstructions tests DecodeSwigCompactInstructions with crafted data.
func TestDecodeSwigCompactInstructions(t *testing.T) {
	t.Run("error on data shorter than 4 bytes", func(t *testing.T) {
		_, err := svm.DecodeSwigCompactInstructions([]byte{1, 2, 3})
		if err == nil {
			t.Fatal("expected error for data < 4 bytes")
		}
	})

	t.Run("error when instructionPayloadLen exceeds available data", func(t *testing.T) {
		// header claims payloadLen=100 but only 8 bytes total
		data := make([]byte, 8)
		binary.LittleEndian.PutUint16(data[2:], 100)
		_, err := svm.DecodeSwigCompactInstructions(data)
		if err == nil {
			t.Fatal("expected error for truncated payload")
		}
	})

	t.Run("decodes a single TransferChecked compact instruction", func(t *testing.T) {
		instrData := buildTransferCheckedData(100000, 6)
		// programIDIndex=5, accounts=[1,2,3,0]
		outer := buildSwigInstructionData(5, []uint8{1, 2, 3, 0}, instrData)

		result, err := svm.DecodeSwigCompactInstructions(outer)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(result) != 1 {
			t.Fatalf("expected 1 compact instruction, got %d", len(result))
		}
		ci := result[0]
		if ci.ProgramIDIndex != 5 {
			t.Errorf("expected ProgramIDIndex=5, got %d", ci.ProgramIDIndex)
		}
		if len(ci.Accounts) != 4 || ci.Accounts[0] != 1 || ci.Accounts[1] != 2 || ci.Accounts[2] != 3 || ci.Accounts[3] != 0 {
			t.Errorf("unexpected accounts: %v", ci.Accounts)
		}
		if len(ci.Data) < 9 {
			t.Fatalf("expected ≥9 data bytes, got %d", len(ci.Data))
		}
		if ci.Data[0] != 12 {
			t.Errorf("expected discriminator 12, got %d", ci.Data[0])
		}
		amount := binary.LittleEndian.Uint64(ci.Data[1:9])
		if amount != 100000 {
			t.Errorf("expected amount 100000, got %d", amount)
		}
	})

	t.Run("returns empty slice when payload is zero length", func(t *testing.T) {
		data := make([]byte, 8) // payloadLen=0 → no compact instructions
		result, err := svm.DecodeSwigCompactInstructions(data)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(result) != 0 {
			t.Errorf("expected 0 instructions, got %d", len(result))
		}
	})
}

// TestIsSwigTransaction tests the IsSwigTransaction helper.
func TestIsSwigTransaction(t *testing.T) {
	swigKey := solana.MustPublicKeyFromBase58(svm.SwigProgramAddress)
	secp256r1Key := solana.MustPublicKeyFromBase58(svm.Secp256r1PrecompileAddress)
	tokenKey := solana.TokenProgramID

	mkSignV2Data := func() []byte {
		data := make([]byte, 4)
		binary.LittleEndian.PutUint16(data, svm.SwigSignV2Discriminator)
		return data
	}

	t.Run("true for 2 compute budgets + SignV2", func(t *testing.T) {
		tx := &solana.Transaction{
			Message: solana.Message{
				AccountKeys: []solana.PublicKey{solana.ComputeBudget, swigKey},
				Instructions: []solana.CompiledInstruction{
					{ProgramIDIndex: 0, Data: []byte{2, 0, 0, 0, 0}},
					{ProgramIDIndex: 0, Data: []byte{3, 0, 0, 0, 0, 0, 0, 0, 0}},
					{ProgramIDIndex: 1, Data: mkSignV2Data()},
				},
			},
		}
		if !svm.IsSwigTransaction(tx) {
			t.Error("expected true")
		}
	})

	t.Run("true with secp256r1 precompile instructions", func(t *testing.T) {
		tx := &solana.Transaction{
			Message: solana.Message{
				AccountKeys: []solana.PublicKey{solana.ComputeBudget, secp256r1Key, swigKey},
				Instructions: []solana.CompiledInstruction{
					{ProgramIDIndex: 0, Data: []byte{2, 0, 0, 0, 0}},
					{ProgramIDIndex: 0, Data: []byte{3, 0, 0, 0, 0, 0, 0, 0, 0}},
					{ProgramIDIndex: 1, Data: []byte{}}, // secp256r1
					{ProgramIDIndex: 2, Data: mkSignV2Data()},
				},
			},
		}
		if !svm.IsSwigTransaction(tx) {
			t.Error("expected true")
		}
	})

	t.Run("false when last instruction is not Swig program", func(t *testing.T) {
		tx := &solana.Transaction{
			Message: solana.Message{
				AccountKeys: []solana.PublicKey{solana.ComputeBudget, tokenKey},
				Instructions: []solana.CompiledInstruction{
					{ProgramIDIndex: 0, Data: []byte{2, 0, 0, 0, 0}},
					{ProgramIDIndex: 0, Data: []byte{3, 0, 0, 0, 0, 0, 0, 0, 0}},
					{ProgramIDIndex: 1, Data: []byte{12, 0, 0, 0}}, // TOKEN_PROGRAM, not swig
				},
			},
		}
		if svm.IsSwigTransaction(tx) {
			t.Error("expected false")
		}
	})

	t.Run("false when a non-allowed instruction precedes the last", func(t *testing.T) {
		tx := &solana.Transaction{
			Message: solana.Message{
				AccountKeys: []solana.PublicKey{solana.ComputeBudget, tokenKey, swigKey},
				Instructions: []solana.CompiledInstruction{
					{ProgramIDIndex: 0, Data: []byte{2, 0, 0, 0, 0}},
					{ProgramIDIndex: 1, Data: []byte{12, 0, 0, 0}}, // token program — not allowed
					{ProgramIDIndex: 2, Data: mkSignV2Data()},
				},
			},
		}
		if svm.IsSwigTransaction(tx) {
			t.Error("expected false")
		}
	})

	t.Run("false for unknown discriminator", func(t *testing.T) {
		data := make([]byte, 4)
		binary.LittleEndian.PutUint16(data, 99) // unknown
		tx := &solana.Transaction{
			Message: solana.Message{
				AccountKeys: []solana.PublicKey{solana.ComputeBudget, swigKey},
				Instructions: []solana.CompiledInstruction{
					{ProgramIDIndex: 0, Data: []byte{2, 0, 0, 0, 0}},
					{ProgramIDIndex: 0, Data: []byte{3, 0, 0, 0, 0, 0, 0, 0, 0}},
					{ProgramIDIndex: 1, Data: data},
				},
			},
		}
		if svm.IsSwigTransaction(tx) {
			t.Error("expected false")
		}
	})

	t.Run("false for empty instructions", func(t *testing.T) {
		tx := &solana.Transaction{
			Message: solana.Message{
				AccountKeys:  []solana.PublicKey{},
				Instructions: []solana.CompiledInstruction{},
			},
		}
		if svm.IsSwigTransaction(tx) {
			t.Error("expected false")
		}
	})
}

// TestParseSwigTransaction tests the ParseSwigTransaction helper.
func TestParseSwigTransaction(t *testing.T) {
	swigPDA := solana.MustPublicKeyFromBase58(svm.SwigProgramAddress) // reuse as a PDA for test
	swigKey := solana.MustPublicKeyFromBase58(svm.SwigProgramAddress)
	secp256r1Key := solana.MustPublicKeyFromBase58(svm.Secp256r1PrecompileAddress)
	mintPubkey := solana.MustPublicKeyFromBase58(svm.USDCDevnetAddress)
	sourcePubkey := solana.MustPublicKeyFromBase58("11111111111111111111111111111112")
	destPubkey := solana.MustPublicKeyFromBase58("11111111111111111111111111111111")

	// Account keys: [0]=swigPDA, [1]=TOKEN_PROGRAM, [2]=source, [3]=mint, [4]=dest, [5]=swigProgram, [6]=computeBudget, [7]=secp256r1
	accountKeys := []solana.PublicKey{
		swigPDA,
		solana.TokenProgramID,
		sourcePubkey,
		mintPubkey,
		destPubkey,
		swigKey,
		solana.ComputeBudget,
		secp256r1Key,
	}

	t.Run("flattens Swig transaction with embedded TransferChecked", func(t *testing.T) {
		instrData := buildTransferCheckedData(100000, 6)
		// inner ix: programIDIndex=1 (TOKEN_PROGRAM), accounts=[2,3,4,0] (source, mint, dest, swigPDA)
		signV2Data := buildSwigInstructionData(1, []uint8{2, 3, 4, 0}, instrData)

		tx := &solana.Transaction{
			Message: solana.Message{
				AccountKeys: accountKeys,
				Instructions: []solana.CompiledInstruction{
					{ProgramIDIndex: 6, Data: []byte{2, 0, 0, 0, 0}},         // compute limit
					{ProgramIDIndex: 6, Data: []byte{3, 0, 0, 0, 0, 0, 0, 0, 0}}, // compute price
					{ProgramIDIndex: 5, Accounts: []uint16{0, 1, 2, 3, 4}, Data: signV2Data}, // SignV2
				},
			},
		}

		result, err := svm.ParseSwigTransaction(tx)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		// Should have 3 instructions: 2 compute budgets + 1 TransferChecked
		if len(result.Instructions) != 3 {
			t.Fatalf("expected 3 instructions, got %d", len(result.Instructions))
		}
		if result.SwigPDA != swigPDA.String() {
			t.Errorf("expected SwigPDA=%s, got %s", swigPDA.String(), result.SwigPDA)
		}

		// First two are compute budget (unchanged)
		if result.Instructions[0].ProgramIDIndex != 6 {
			t.Errorf("expected compute budget at index 0")
		}
		if result.Instructions[1].ProgramIDIndex != 6 {
			t.Errorf("expected compute budget at index 1")
		}

		// Third is the resolved TransferChecked
		transferIx := result.Instructions[2]
		if transferIx.ProgramIDIndex != 1 {
			t.Errorf("expected ProgramIDIndex=1 (TOKEN_PROGRAM), got %d", transferIx.ProgramIDIndex)
		}
		if len(transferIx.Accounts) != 4 {
			t.Fatalf("expected 4 accounts, got %d", len(transferIx.Accounts))
		}
		if transferIx.Accounts[0] != 2 || transferIx.Accounts[1] != 3 || transferIx.Accounts[2] != 4 || transferIx.Accounts[3] != 0 {
			t.Errorf("unexpected accounts: %v", transferIx.Accounts)
		}
		if transferIx.Data[0] != 12 {
			t.Errorf("expected transferChecked discriminator 12, got %d", transferIx.Data[0])
		}
	})

	t.Run("filters out secp256r1 precompile instructions", func(t *testing.T) {
		instrData := buildTransferCheckedData(100000, 6)
		signV2Data := buildSwigInstructionData(1, []uint8{2, 3, 4, 0}, instrData)

		tx := &solana.Transaction{
			Message: solana.Message{
				AccountKeys: accountKeys,
				Instructions: []solana.CompiledInstruction{
					{ProgramIDIndex: 6, Data: []byte{2, 0, 0, 0, 0}},             // compute limit
					{ProgramIDIndex: 6, Data: []byte{3, 0, 0, 0, 0, 0, 0, 0, 0}}, // compute price
					{ProgramIDIndex: 7, Data: []byte{}},                            // secp256r1 precompile
					{ProgramIDIndex: 5, Accounts: []uint16{0}, Data: signV2Data},   // SignV2
				},
			},
		}

		result, err := svm.ParseSwigTransaction(tx)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		// Should have 3 instructions: 2 compute budgets + 1 TransferChecked (precompile filtered)
		if len(result.Instructions) != 3 {
			t.Fatalf("expected 3 instructions, got %d", len(result.Instructions))
		}
	})

	t.Run("extracts SwigPDA from first account of SignV2", func(t *testing.T) {
		instrData := buildTransferCheckedData(100000, 6)
		signV2Data := buildSwigInstructionData(1, []uint8{2, 3, 4, 0}, instrData)

		tx := &solana.Transaction{
			Message: solana.Message{
				AccountKeys: accountKeys,
				Instructions: []solana.CompiledInstruction{
					{ProgramIDIndex: 6, Data: []byte{2, 0, 0, 0, 0}},
					{ProgramIDIndex: 6, Data: []byte{3, 0, 0, 0, 0, 0, 0, 0, 0}},
					{ProgramIDIndex: 5, Accounts: []uint16{0}, Data: signV2Data},
				},
			},
		}

		result, err := svm.ParseSwigTransaction(tx)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if result.SwigPDA != swigPDA.String() {
			t.Errorf("expected SwigPDA=%s, got %s", swigPDA.String(), result.SwigPDA)
		}
	})

	t.Run("error when SignV2 has no accounts", func(t *testing.T) {
		instrData := buildTransferCheckedData(100000, 6)
		signV2Data := buildSwigInstructionData(1, []uint8{2, 3, 4, 0}, instrData)

		tx := &solana.Transaction{
			Message: solana.Message{
				AccountKeys: accountKeys,
				Instructions: []solana.CompiledInstruction{
					{ProgramIDIndex: 6, Data: []byte{2, 0, 0, 0, 0}},
					{ProgramIDIndex: 6, Data: []byte{3, 0, 0, 0, 0, 0, 0, 0, 0}},
					{ProgramIDIndex: 5, Accounts: []uint16{}, Data: signV2Data}, // no accounts
				},
			},
		}

		_, err := svm.ParseSwigTransaction(tx)
		if err == nil {
			t.Fatal("expected error for SignV2 with no accounts")
		}
	})
}

// TestSolanaGetAssetInfo tests asset info retrieval
func TestSolanaGetAssetInfo(t *testing.T) {
	t.Run("By symbol", func(t *testing.T) {
		info, err := svm.GetAssetInfo(svm.SolanaDevnetCAIP2, "USDC")
		if err != nil {
			t.Fatalf("Unexpected error: %v", err)
		}
		if info.Address != svm.USDCDevnetAddress {
			t.Errorf("Expected address %s, got %s", svm.USDCDevnetAddress, info.Address)
		}
		if info.Decimals != 6 {
			t.Errorf("Expected decimals 6, got %d", info.Decimals)
		}
	})

	t.Run("By address", func(t *testing.T) {
		info, err := svm.GetAssetInfo(svm.SolanaDevnetCAIP2, svm.USDCDevnetAddress)
		if err != nil {
			t.Fatalf("Unexpected error: %v", err)
		}
		if info.Address != svm.USDCDevnetAddress {
			t.Errorf("Expected address %s, got %s", svm.USDCDevnetAddress, info.Address)
		}
	})

	t.Run("Default asset", func(t *testing.T) {
		info, err := svm.GetAssetInfo(svm.SolanaDevnetCAIP2, "unknown")
		if err != nil {
			t.Fatalf("Unexpected error: %v", err)
		}
		// Should return default asset
		if info.Address != svm.USDCDevnetAddress {
			t.Errorf("Expected default asset address %s, got %s", svm.USDCDevnetAddress, info.Address)
		}
	})
}
