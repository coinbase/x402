package facilitator

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestBundlerClient_EstimateUserOperationGas(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			var req jsonRpcRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				t.Fatalf("failed to decode request: %v", err)
			}

			if req.Method != "eth_estimateUserOperationGas" {
				t.Errorf("method = %q, want %q", req.Method, "eth_estimateUserOperationGas")
			}

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
		defer server.Close()

		client := NewBundlerClient(server.URL, nil)
		estimate, err := client.EstimateUserOperationGas(context.Background(), map[string]interface{}{
			"sender": "0x1234",
		}, "0xEntryPoint")

		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if estimate.CallGasLimit != "0x5208" {
			t.Errorf("CallGasLimit = %q, want %q", estimate.CallGasLimit, "0x5208")
		}
	})

	t.Run("rpc error", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
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
		defer server.Close()

		client := NewBundlerClient(server.URL, nil)
		_, err := client.EstimateUserOperationGas(context.Background(), map[string]interface{}{}, "0xEntryPoint")

		if err == nil {
			t.Fatal("expected error, got nil")
		}

		bundlerErr, ok := err.(*BundlerError)
		if !ok {
			t.Fatalf("expected BundlerError, got %T", err)
		}
		if bundlerErr.Code != -32500 {
			t.Errorf("Code = %d, want %d", bundlerErr.Code, -32500)
		}
	})

	t.Run("http error", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusInternalServerError)
		}))
		defer server.Close()

		client := NewBundlerClient(server.URL, nil)
		_, err := client.EstimateUserOperationGas(context.Background(), map[string]interface{}{}, "0xEntryPoint")

		if err == nil {
			t.Fatal("expected error, got nil")
		}
	})
}

func TestBundlerClient_SendUserOperation(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			resp := map[string]interface{}{
				"jsonrpc": "2.0",
				"id":      1,
				"result":  "0xUserOpHash123",
			}
			json.NewEncoder(w).Encode(resp)
		}))
		defer server.Close()

		client := NewBundlerClient(server.URL, nil)
		hash, err := client.SendUserOperation(context.Background(), map[string]interface{}{}, "0xEntryPoint")

		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if hash != "0xUserOpHash123" {
			t.Errorf("hash = %q, want %q", hash, "0xUserOpHash123")
		}
	})
}

func TestBundlerClient_GetUserOperationReceipt(t *testing.T) {
	t.Run("receipt found", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			resp := map[string]interface{}{
				"jsonrpc": "2.0",
				"id":      1,
				"result": map[string]interface{}{
					"userOpHash":    "0xHash",
					"entryPoint":    "0xEntryPoint",
					"sender":        "0xSender",
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
			json.NewEncoder(w).Encode(resp)
		}))
		defer server.Close()

		client := NewBundlerClient(server.URL, nil)
		receipt, err := client.GetUserOperationReceipt(context.Background(), "0xHash")

		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if receipt == nil {
			t.Fatal("expected receipt, got nil")
		}
		if receipt.Receipt.TransactionHash != "0xTxHash123" {
			t.Errorf("TransactionHash = %q, want %q", receipt.Receipt.TransactionHash, "0xTxHash123")
		}
	})

	t.Run("receipt not yet available", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			resp := map[string]interface{}{
				"jsonrpc": "2.0",
				"id":      1,
				"result":  nil,
			}
			json.NewEncoder(w).Encode(resp)
		}))
		defer server.Close()

		client := NewBundlerClient(server.URL, nil)
		receipt, err := client.GetUserOperationReceipt(context.Background(), "0xHash")

		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if receipt != nil {
			t.Errorf("expected nil receipt, got %v", receipt)
		}
	})
}

func TestBundlerClient_Timeout(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Never respond — let it timeout
		select {}
	}))
	defer server.Close()

	client := NewBundlerClient(server.URL, &BundlerClientConfig{TimeoutMs: 100})
	_, err := client.EstimateUserOperationGas(context.Background(), map[string]interface{}{}, "0xEntryPoint")

	if err == nil {
		t.Fatal("expected timeout error, got nil")
	}
}

func TestBundlerClient_JSONRPCRequestFormat(t *testing.T) {
	var capturedReq jsonRpcRequest
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewDecoder(r.Body).Decode(&capturedReq)

		if r.Header.Get("Content-Type") != "application/json" {
			t.Errorf("Content-Type = %q, want %q", r.Header.Get("Content-Type"), "application/json")
		}

		resp := map[string]interface{}{
			"jsonrpc": "2.0",
			"id":      1,
			"result":  "0xHash",
		}
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client := NewBundlerClient(server.URL, nil)
	client.SendUserOperation(context.Background(), map[string]interface{}{"sender": "0x1234"}, "0xEntryPoint")

	if capturedReq.Jsonrpc != "2.0" {
		t.Errorf("jsonrpc = %q, want %q", capturedReq.Jsonrpc, "2.0")
	}
	if capturedReq.Method != "eth_sendUserOperation" {
		t.Errorf("method = %q, want %q", capturedReq.Method, "eth_sendUserOperation")
	}
	if capturedReq.ID != 1 {
		t.Errorf("id = %d, want %d", capturedReq.ID, 1)
	}
	if len(capturedReq.Params) != 2 {
		t.Errorf("params length = %d, want %d", len(capturedReq.Params), 2)
	}
}
