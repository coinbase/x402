package client

import (
	"math/big"
	"strings"
	"testing"
)

func TestBuildERC20TransferCallData(t *testing.T) {
	t.Run("correct function selector", func(t *testing.T) {
		to := "0x000000000000000000000000000000000000dEaD"
		amount := big.NewInt(1000000)

		calldata, err := BuildERC20TransferCallData(to, amount)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		// transfer(address,uint256) selector is 0xa9059cbb
		if !strings.HasPrefix(calldata, "0xa9059cbb") {
			t.Errorf("calldata should start with 0xa9059cbb, got prefix: %s", calldata[:10])
		}
	})

	t.Run("0x prefix", func(t *testing.T) {
		to := "0x000000000000000000000000000000000000dEaD"
		amount := big.NewInt(100)

		calldata, err := BuildERC20TransferCallData(to, amount)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if !strings.HasPrefix(calldata, "0x") {
			t.Errorf("calldata should start with 0x, got: %s", calldata[:4])
		}
	})

	t.Run("correct ABI encoding length", func(t *testing.T) {
		to := "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
		amount := big.NewInt(1000000)

		calldata, err := BuildERC20TransferCallData(to, amount)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		// 0x prefix (2 chars) + selector (8 chars) + address (64 chars) + uint256 (64 chars) = 138
		// Each byte is 2 hex chars: 4 bytes selector + 32 bytes address + 32 bytes uint256 = 68 bytes = 136 hex + 2 for "0x" = 138
		expectedLen := 2 + 8 + 64 + 64
		if len(calldata) != expectedLen {
			t.Errorf("calldata length = %d, want %d", len(calldata), expectedLen)
		}
	})

	t.Run("zero amount", func(t *testing.T) {
		to := "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
		amount := big.NewInt(0)

		calldata, err := BuildERC20TransferCallData(to, amount)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if !strings.HasPrefix(calldata, "0xa9059cbb") {
			t.Errorf("calldata should start with 0xa9059cbb, got: %s", calldata[:10])
		}

		// The last 64 chars should be all zeros for a zero amount
		amountHex := calldata[len(calldata)-64:]
		expected := strings.Repeat("0", 64)
		if amountHex != expected {
			t.Errorf("amount encoding = %s, want all zeros", amountHex)
		}
	})

	t.Run("large amount", func(t *testing.T) {
		to := "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
		// A very large amount: 10^30
		amount := new(big.Int).Exp(big.NewInt(10), big.NewInt(30), nil)

		calldata, err := BuildERC20TransferCallData(to, amount)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if !strings.HasPrefix(calldata, "0xa9059cbb") {
			t.Errorf("calldata should start with 0xa9059cbb, got: %s", calldata[:10])
		}

		// Should still produce valid length calldata
		expectedLen := 2 + 8 + 64 + 64
		if len(calldata) != expectedLen {
			t.Errorf("calldata length = %d, want %d", len(calldata), expectedLen)
		}
	})

	t.Run("deterministic output", func(t *testing.T) {
		to := "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
		amount := big.NewInt(1000000)

		calldata1, err := BuildERC20TransferCallData(to, amount)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		calldata2, err := BuildERC20TransferCallData(to, amount)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if calldata1 != calldata2 {
			t.Errorf("expected deterministic output, got:\n  %s\n  %s", calldata1, calldata2)
		}
	})

	t.Run("different addresses produce different calldata", func(t *testing.T) {
		amount := big.NewInt(1000000)

		calldata1, err := BuildERC20TransferCallData("0x036CbD53842c5426634e7929541eC2318f3dCF7e", amount)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		calldata2, err := BuildERC20TransferCallData("0x000000000000000000000000000000000000dEaD", amount)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if calldata1 == calldata2 {
			t.Error("expected different calldata for different addresses")
		}
	})

	t.Run("different amounts produce different calldata", func(t *testing.T) {
		to := "0x036CbD53842c5426634e7929541eC2318f3dCF7e"

		calldata1, err := BuildERC20TransferCallData(to, big.NewInt(1000000))
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		calldata2, err := BuildERC20TransferCallData(to, big.NewInt(2000000))
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if calldata1 == calldata2 {
			t.Error("expected different calldata for different amounts")
		}
	})
}
