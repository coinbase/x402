package facilitator

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/coinbase/x402/go/types"
)

func makeERC4337Payload(bundlerUrl string) types.PaymentPayload {
	return types.PaymentPayload{
		X402Version: 2,
		Accepted: types.PaymentRequirements{
			Scheme:  "exact",
			Network: "eip155:84532",
		},
		Payload: map[string]interface{}{
			"type":       "erc4337",
			"entryPoint": "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
			"bundlerRpcUrl": bundlerUrl,
			"userOperation": map[string]interface{}{
				"sender":               "0xSenderAddress",
				"nonce":                "0x01",
				"callData":             "0xCallData",
				"callGasLimit":         "0x5208",
				"verificationGasLimit": "0x10000",
				"preVerificationGas":   "0x5000",
				"maxFeePerGas":         "0x3B9ACA00",
				"maxPriorityFeePerGas": "0x59682F00",
				"signature":            "0xSignature",
			},
		},
	}
}

func makeRequirements() types.PaymentRequirements {
	return types.PaymentRequirements{
		Scheme:  "exact",
		Network: "eip155:84532",
		Amount:  "1000000",
		Asset:   "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
		PayTo:   "0xRecipient",
	}
}

func TestExactEvmSchemeERC4337_Verify(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		bundlerServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			resp := map[string]interface{}{
				"jsonrpc": "2.0",
				"id":      1,
				"result": map[string]interface{}{
					"callGasLimit":         "0x5208",
					"verificationGasLimit": "0x10000",
					"preVerificationGas":   "0x5000",
				},
			}
			json.NewEncoder(w).Encode(resp)
		}))
		defer bundlerServer.Close()

		scheme := NewExactEvmSchemeERC4337(nil)
		payload := makeERC4337Payload(bundlerServer.URL)
		requirements := makeRequirements()

		resp, err := scheme.Verify(context.Background(), payload, requirements, nil)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !resp.IsValid {
			t.Error("expected IsValid to be true")
		}
		if resp.Payer != "0xSenderAddress" {
			t.Errorf("Payer = %q, want %q", resp.Payer, "0xSenderAddress")
		}
	})

	t.Run("missing user operation", func(t *testing.T) {
		scheme := NewExactEvmSchemeERC4337(nil)
		payload := types.PaymentPayload{
			Payload: map[string]interface{}{
				"authorization": map[string]interface{}{
					"from": "0x1234",
				},
			},
		}

		_, err := scheme.Verify(context.Background(), payload, makeRequirements(), nil)
		if err == nil {
			t.Fatal("expected error, got nil")
		}
	})

	t.Run("missing bundler url", func(t *testing.T) {
		scheme := NewExactEvmSchemeERC4337(nil)
		payload := makeERC4337Payload("")
		requirements := makeRequirements()

		_, err := scheme.Verify(context.Background(), payload, requirements, nil)
		if err == nil {
			t.Fatal("expected error, got nil")
		}
	})

	t.Run("gas estimation failure", func(t *testing.T) {
		bundlerServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			resp := map[string]interface{}{
				"jsonrpc": "2.0",
				"id":      1,
				"error": map[string]interface{}{
					"message": "AA21 insufficient funds",
					"code":    -32500,
				},
			}
			json.NewEncoder(w).Encode(resp)
		}))
		defer bundlerServer.Close()

		scheme := NewExactEvmSchemeERC4337(nil)
		payload := makeERC4337Payload(bundlerServer.URL)

		_, err := scheme.Verify(context.Background(), payload, makeRequirements(), nil)
		if err == nil {
			t.Fatal("expected error, got nil")
		}
	})

	t.Run("bundler url from config", func(t *testing.T) {
		bundlerServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			resp := map[string]interface{}{
				"jsonrpc": "2.0",
				"id":      1,
				"result":  map[string]interface{}{"callGasLimit": "0x5208"},
			}
			json.NewEncoder(w).Encode(resp)
		}))
		defer bundlerServer.Close()

		scheme := NewExactEvmSchemeERC4337(&ExactEvmSchemeERC4337Config{
			DefaultBundlerUrl: bundlerServer.URL,
		})
		payload := makeERC4337Payload("") // No bundler in payload
		requirements := makeRequirements()

		resp, err := scheme.Verify(context.Background(), payload, requirements, nil)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !resp.IsValid {
			t.Error("expected IsValid to be true")
		}
	})
}

func TestExactEvmSchemeERC4337_Settle(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		callCount := 0
		bundlerServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			var req jsonRpcRequest
			json.NewDecoder(r.Body).Decode(&req)

			var resp map[string]interface{}
			switch req.Method {
			case "eth_estimateUserOperationGas":
				resp = map[string]interface{}{
					"jsonrpc": "2.0",
					"id":      1,
					"result":  map[string]interface{}{"callGasLimit": "0x5208"},
				}
			case "eth_sendUserOperation":
				resp = map[string]interface{}{
					"jsonrpc": "2.0",
					"id":      1,
					"result":  "0xUserOpHash",
				}
			case "eth_getUserOperationReceipt":
				callCount++
				resp = map[string]interface{}{
					"jsonrpc": "2.0",
					"id":      1,
					"result": map[string]interface{}{
						"userOpHash":    "0xUserOpHash",
						"entryPoint":    "0xEntryPoint",
						"sender":        "0xSenderAddress",
						"nonce":         "0x01",
						"actualGasCost": "0x100",
						"actualGasUsed": "0x50",
						"success":       true,
						"logs":          []interface{}{},
						"receipt": map[string]interface{}{
							"transactionHash": "0xTxHash123",
						},
					},
				}
			}
			json.NewEncoder(w).Encode(resp)
		}))
		defer bundlerServer.Close()

		scheme := NewExactEvmSchemeERC4337(&ExactEvmSchemeERC4337Config{
			ReceiptPollTimeoutMs:  5000,
			ReceiptPollIntervalMs: 100,
		})
		payload := makeERC4337Payload(bundlerServer.URL)

		resp, err := scheme.Settle(context.Background(), payload, makeRequirements(), nil)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !resp.Success {
			t.Error("expected Success to be true")
		}
		if resp.Transaction != "0xTxHash123" {
			t.Errorf("Transaction = %q, want %q", resp.Transaction, "0xTxHash123")
		}
		if resp.Payer != "0xSenderAddress" {
			t.Errorf("Payer = %q, want %q", resp.Payer, "0xSenderAddress")
		}
	})

	t.Run("settle with top-level transactionHash", func(t *testing.T) {
		bundlerServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			var req jsonRpcRequest
			json.NewDecoder(r.Body).Decode(&req)

			var resp map[string]interface{}
			switch req.Method {
			case "eth_estimateUserOperationGas":
				resp = map[string]interface{}{
					"jsonrpc": "2.0", "id": 1,
					"result": map[string]interface{}{"callGasLimit": "0x5208"},
				}
			case "eth_sendUserOperation":
				resp = map[string]interface{}{
					"jsonrpc": "2.0", "id": 1,
					"result": "0xUserOpHash",
				}
			case "eth_getUserOperationReceipt":
				resp = map[string]interface{}{
					"jsonrpc": "2.0", "id": 1,
					"result": map[string]interface{}{
						"userOpHash":      "0xUserOpHash",
						"entryPoint":      "0xEntryPoint",
						"sender":          "0xSender",
						"nonce":           "0x01",
						"actualGasCost":   "0x100",
						"actualGasUsed":   "0x50",
						"success":         true,
						"logs":            []interface{}{},
						"transactionHash": "0xTopLevelTxHash",
					},
				}
			}
			json.NewEncoder(w).Encode(resp)
		}))
		defer bundlerServer.Close()

		scheme := NewExactEvmSchemeERC4337(&ExactEvmSchemeERC4337Config{
			ReceiptPollTimeoutMs:  5000,
			ReceiptPollIntervalMs: 100,
		})
		payload := makeERC4337Payload(bundlerServer.URL)

		resp, err := scheme.Settle(context.Background(), payload, makeRequirements(), nil)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if resp.Transaction != "0xTopLevelTxHash" {
			t.Errorf("Transaction = %q, want %q", resp.Transaction, "0xTopLevelTxHash")
		}
	})
}

func TestExactEvmSchemeERC4337_CaipFamily(t *testing.T) {
	scheme := NewExactEvmSchemeERC4337(nil)
	if scheme.CaipFamily() != "eip155:*" {
		t.Errorf("CaipFamily() = %q, want %q", scheme.CaipFamily(), "eip155:*")
	}
}

func TestExactEvmSchemeERC4337_Verify_MissingEntryPoint(t *testing.T) {
	bundlerServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := map[string]interface{}{
			"jsonrpc": "2.0",
			"id":      1,
			"result":  map[string]interface{}{"callGasLimit": "0x5208"},
		}
		json.NewEncoder(w).Encode(resp)
	}))
	defer bundlerServer.Close()

	scheme := NewExactEvmSchemeERC4337(nil)
	payload := makeERC4337Payload(bundlerServer.URL)
	// Remove entryPoint from payload
	payload.Payload["entryPoint"] = ""

	_, err := scheme.Verify(context.Background(), payload, makeRequirements(), nil)
	if err == nil {
		t.Fatal("expected error for missing entry point")
	}
}

func TestExactEvmSchemeERC4337_Settle_VerificationFailure(t *testing.T) {
	// Bundler returns error on gas estimation (which Verify uses)
	bundlerServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := map[string]interface{}{
			"jsonrpc": "2.0",
			"id":      1,
			"error": map[string]interface{}{
				"message": "AA24 signature validation failed",
				"code":    -32500,
			},
		}
		json.NewEncoder(w).Encode(resp)
	}))
	defer bundlerServer.Close()

	scheme := NewExactEvmSchemeERC4337(&ExactEvmSchemeERC4337Config{
		ReceiptPollTimeoutMs:  1000,
		ReceiptPollIntervalMs: 100,
	})
	payload := makeERC4337Payload(bundlerServer.URL)

	_, err := scheme.Settle(context.Background(), payload, makeRequirements(), nil)
	if err == nil {
		t.Fatal("expected error for verification failure during settle")
	}
}

func TestExactEvmSchemeERC4337_Settle_MissingBundlerUrl(t *testing.T) {
	scheme := NewExactEvmSchemeERC4337(&ExactEvmSchemeERC4337Config{
		ReceiptPollTimeoutMs:  1000,
		ReceiptPollIntervalMs: 100,
	})
	payload := makeERC4337Payload("") // No bundler URL

	_, err := scheme.Settle(context.Background(), payload, makeRequirements(), nil)
	if err == nil {
		t.Fatal("expected error for missing bundler URL during settle")
	}
}

func TestExactEvmSchemeERC4337_Settle_SendFailure(t *testing.T) {
	callCount := 0
	bundlerServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req jsonRpcRequest
		json.NewDecoder(r.Body).Decode(&req)

		callCount++

		var resp map[string]interface{}
		switch req.Method {
		case "eth_estimateUserOperationGas":
			// Verify succeeds
			resp = map[string]interface{}{
				"jsonrpc": "2.0",
				"id":      1,
				"result":  map[string]interface{}{"callGasLimit": "0x5208"},
			}
		case "eth_sendUserOperation":
			// Send fails
			resp = map[string]interface{}{
				"jsonrpc": "2.0",
				"id":      1,
				"error": map[string]interface{}{
					"message": "AA21 insufficient funds for gas",
					"code":    -32500,
				},
			}
		default:
			resp = map[string]interface{}{
				"jsonrpc": "2.0",
				"id":      1,
				"result":  nil,
			}
		}
		json.NewEncoder(w).Encode(resp)
	}))
	defer bundlerServer.Close()

	scheme := NewExactEvmSchemeERC4337(&ExactEvmSchemeERC4337Config{
		ReceiptPollTimeoutMs:  1000,
		ReceiptPollIntervalMs: 100,
	})
	payload := makeERC4337Payload(bundlerServer.URL)

	_, err := scheme.Settle(context.Background(), payload, makeRequirements(), nil)
	if err == nil {
		t.Fatal("expected error for send failure during settle")
	}
}

func TestExactEvmSchemeERC4337_Settle_ReceiptPollTimeout(t *testing.T) {
	bundlerServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req jsonRpcRequest
		json.NewDecoder(r.Body).Decode(&req)

		var resp map[string]interface{}
		switch req.Method {
		case "eth_estimateUserOperationGas":
			resp = map[string]interface{}{
				"jsonrpc": "2.0",
				"id":      1,
				"result":  map[string]interface{}{"callGasLimit": "0x5208"},
			}
		case "eth_sendUserOperation":
			resp = map[string]interface{}{
				"jsonrpc": "2.0",
				"id":      1,
				"result":  "0xUserOpHash",
			}
		case "eth_getUserOperationReceipt":
			// Always return nil receipt to simulate timeout
			resp = map[string]interface{}{
				"jsonrpc": "2.0",
				"id":      1,
				"result":  nil,
			}
		}
		json.NewEncoder(w).Encode(resp)
	}))
	defer bundlerServer.Close()

	scheme := NewExactEvmSchemeERC4337(&ExactEvmSchemeERC4337Config{
		ReceiptPollTimeoutMs:  300,
		ReceiptPollIntervalMs: 50,
	})
	payload := makeERC4337Payload(bundlerServer.URL)

	resp, err := scheme.Settle(context.Background(), payload, makeRequirements(), nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// When receipt times out, the settle still succeeds but uses the userOpHash as txHash
	if !resp.Success {
		t.Error("expected Success to be true even with receipt timeout")
	}
	if resp.Transaction != "0xUserOpHash" {
		t.Errorf("Transaction = %q, want %q (should fall back to userOpHash)", resp.Transaction, "0xUserOpHash")
	}
}

func TestExactEvmSchemeERC4337_GetSigners(t *testing.T) {
	scheme := NewExactEvmSchemeERC4337(nil)
	signers := scheme.GetSigners("eip155:84532")
	if len(signers) != 0 {
		t.Errorf("GetSigners() returned %d signers, want 0", len(signers))
	}
}

func TestExactEvmSchemeERC4337_GetExtra(t *testing.T) {
	scheme := NewExactEvmSchemeERC4337(nil)
	extra := scheme.GetExtra("eip155:84532")
	if extra != nil {
		t.Errorf("GetExtra() = %v, want nil", extra)
	}
}

func TestExactEvmSchemeERC4337_Scheme(t *testing.T) {
	scheme := NewExactEvmSchemeERC4337(nil)
	if scheme.Scheme() != "exact" {
		t.Errorf("Scheme() = %q, want %q", scheme.Scheme(), "exact")
	}
}

func TestExactEvmSchemeERC4337_Verify_PassesIsErc4337ButFailsFromMap(t *testing.T) {
	// Payload passes IsErc4337Payload (has both userOperation and entryPoint keys)
	// but fails Erc4337PayloadFromMap because userOperation is a string, not a map.
	scheme := NewExactEvmSchemeERC4337(nil)
	payload := types.PaymentPayload{
		X402Version: 2,
		Accepted: types.PaymentRequirements{
			Scheme:  "exact",
			Network: "eip155:84532",
		},
		Payload: map[string]interface{}{
			"userOperation": "invalid-string-not-a-map",
			"entryPoint":    "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
		},
	}

	_, err := scheme.Verify(context.Background(), payload, makeRequirements(), nil)
	if err == nil {
		t.Fatal("expected error when userOperation is a string, got nil")
	}
}

func TestExactEvmSchemeERC4337_Settle_ReceiptPollWithErrors(t *testing.T) {
	// GetUserOperationReceipt returns errors during polling, then eventually returns a valid receipt.
	receiptCallCount := 0
	bundlerServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req jsonRpcRequest
		json.NewDecoder(r.Body).Decode(&req)

		var resp map[string]interface{}
		switch req.Method {
		case "eth_estimateUserOperationGas":
			resp = map[string]interface{}{
				"jsonrpc": "2.0",
				"id":      1,
				"result":  map[string]interface{}{"callGasLimit": "0x5208"},
			}
		case "eth_sendUserOperation":
			resp = map[string]interface{}{
				"jsonrpc": "2.0",
				"id":      1,
				"result":  "0xUserOpHash",
			}
		case "eth_getUserOperationReceipt":
			receiptCallCount++
			if receiptCallCount <= 2 {
				// Return RPC error for first 2 receipt polls
				resp = map[string]interface{}{
					"jsonrpc": "2.0",
					"id":      1,
					"error": map[string]interface{}{
						"message": "internal error",
						"code":    -32603,
					},
				}
			} else {
				// Third poll returns a valid receipt
				resp = map[string]interface{}{
					"jsonrpc": "2.0",
					"id":      1,
					"result": map[string]interface{}{
						"userOpHash":    "0xUserOpHash",
						"entryPoint":    "0xEntryPoint",
						"sender":        "0xSenderAddress",
						"nonce":         "0x01",
						"actualGasCost": "0x100",
						"actualGasUsed": "0x50",
						"success":       true,
						"logs":          []interface{}{},
						"receipt": map[string]interface{}{
							"transactionHash": "0xTxHashAfterErrors",
						},
					},
				}
			}
		}
		json.NewEncoder(w).Encode(resp)
	}))
	defer bundlerServer.Close()

	scheme := NewExactEvmSchemeERC4337(&ExactEvmSchemeERC4337Config{
		ReceiptPollTimeoutMs:  5000,
		ReceiptPollIntervalMs: 50,
	})
	payload := makeERC4337Payload(bundlerServer.URL)

	resp, err := scheme.Settle(context.Background(), payload, makeRequirements(), nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !resp.Success {
		t.Error("expected Success to be true")
	}
	if resp.Transaction != "0xTxHashAfterErrors" {
		t.Errorf("Transaction = %q, want %q", resp.Transaction, "0xTxHashAfterErrors")
	}
	if receiptCallCount < 3 {
		t.Errorf("expected at least 3 receipt calls, got %d", receiptCallCount)
	}
}

func TestExactEvmSchemeERC4337_Verify_BundlerUrlFromRequirementsExtra(t *testing.T) {
	// payload.BundlerRpcUrl="" and config.DefaultBundlerUrl=""
	// requirements.Extra has "userOperation" -> "bundlerUrl" -> actual URL
	bundlerServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := map[string]interface{}{
			"jsonrpc": "2.0",
			"id":      1,
			"result":  map[string]interface{}{"callGasLimit": "0x5208"},
		}
		json.NewEncoder(w).Encode(resp)
	}))
	defer bundlerServer.Close()

	scheme := NewExactEvmSchemeERC4337(nil) // No DefaultBundlerUrl in config
	payload := makeERC4337Payload("")       // No bundler URL in payload

	requirements := makeRequirements()
	requirements.Extra = map[string]interface{}{
		"userOperation": map[string]interface{}{
			"supported":  true,
			"bundlerUrl": bundlerServer.URL,
		},
	}

	resp, err := scheme.Verify(context.Background(), payload, requirements, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !resp.IsValid {
		t.Error("expected IsValid to be true")
	}
}

func TestExactEvmSchemeERC4337_Settle_ReceiptNoTxHashFallbackToUserOpHash(t *testing.T) {
	// Receipt exists but both TransactionHash and Receipt.TransactionHash are empty.
	// Should fall back to user_op_hash.
	bundlerServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req jsonRpcRequest
		json.NewDecoder(r.Body).Decode(&req)

		var resp map[string]interface{}
		switch req.Method {
		case "eth_estimateUserOperationGas":
			resp = map[string]interface{}{
				"jsonrpc": "2.0", "id": 1,
				"result": map[string]interface{}{"callGasLimit": "0x5208"},
			}
		case "eth_sendUserOperation":
			resp = map[string]interface{}{
				"jsonrpc": "2.0", "id": 1,
				"result": "0xUserOpHash",
			}
		case "eth_getUserOperationReceipt":
			resp = map[string]interface{}{
				"jsonrpc": "2.0", "id": 1,
				"result": map[string]interface{}{
					"userOpHash":    "0xUserOpHash",
					"entryPoint":    "0xEntryPoint",
					"sender":        "0xSenderAddress",
					"nonce":         "0x01",
					"actualGasCost": "0x100",
					"actualGasUsed": "0x50",
					"success":       true,
					"logs":          []interface{}{},
					// No transactionHash at top level
					"receipt": map[string]interface{}{
						// Empty transactionHash in inner receipt
						"transactionHash": "",
					},
				},
			}
		}
		json.NewEncoder(w).Encode(resp)
	}))
	defer bundlerServer.Close()

	scheme := NewExactEvmSchemeERC4337(&ExactEvmSchemeERC4337Config{
		ReceiptPollTimeoutMs:  5000,
		ReceiptPollIntervalMs: 100,
	})
	payload := makeERC4337Payload(bundlerServer.URL)

	resp, err := scheme.Settle(context.Background(), payload, makeRequirements(), nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !resp.Success {
		t.Error("expected Success to be true")
	}
	// Both receipt.Receipt.TransactionHash and receipt.TransactionHash are empty,
	// so it should fall back to the userOpHash
	if resp.Transaction != "0xUserOpHash" {
		t.Errorf("Transaction = %q, want %q (should fall back to userOpHash)", resp.Transaction, "0xUserOpHash")
	}
}

func TestExactEvmSchemeERC4337_Settle_ReceiptNoInnerReceipt(t *testing.T) {
	// Receipt exists with no inner receipt but has top-level transactionHash empty.
	// Should fall back to userOpHash.
	bundlerServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req jsonRpcRequest
		json.NewDecoder(r.Body).Decode(&req)

		var resp map[string]interface{}
		switch req.Method {
		case "eth_estimateUserOperationGas":
			resp = map[string]interface{}{
				"jsonrpc": "2.0", "id": 1,
				"result": map[string]interface{}{"callGasLimit": "0x5208"},
			}
		case "eth_sendUserOperation":
			resp = map[string]interface{}{
				"jsonrpc": "2.0", "id": 1,
				"result": "0xUserOpHash",
			}
		case "eth_getUserOperationReceipt":
			resp = map[string]interface{}{
				"jsonrpc": "2.0", "id": 1,
				"result": map[string]interface{}{
					"userOpHash":    "0xUserOpHash",
					"entryPoint":    "0xEntryPoint",
					"sender":        "0xSenderAddress",
					"nonce":         "0x01",
					"actualGasCost": "0x100",
					"actualGasUsed": "0x50",
					"success":       true,
					"logs":          []interface{}{},
					// No receipt field at all, no transactionHash
				},
			}
		}
		json.NewEncoder(w).Encode(resp)
	}))
	defer bundlerServer.Close()

	scheme := NewExactEvmSchemeERC4337(&ExactEvmSchemeERC4337Config{
		ReceiptPollTimeoutMs:  5000,
		ReceiptPollIntervalMs: 100,
	})
	payload := makeERC4337Payload(bundlerServer.URL)

	resp, err := scheme.Settle(context.Background(), payload, makeRequirements(), nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// No inner receipt and no top-level transactionHash -> falls back to userOpHash
	if resp.Transaction != "0xUserOpHash" {
		t.Errorf("Transaction = %q, want %q (should fall back to userOpHash)", resp.Transaction, "0xUserOpHash")
	}
}
