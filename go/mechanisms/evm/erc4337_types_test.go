package evm

import (
	"testing"
)

func TestIsErc4337Payload(t *testing.T) {
	tests := []struct {
		name     string
		data     map[string]interface{}
		expected bool
	}{
		{
			name: "valid erc4337 payload",
			data: map[string]interface{}{
				"userOperation": map[string]interface{}{
					"sender": "0x1234",
				},
				"entryPoint": "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
			},
			expected: true,
		},
		{
			name: "erc4337 payload with type field",
			data: map[string]interface{}{
				"type": "erc4337",
				"userOperation": map[string]interface{}{
					"sender": "0x1234",
				},
				"entryPoint": "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
			},
			expected: true,
		},
		{
			name: "eip3009 payload (not erc4337)",
			data: map[string]interface{}{
				"authorization": map[string]interface{}{
					"from": "0x1234",
				},
				"signature": "0xabcd",
			},
			expected: false,
		},
		{
			name: "permit2 payload (not erc4337)",
			data: map[string]interface{}{
				"permit2Authorization": map[string]interface{}{
					"from": "0x1234",
				},
			},
			expected: false,
		},
		{
			name:     "empty map",
			data:     map[string]interface{}{},
			expected: false,
		},
		{
			name: "missing entryPoint",
			data: map[string]interface{}{
				"userOperation": map[string]interface{}{
					"sender": "0x1234",
				},
			},
			expected: false,
		},
		{
			name: "nil userOperation",
			data: map[string]interface{}{
				"userOperation": nil,
				"entryPoint":    "0x1234",
			},
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := IsErc4337Payload(tt.data)
			if result != tt.expected {
				t.Errorf("IsErc4337Payload() = %v, want %v", result, tt.expected)
			}
		})
	}
}

func TestErc4337PayloadFromMap(t *testing.T) {
	t.Run("valid payload", func(t *testing.T) {
		data := map[string]interface{}{
			"type":       "erc4337",
			"entryPoint": "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
			"bundlerRpcUrl": "https://bundler.example.com",
			"userOperation": map[string]interface{}{
				"sender":               "0xSender",
				"nonce":                "0x01",
				"callData":             "0xCallData",
				"callGasLimit":         "0x5208",
				"verificationGasLimit": "0x10000",
				"preVerificationGas":   "0x5000",
				"maxFeePerGas":         "0x3B9ACA00",
				"maxPriorityFeePerGas": "0x59682F00",
				"signature":            "0xSignature",
				"factory":              "0xFactory",
				"factoryData":          "0xFactoryData",
			},
		}

		payload, err := Erc4337PayloadFromMap(data)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if payload.Type != "erc4337" {
			t.Errorf("Type = %q, want %q", payload.Type, "erc4337")
		}
		if payload.EntryPoint != "0x0000000071727De22E5E9d8BAf0edAc6f37da032" {
			t.Errorf("EntryPoint = %q, want %q", payload.EntryPoint, "0x0000000071727De22E5E9d8BAf0edAc6f37da032")
		}
		if payload.BundlerRpcUrl != "https://bundler.example.com" {
			t.Errorf("BundlerRpcUrl = %q, want %q", payload.BundlerRpcUrl, "https://bundler.example.com")
		}
		if payload.UserOperation.Sender != "0xSender" {
			t.Errorf("Sender = %q, want %q", payload.UserOperation.Sender, "0xSender")
		}
		if payload.UserOperation.Factory != "0xFactory" {
			t.Errorf("Factory = %q, want %q", payload.UserOperation.Factory, "0xFactory")
		}
	})

	t.Run("missing entryPoint", func(t *testing.T) {
		data := map[string]interface{}{
			"userOperation": map[string]interface{}{
				"sender": "0xSender",
			},
		}

		_, err := Erc4337PayloadFromMap(data)
		if err == nil {
			t.Fatal("expected error, got nil")
		}
	})

	t.Run("missing userOperation", func(t *testing.T) {
		data := map[string]interface{}{
			"entryPoint": "0x1234",
		}

		_, err := Erc4337PayloadFromMap(data)
		if err == nil {
			t.Fatal("expected error, got nil")
		}
	})

	t.Run("missing sender in userOperation", func(t *testing.T) {
		data := map[string]interface{}{
			"entryPoint": "0x1234",
			"userOperation": map[string]interface{}{
				"nonce": "0x01",
			},
		}

		_, err := Erc4337PayloadFromMap(data)
		if err == nil {
			t.Fatal("expected error, got nil")
		}
	})
}

func TestErc4337PayloadToMap(t *testing.T) {
	payload := &Erc4337Payload{
		Type:          "erc4337",
		EntryPoint:    "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
		BundlerRpcUrl: "https://bundler.example.com",
		UserOperation: UserOperation07Json{
			Sender:               "0xSender",
			Nonce:                "0x01",
			CallData:             "0xCallData",
			CallGasLimit:         "0x5208",
			VerificationGasLimit: "0x10000",
			PreVerificationGas:   "0x5000",
			MaxFeePerGas:         "0x3B9ACA00",
			MaxPriorityFeePerGas: "0x59682F00",
			Signature:            "0xSignature",
		},
	}

	m := payload.ToMap()

	if m["type"] != "erc4337" {
		t.Errorf("type = %v, want %v", m["type"], "erc4337")
	}
	if m["entryPoint"] != "0x0000000071727De22E5E9d8BAf0edAc6f37da032" {
		t.Errorf("entryPoint = %v, want %v", m["entryPoint"], "0x0000000071727De22E5E9d8BAf0edAc6f37da032")
	}
	if m["bundlerRpcUrl"] != "https://bundler.example.com" {
		t.Errorf("bundlerRpcUrl = %v, want %v", m["bundlerRpcUrl"], "https://bundler.example.com")
	}

	userOpMap, ok := m["userOperation"].(map[string]interface{})
	if !ok {
		t.Fatal("userOperation is not a map")
	}
	if userOpMap["sender"] != "0xSender" {
		t.Errorf("sender = %v, want %v", userOpMap["sender"], "0xSender")
	}
}

func TestExtractUserOperationCapability(t *testing.T) {
	t.Run("present and supported", func(t *testing.T) {
		extra := map[string]interface{}{
			"userOperation": map[string]interface{}{
				"supported":  true,
				"bundlerUrl": "https://bundler.example.com",
				"entrypoint": "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
			},
		}

		cap := ExtractUserOperationCapability(extra)
		if cap == nil {
			t.Fatal("expected capability, got nil")
		}
		if !cap.Supported {
			t.Error("expected Supported to be true")
		}
		if cap.BundlerUrl != "https://bundler.example.com" {
			t.Errorf("BundlerUrl = %q, want %q", cap.BundlerUrl, "https://bundler.example.com")
		}
		if cap.Entrypoint != "0x0000000071727De22E5E9d8BAf0edAc6f37da032" {
			t.Errorf("Entrypoint = %q, want %q", cap.Entrypoint, "0x0000000071727De22E5E9d8BAf0edAc6f37da032")
		}
	})

	t.Run("nil extra", func(t *testing.T) {
		cap := ExtractUserOperationCapability(nil)
		if cap != nil {
			t.Errorf("expected nil, got %v", cap)
		}
	})

	t.Run("no userOperation key", func(t *testing.T) {
		extra := map[string]interface{}{
			"name": "USDC",
		}
		cap := ExtractUserOperationCapability(extra)
		if cap != nil {
			t.Errorf("expected nil, got %v", cap)
		}
	})

	t.Run("supported is false", func(t *testing.T) {
		extra := map[string]interface{}{
			"userOperation": map[string]interface{}{
				"supported": false,
			},
		}
		cap := ExtractUserOperationCapability(extra)
		if cap != nil {
			t.Errorf("expected nil, got %v", cap)
		}
	})
}
