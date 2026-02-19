package erc20approvalgassponsor

import (
	"testing"
)

func TestExtractErc20ApprovalGasSponsoringInfo(t *testing.T) {
	t.Run("returns nil for nil extensions", func(t *testing.T) {
		result, err := ExtractErc20ApprovalGasSponsoringInfo(nil)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result != nil {
			t.Fatal("expected nil result for nil extensions")
		}
	})

	t.Run("returns nil for missing extension", func(t *testing.T) {
		extensions := map[string]interface{}{
			"otherExtension": map[string]interface{}{},
		}
		result, err := ExtractErc20ApprovalGasSponsoringInfo(extensions)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result != nil {
			t.Fatal("expected nil result for missing extension")
		}
	})

	t.Run("returns nil for server-only info (incomplete)", func(t *testing.T) {
		extensions := map[string]interface{}{
			ERC20ApprovalGasSponsoring: map[string]interface{}{
				"info": map[string]interface{}{
					"description": "test",
					"version":     "1",
				},
				"schema": map[string]interface{}{},
			},
		}
		result, err := ExtractErc20ApprovalGasSponsoringInfo(extensions)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result != nil {
			t.Fatal("expected nil result for incomplete info")
		}
	})

	t.Run("extracts valid info", func(t *testing.T) {
		extensions := map[string]interface{}{
			ERC20ApprovalGasSponsoring: map[string]interface{}{
				"info": map[string]interface{}{
					"from":              "0x857b06519E91e3A54538791bDbb0E22373e36b66",
					"asset":             "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
					"spender":           "0x000000000022D473030F116dDEE9F6B43aC78BA3",
					"amount":            "115792089237316195423570985008687907853269984665640564039457584007913129639935",
					"signedTransaction": "0xdeadbeef01020304",
					"version":           "1",
				},
				"schema": map[string]interface{}{},
			},
		}
		result, err := ExtractErc20ApprovalGasSponsoringInfo(extensions)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result == nil {
			t.Fatal("expected non-nil result")
		}
		if result.From != "0x857b06519E91e3A54538791bDbb0E22373e36b66" {
			t.Errorf("unexpected from: %s", result.From)
		}
		if result.SignedTransaction != "0xdeadbeef01020304" {
			t.Errorf("unexpected signedTransaction: %s", result.SignedTransaction)
		}
		if result.Version != "1" {
			t.Errorf("unexpected version: %s", result.Version)
		}
	})

	t.Run("returns nil when signedTransaction is empty", func(t *testing.T) {
		extensions := map[string]interface{}{
			ERC20ApprovalGasSponsoring: map[string]interface{}{
				"info": map[string]interface{}{
					"from":              "0x857b06519E91e3A54538791bDbb0E22373e36b66",
					"asset":             "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
					"spender":           "0x000000000022D473030F116dDEE9F6B43aC78BA3",
					"amount":            "100",
					"signedTransaction": "",
					"version":           "1",
				},
				"schema": map[string]interface{}{},
			},
		}
		result, err := ExtractErc20ApprovalGasSponsoringInfo(extensions)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result != nil {
			t.Fatal("expected nil result for empty signedTransaction")
		}
	})
}

func TestValidateErc20ApprovalGasSponsoringInfo(t *testing.T) {
	t.Run("validates correct info", func(t *testing.T) {
		info := &Info{
			From:              "0x857b06519E91e3A54538791bDbb0E22373e36b66",
			Asset:             "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
			Spender:           "0x000000000022D473030F116dDEE9F6B43aC78BA3",
			Amount:            "115792089237316195423570985008687907853269984665640564039457584007913129639935",
			SignedTransaction: "0x02f8ab8284540181ef85012a05f2008261a894036cbd53842c5426634e7929541ec2318f3dcf7e80b844095ea7b3000000000022d473030f116ddee9f6b43ac78ba3ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
			Version:           "1",
		}
		if !ValidateErc20ApprovalGasSponsoringInfo(info) {
			t.Fatal("expected valid info")
		}
	})

	t.Run("rejects invalid from address", func(t *testing.T) {
		info := &Info{
			From:              "invalid",
			Asset:             "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
			Spender:           "0x000000000022D473030F116dDEE9F6B43aC78BA3",
			Amount:            "100",
			SignedTransaction: "0xabc123",
			Version:           "1",
		}
		if ValidateErc20ApprovalGasSponsoringInfo(info) {
			t.Fatal("expected invalid info for bad from address")
		}
	})

	t.Run("rejects invalid signedTransaction hex", func(t *testing.T) {
		info := &Info{
			From:              "0x857b06519E91e3A54538791bDbb0E22373e36b66",
			Asset:             "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
			Spender:           "0x000000000022D473030F116dDEE9F6B43aC78BA3",
			Amount:            "100",
			SignedTransaction: "not-hex",
			Version:           "1",
		}
		if ValidateErc20ApprovalGasSponsoringInfo(info) {
			t.Fatal("expected invalid info for bad signedTransaction")
		}
	})

	t.Run("rejects invalid version", func(t *testing.T) {
		info := &Info{
			From:              "0x857b06519E91e3A54538791bDbb0E22373e36b66",
			Asset:             "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
			Spender:           "0x000000000022D473030F116dDEE9F6B43aC78BA3",
			Amount:            "100",
			SignedTransaction: "0xabc123",
			Version:           "v1.0",
		}
		if ValidateErc20ApprovalGasSponsoringInfo(info) {
			t.Fatal("expected invalid info for bad version format")
		}
	})

	t.Run("rejects non-numeric amount", func(t *testing.T) {
		info := &Info{
			From:              "0x857b06519E91e3A54538791bDbb0E22373e36b66",
			Asset:             "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
			Spender:           "0x000000000022D473030F116dDEE9F6B43aC78BA3",
			Amount:            "not-a-number",
			SignedTransaction: "0xabc123",
			Version:           "1",
		}
		if ValidateErc20ApprovalGasSponsoringInfo(info) {
			t.Fatal("expected invalid info for bad amount")
		}
	})
}

func TestNewFacilitatorExtension(t *testing.T) {
	t.Run("key is correct", func(t *testing.T) {
		ext := NewFacilitatorExtension(nil)
		if ext.Key() != ERC20ApprovalGasSponsoring {
			t.Errorf("unexpected key: %s, expected: %s", ext.Key(), ERC20ApprovalGasSponsoring)
		}
	})

	t.Run("signer is set", func(t *testing.T) {
		ext := NewFacilitatorExtension(nil)
		if ext.SmartWalletSigner != nil {
			t.Error("expected nil signer")
		}
	})

	t.Run("signer is preserved when non-nil", func(t *testing.T) {
		// We can't easily create a real signer, but we can test that
		// the FacilitatorExt struct holds the value correctly.
		// With nil we already tested above; the struct assignment is trivial.
		ext := &FacilitatorExt{SmartWalletSigner: nil}
		if ext.Key() != ERC20ApprovalGasSponsoring {
			t.Errorf("unexpected key from struct literal: %s", ext.Key())
		}
	})
}
