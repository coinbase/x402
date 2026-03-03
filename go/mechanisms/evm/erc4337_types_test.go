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

	t.Run("with paymaster field", func(t *testing.T) {
		extra := map[string]interface{}{
			"userOperation": map[string]interface{}{
				"supported":  true,
				"bundlerUrl": "https://bundler.example.com",
				"entrypoint": "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
				"paymaster":  "0xPaymasterAddress",
			},
		}

		cap := ExtractUserOperationCapability(extra)
		if cap == nil {
			t.Fatal("expected capability, got nil")
		}
		if !cap.Supported {
			t.Error("expected Supported to be true")
		}
		if cap.Paymaster != "0xPaymasterAddress" {
			t.Errorf("Paymaster = %q, want %q", cap.Paymaster, "0xPaymasterAddress")
		}
		if cap.BundlerUrl != "https://bundler.example.com" {
			t.Errorf("BundlerUrl = %q, want %q", cap.BundlerUrl, "https://bundler.example.com")
		}
		if cap.Entrypoint != "0x0000000071727De22E5E9d8BAf0edAc6f37da032" {
			t.Errorf("Entrypoint = %q, want %q", cap.Entrypoint, "0x0000000071727De22E5E9d8BAf0edAc6f37da032")
		}
	})
}

func TestErc4337PayloadFromMap_UserOperationAsString(t *testing.T) {
	// userOperation is a string instead of a map -- should fail
	data := map[string]interface{}{
		"entryPoint":    "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
		"userOperation": "invalid-string-not-a-map",
	}

	_, err := Erc4337PayloadFromMap(data)
	if err == nil {
		t.Fatal("expected error when userOperation is a string, got nil")
	}
}

func TestErc4337PayloadFromMap_UserOperationAsInteger(t *testing.T) {
	// userOperation is an integer instead of a map -- should fail
	data := map[string]interface{}{
		"entryPoint":    "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
		"userOperation": 42,
	}

	_, err := Erc4337PayloadFromMap(data)
	if err == nil {
		t.Fatal("expected error when userOperation is an integer, got nil")
	}
}

func TestErc4337PayloadFromMap_UserOperationAsBool(t *testing.T) {
	// userOperation is a bool instead of a map -- should fail
	data := map[string]interface{}{
		"entryPoint":    "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
		"userOperation": true,
	}

	_, err := Erc4337PayloadFromMap(data)
	if err == nil {
		t.Fatal("expected error when userOperation is a bool, got nil")
	}
}

func TestErc4337PayloadFromMap_UserOperationAsSlice(t *testing.T) {
	// userOperation is a slice instead of a map -- should fail
	data := map[string]interface{}{
		"entryPoint":    "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
		"userOperation": []string{"sender", "nonce"},
	}

	_, err := Erc4337PayloadFromMap(data)
	if err == nil {
		t.Fatal("expected error when userOperation is a slice, got nil")
	}
}

func TestErc4337PayloadFromMap_EmptyEntryPoint(t *testing.T) {
	// entryPoint is an empty string -- should fail
	data := map[string]interface{}{
		"entryPoint": "",
		"userOperation": map[string]interface{}{
			"sender": "0xSender",
		},
	}

	_, err := Erc4337PayloadFromMap(data)
	if err == nil {
		t.Fatal("expected error when entryPoint is empty, got nil")
	}
}

func TestErc4337PayloadFromMap_EntryPointAsNonString(t *testing.T) {
	// entryPoint is a number instead of string
	data := map[string]interface{}{
		"entryPoint": 12345,
		"userOperation": map[string]interface{}{
			"sender": "0xSender",
		},
	}

	_, err := Erc4337PayloadFromMap(data)
	if err == nil {
		t.Fatal("expected error when entryPoint is not a string, got nil")
	}
}

func TestErc4337Payload_PaymasterFieldsRoundTrip(t *testing.T) {
	// Test paymaster fields survive FromMap -> ToMap round-trip
	data := map[string]interface{}{
		"type":          "erc4337",
		"entryPoint":    "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
		"bundlerRpcUrl": "https://bundler.example.com",
		"userOperation": map[string]interface{}{
			"sender":                        "0xSender",
			"nonce":                         "0x01",
			"callData":                      "0xCallData",
			"callGasLimit":                  "0x5208",
			"verificationGasLimit":          "0x10000",
			"preVerificationGas":            "0x5000",
			"maxFeePerGas":                  "0x3B9ACA00",
			"maxPriorityFeePerGas":          "0x59682F00",
			"signature":                     "0xSignature",
			"paymaster":                     "0xPaymasterAddress",
			"paymasterData":                 "0xPaymasterData",
			"paymasterVerificationGasLimit": "0x8000",
			"paymasterPostOpGasLimit":       "0x4000",
		},
	}

	payload, err := Erc4337PayloadFromMap(data)
	if err != nil {
		t.Fatalf("unexpected error in FromMap: %v", err)
	}

	// Verify paymaster fields were parsed
	if payload.UserOperation.Paymaster != "0xPaymasterAddress" {
		t.Errorf("Paymaster = %q, want %q", payload.UserOperation.Paymaster, "0xPaymasterAddress")
	}
	if payload.UserOperation.PaymasterData != "0xPaymasterData" {
		t.Errorf("PaymasterData = %q, want %q", payload.UserOperation.PaymasterData, "0xPaymasterData")
	}
	if payload.UserOperation.PaymasterVerificationGasLimit != "0x8000" {
		t.Errorf("PaymasterVerificationGasLimit = %q, want %q", payload.UserOperation.PaymasterVerificationGasLimit, "0x8000")
	}
	if payload.UserOperation.PaymasterPostOpGasLimit != "0x4000" {
		t.Errorf("PaymasterPostOpGasLimit = %q, want %q", payload.UserOperation.PaymasterPostOpGasLimit, "0x4000")
	}

	// Now convert back to map and verify
	roundTripped := payload.ToMap()

	userOpMap, ok := roundTripped["userOperation"].(map[string]interface{})
	if !ok {
		t.Fatal("userOperation is not a map after round-trip")
	}
	if userOpMap["paymaster"] != "0xPaymasterAddress" {
		t.Errorf("round-trip paymaster = %v, want %v", userOpMap["paymaster"], "0xPaymasterAddress")
	}
	if userOpMap["paymasterData"] != "0xPaymasterData" {
		t.Errorf("round-trip paymasterData = %v, want %v", userOpMap["paymasterData"], "0xPaymasterData")
	}
	if userOpMap["paymasterVerificationGasLimit"] != "0x8000" {
		t.Errorf("round-trip paymasterVerificationGasLimit = %v, want %v", userOpMap["paymasterVerificationGasLimit"], "0x8000")
	}
	if userOpMap["paymasterPostOpGasLimit"] != "0x4000" {
		t.Errorf("round-trip paymasterPostOpGasLimit = %v, want %v", userOpMap["paymasterPostOpGasLimit"], "0x4000")
	}
}

func TestExtractUserOperationCapability_NonBoolSupported(t *testing.T) {
	// "supported" field is a non-bool (string "true") -- should return nil
	extra := map[string]interface{}{
		"userOperation": map[string]interface{}{
			"supported":  "true", // string, not bool
			"bundlerUrl": "https://bundler.example.com",
		},
	}

	cap := ExtractUserOperationCapability(extra)
	if cap != nil {
		t.Errorf("expected nil when supported is a string, got %v", cap)
	}
}

func TestExtractUserOperationCapability_NumericSupported(t *testing.T) {
	// "supported" field is a number -- should return nil
	extra := map[string]interface{}{
		"userOperation": map[string]interface{}{
			"supported":  1,
			"bundlerUrl": "https://bundler.example.com",
		},
	}

	cap := ExtractUserOperationCapability(extra)
	if cap != nil {
		t.Errorf("expected nil when supported is numeric, got %v", cap)
	}
}

func TestErc4337PayloadToMap_EmptyOptionalFields(t *testing.T) {
	payload := &Erc4337Payload{
		Type:          "", // empty
		EntryPoint:    "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
		BundlerRpcUrl: "", // empty
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

	// When Type is empty, "type" key should not be present
	if _, ok := m["type"]; ok {
		t.Error("expected 'type' key to be omitted when empty")
	}

	// When BundlerRpcUrl is empty, "bundlerRpcUrl" key should not be present
	if _, ok := m["bundlerRpcUrl"]; ok {
		t.Error("expected 'bundlerRpcUrl' key to be omitted when empty")
	}

	// entryPoint should always be present
	if _, ok := m["entryPoint"]; !ok {
		t.Error("expected 'entryPoint' key to be present")
	}

	// userOperation should always be present
	if _, ok := m["userOperation"]; !ok {
		t.Error("expected 'userOperation' key to be present")
	}
}

func TestUserOperation07JsonToMap_OptionalFields(t *testing.T) {
	t.Run("with factory fields", func(t *testing.T) {
		userOp := UserOperation07Json{
			Sender:               "0xSender",
			Nonce:                "0x01",
			CallData:             "0xCallData",
			CallGasLimit:         "0x5208",
			VerificationGasLimit: "0x10000",
			PreVerificationGas:   "0x5000",
			MaxFeePerGas:         "0x3B9ACA00",
			MaxPriorityFeePerGas: "0x59682F00",
			Signature:            "0xSignature",
			Factory:              "0xFactoryAddress",
			FactoryData:          "0xFactoryData",
		}

		m := userOp.ToMap()
		if m["factory"] != "0xFactoryAddress" {
			t.Errorf("factory = %v, want %v", m["factory"], "0xFactoryAddress")
		}
		if m["factoryData"] != "0xFactoryData" {
			t.Errorf("factoryData = %v, want %v", m["factoryData"], "0xFactoryData")
		}
	})

	t.Run("with paymaster fields", func(t *testing.T) {
		userOp := UserOperation07Json{
			Sender:                        "0xSender",
			Nonce:                         "0x01",
			CallData:                      "0xCallData",
			CallGasLimit:                  "0x5208",
			VerificationGasLimit:          "0x10000",
			PreVerificationGas:            "0x5000",
			MaxFeePerGas:                  "0x3B9ACA00",
			MaxPriorityFeePerGas:          "0x59682F00",
			Signature:                     "0xSignature",
			Paymaster:                     "0xPaymasterAddress",
			PaymasterData:                 "0xPaymasterData",
			PaymasterVerificationGasLimit: "0x8000",
			PaymasterPostOpGasLimit:       "0x4000",
		}

		m := userOp.ToMap()
		if m["paymaster"] != "0xPaymasterAddress" {
			t.Errorf("paymaster = %v, want %v", m["paymaster"], "0xPaymasterAddress")
		}
		if m["paymasterData"] != "0xPaymasterData" {
			t.Errorf("paymasterData = %v, want %v", m["paymasterData"], "0xPaymasterData")
		}
		if m["paymasterVerificationGasLimit"] != "0x8000" {
			t.Errorf("paymasterVerificationGasLimit = %v, want %v", m["paymasterVerificationGasLimit"], "0x8000")
		}
		if m["paymasterPostOpGasLimit"] != "0x4000" {
			t.Errorf("paymasterPostOpGasLimit = %v, want %v", m["paymasterPostOpGasLimit"], "0x4000")
		}
	})

	t.Run("empty optional fields omitted", func(t *testing.T) {
		userOp := UserOperation07Json{
			Sender:               "0xSender",
			Nonce:                "0x01",
			CallData:             "0xCallData",
			CallGasLimit:         "0x5208",
			VerificationGasLimit: "0x10000",
			PreVerificationGas:   "0x5000",
			MaxFeePerGas:         "0x3B9ACA00",
			MaxPriorityFeePerGas: "0x59682F00",
			Signature:            "0xSignature",
			// All optional fields empty
		}

		m := userOp.ToMap()
		optionalKeys := []string{"factory", "factoryData", "paymaster", "paymasterData", "paymasterVerificationGasLimit", "paymasterPostOpGasLimit"}
		for _, key := range optionalKeys {
			if _, ok := m[key]; ok {
				t.Errorf("expected %q to be omitted when empty", key)
			}
		}
	})
}
