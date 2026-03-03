package client

import (
	"context"
	"fmt"
	"testing"

	"github.com/coinbase/x402/go/mechanisms/evm"
	"github.com/coinbase/x402/go/types"
)

// mockSigner is a mock ERC4337UserOperationSigner for testing.
type mockSigner struct {
	address   string
	signErr   error
	signature string
}

func (m *mockSigner) Address() string { return m.address }

func (m *mockSigner) SignUserOperation(_ context.Context, _ evm.UserOperation07Json) (string, error) {
	if m.signErr != nil {
		return "", m.signErr
	}
	return m.signature, nil
}

// mockBundlerClient is a mock ERC4337BundlerClient for testing.
type mockBundlerClient struct {
	prepareErr error
	prepareOp  *evm.UserOperation07Json
}

func (m *mockBundlerClient) PrepareUserOperation(_ context.Context, _ []UserOperationCall, _ string) (*evm.UserOperation07Json, error) {
	if m.prepareErr != nil {
		return nil, m.prepareErr
	}
	return m.prepareOp, nil
}

func (m *mockBundlerClient) EstimateGas(_ context.Context, userOp evm.UserOperation07Json, _ string) (*evm.UserOperation07Json, error) {
	return &userOp, nil
}

func (m *mockBundlerClient) SendUserOperation(_ context.Context, _ evm.UserOperation07Json, _ string) (string, error) {
	return "0xHash", nil
}

func makeClientRequirements() types.PaymentRequirements {
	return types.PaymentRequirements{
		Scheme:  "exact",
		Network: "eip155:84532",
		Amount:  "1000000",
		Asset:   "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
		PayTo:   "0xRecipient",
		Extra: map[string]interface{}{
			"userOperation": map[string]interface{}{
				"supported":  true,
				"bundlerUrl": "https://bundler.example.com",
				"entrypoint": "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
			},
		},
	}
}

func TestExactEvmSchemeERC4337_CreatePaymentPayload(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		scheme, err := NewExactEvmSchemeERC4337(ExactEvmSchemeERC4337Config{
			Signer: &mockSigner{
				address:   "0xSender",
				signature: "0xMockSignature",
			},
			BundlerClient: &mockBundlerClient{
				prepareOp: &evm.UserOperation07Json{
					Sender:               "0xSender",
					Nonce:                "0x01",
					CallData:             "0xCallData",
					CallGasLimit:         "0x5208",
					VerificationGasLimit: "0x10000",
					PreVerificationGas:   "0x5000",
					MaxFeePerGas:         "0x3B9ACA00",
					MaxPriorityFeePerGas: "0x59682F00",
				},
			},
			Entrypoint: "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
			BundlerUrl: "https://bundler.example.com",
		})
		if err != nil {
			t.Fatalf("unexpected error creating scheme: %v", err)
		}

		payload, err := scheme.CreatePaymentPayload(context.Background(), makeClientRequirements())
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if payload.X402Version != 2 {
			t.Errorf("X402Version = %d, want %d", payload.X402Version, 2)
		}

		if !evm.IsErc4337Payload(payload.Payload) {
			t.Error("expected payload to be detected as ERC-4337")
		}

		erc4337Payload, err := evm.Erc4337PayloadFromMap(payload.Payload)
		if err != nil {
			t.Fatalf("failed to parse payload: %v", err)
		}
		if erc4337Payload.UserOperation.Signature != "0xMockSignature" {
			t.Errorf("Signature = %q, want %q", erc4337Payload.UserOperation.Signature, "0xMockSignature")
		}
	})

	t.Run("missing signer", func(t *testing.T) {
		_, err := NewExactEvmSchemeERC4337(ExactEvmSchemeERC4337Config{})
		if err == nil {
			t.Fatal("expected error for missing signer")
		}
	})

	t.Run("missing entrypoint", func(t *testing.T) {
		scheme, _ := NewExactEvmSchemeERC4337(ExactEvmSchemeERC4337Config{
			Signer:        &mockSigner{address: "0xSender", signature: "0xSig"},
			BundlerClient: &mockBundlerClient{},
			BundlerUrl:    "https://bundler.example.com",
		})

		requirements := makeClientRequirements()
		requirements.Extra = nil // No capability

		_, err := scheme.CreatePaymentPayload(context.Background(), requirements)
		if err == nil {
			t.Fatal("expected error for missing entrypoint")
		}
	})

	t.Run("missing bundler url", func(t *testing.T) {
		scheme, _ := NewExactEvmSchemeERC4337(ExactEvmSchemeERC4337Config{
			Signer:        &mockSigner{address: "0xSender", signature: "0xSig"},
			BundlerClient: &mockBundlerClient{},
			Entrypoint:    "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
		})

		requirements := makeClientRequirements()
		requirements.Extra = nil // No capability

		_, err := scheme.CreatePaymentPayload(context.Background(), requirements)
		if err == nil {
			t.Fatal("expected error for missing bundler URL")
		}
	})

	t.Run("preparation fails", func(t *testing.T) {
		scheme, _ := NewExactEvmSchemeERC4337(ExactEvmSchemeERC4337Config{
			Signer: &mockSigner{address: "0xSender", signature: "0xSig"},
			BundlerClient: &mockBundlerClient{
				prepareErr: fmt.Errorf("AA21 insufficient funds"),
			},
			Entrypoint: "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
			BundlerUrl: "https://bundler.example.com",
		})

		_, err := scheme.CreatePaymentPayload(context.Background(), makeClientRequirements())
		if err == nil {
			t.Fatal("expected error for preparation failure")
		}
	})

	t.Run("signing fails", func(t *testing.T) {
		scheme, _ := NewExactEvmSchemeERC4337(ExactEvmSchemeERC4337Config{
			Signer: &mockSigner{
				address: "0xSender",
				signErr: fmt.Errorf("signing error"),
			},
			BundlerClient: &mockBundlerClient{
				prepareOp: &evm.UserOperation07Json{
					Sender:               "0xSender",
					Nonce:                "0x01",
					CallData:             "0xCallData",
					CallGasLimit:         "0x5208",
					VerificationGasLimit: "0x10000",
					PreVerificationGas:   "0x5000",
					MaxFeePerGas:         "0x3B9ACA00",
					MaxPriorityFeePerGas: "0x59682F00",
				},
			},
			Entrypoint: "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
			BundlerUrl: "https://bundler.example.com",
		})

		_, err := scheme.CreatePaymentPayload(context.Background(), makeClientRequirements())
		if err == nil {
			t.Fatal("expected error for signing failure")
		}
	})

	t.Run("entrypoint from requirements", func(t *testing.T) {
		scheme, _ := NewExactEvmSchemeERC4337(ExactEvmSchemeERC4337Config{
			Signer: &mockSigner{address: "0xSender", signature: "0xSig"},
			BundlerClient: &mockBundlerClient{
				prepareOp: &evm.UserOperation07Json{
					Sender:               "0xSender",
					Nonce:                "0x01",
					CallData:             "0xCallData",
					CallGasLimit:         "0x5208",
					VerificationGasLimit: "0x10000",
					PreVerificationGas:   "0x5000",
					MaxFeePerGas:         "0x3B9ACA00",
					MaxPriorityFeePerGas: "0x59682F00",
				},
			},
			BundlerUrl: "https://bundler.example.com",
			// No entrypoint in config — should come from requirements
		})

		payload, err := scheme.CreatePaymentPayload(context.Background(), makeClientRequirements())
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		erc4337Payload, _ := evm.Erc4337PayloadFromMap(payload.Payload)
		if erc4337Payload.EntryPoint != "0x0000000071727De22E5E9d8BAf0edAc6f37da032" {
			t.Errorf("EntryPoint = %q, want from requirements", erc4337Payload.EntryPoint)
		}
	})
}

func TestExactEvmSchemeERC4337_Scheme(t *testing.T) {
	scheme, err := NewExactEvmSchemeERC4337(ExactEvmSchemeERC4337Config{
		Signer:        &mockSigner{address: "0xSender", signature: "0xSig"},
		BundlerClient: &mockBundlerClient{},
		Entrypoint:    "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
		BundlerUrl:    "https://bundler.example.com",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if scheme.Scheme() != "exact" {
		t.Errorf("Scheme() = %q, want %q", scheme.Scheme(), "exact")
	}
}

func TestExactEvmSchemeERC4337_CreatePaymentPayload_MissingAmount(t *testing.T) {
	scheme, err := NewExactEvmSchemeERC4337(ExactEvmSchemeERC4337Config{
		Signer: &mockSigner{address: "0xSender", signature: "0xSig"},
		BundlerClient: &mockBundlerClient{
			prepareOp: &evm.UserOperation07Json{
				Sender: "0xSender",
				Nonce:  "0x01",
			},
		},
		Entrypoint: "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
		BundlerUrl: "https://bundler.example.com",
	})
	if err != nil {
		t.Fatalf("unexpected error creating scheme: %v", err)
	}

	requirements := makeClientRequirements()
	requirements.Amount = ""

	_, createErr := scheme.CreatePaymentPayload(context.Background(), requirements)
	if createErr == nil {
		t.Fatal("expected error for missing amount")
	}
}

func TestExactEvmSchemeERC4337_CreatePaymentPayload_EmptyAmount(t *testing.T) {
	scheme, err := NewExactEvmSchemeERC4337(ExactEvmSchemeERC4337Config{
		Signer: &mockSigner{address: "0xSender", signature: "0xSig"},
		BundlerClient: &mockBundlerClient{
			prepareOp: &evm.UserOperation07Json{
				Sender: "0xSender",
				Nonce:  "0x01",
			},
		},
		Entrypoint: "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
		BundlerUrl: "https://bundler.example.com",
	})
	if err != nil {
		t.Fatalf("unexpected error creating scheme: %v", err)
	}

	requirements := makeClientRequirements()
	requirements.Amount = ""

	_, createErr := scheme.CreatePaymentPayload(context.Background(), requirements)
	if createErr == nil {
		t.Fatal("expected error for empty amount")
	}

	pce, ok := createErr.(*PaymentCreationError)
	if !ok {
		t.Fatalf("expected *PaymentCreationError, got %T", createErr)
	}
	if pce.Phase != PhaseValidation {
		t.Errorf("Phase = %q, want %q", pce.Phase, PhaseValidation)
	}
}

func TestExactEvmSchemeERC4337_CreatePaymentPayload_InvalidAmount(t *testing.T) {
	scheme, err := NewExactEvmSchemeERC4337(ExactEvmSchemeERC4337Config{
		Signer: &mockSigner{address: "0xSender", signature: "0xSig"},
		BundlerClient: &mockBundlerClient{
			prepareOp: &evm.UserOperation07Json{
				Sender: "0xSender",
				Nonce:  "0x01",
			},
		},
		Entrypoint: "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
		BundlerUrl: "https://bundler.example.com",
	})
	if err != nil {
		t.Fatalf("unexpected error creating scheme: %v", err)
	}

	requirements := makeClientRequirements()
	requirements.Amount = "not-a-number"

	_, createErr := scheme.CreatePaymentPayload(context.Background(), requirements)
	if createErr == nil {
		t.Fatal("expected error for invalid amount")
	}

	pce, ok := createErr.(*PaymentCreationError)
	if !ok {
		t.Fatalf("expected *PaymentCreationError, got %T", createErr)
	}
	if pce.Phase != PhaseValidation {
		t.Errorf("Phase = %q, want %q", pce.Phase, PhaseValidation)
	}
}

func TestExactEvmSchemeERC4337_CreatePaymentPayload_NilBundlerClient(t *testing.T) {
	scheme, err := NewExactEvmSchemeERC4337(ExactEvmSchemeERC4337Config{
		Signer:     &mockSigner{address: "0xSender", signature: "0xSig"},
		Entrypoint: "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
		BundlerUrl: "https://bundler.example.com",
		// BundlerClient intentionally nil
	})
	if err != nil {
		t.Fatalf("unexpected error creating scheme: %v", err)
	}

	_, createErr := scheme.CreatePaymentPayload(context.Background(), makeClientRequirements())
	if createErr == nil {
		t.Fatal("expected error for nil bundler client")
	}

	pce, ok := createErr.(*PaymentCreationError)
	if !ok {
		t.Fatalf("expected *PaymentCreationError, got %T", createErr)
	}
	if pce.Phase != PhaseValidation {
		t.Errorf("Phase = %q, want %q", pce.Phase, PhaseValidation)
	}
}

func TestExactEvmSchemeERC4337_CreatePaymentPayload_BundlerUrlFromRequirements(t *testing.T) {
	// Config has no BundlerUrl; requirements.Extra has capability with BundlerUrl.
	scheme, err := NewExactEvmSchemeERC4337(ExactEvmSchemeERC4337Config{
		Signer: &mockSigner{address: "0xSender", signature: "0xSig"},
		BundlerClient: &mockBundlerClient{
			prepareOp: &evm.UserOperation07Json{
				Sender:               "0xSender",
				Nonce:                "0x01",
				CallData:             "0xCallData",
				CallGasLimit:         "0x5208",
				VerificationGasLimit: "0x10000",
				PreVerificationGas:   "0x5000",
				MaxFeePerGas:         "0x3B9ACA00",
				MaxPriorityFeePerGas: "0x59682F00",
			},
		},
		Entrypoint: "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
		// BundlerUrl intentionally empty
	})
	if err != nil {
		t.Fatalf("unexpected error creating scheme: %v", err)
	}

	requirements := makeClientRequirements()
	// requirements.Extra already has userOperation.bundlerUrl via makeClientRequirements()

	payload, createErr := scheme.CreatePaymentPayload(context.Background(), requirements)
	if createErr != nil {
		t.Fatalf("unexpected error: %v", createErr)
	}

	erc4337Payload, parseErr := evm.Erc4337PayloadFromMap(payload.Payload)
	if parseErr != nil {
		t.Fatalf("failed to parse payload: %v", parseErr)
	}
	if erc4337Payload.BundlerRpcUrl != "https://bundler.example.com" {
		t.Errorf("BundlerRpcUrl = %q, want %q (from requirements capability)", erc4337Payload.BundlerRpcUrl, "https://bundler.example.com")
	}
}

func TestExactEvmSchemeERC4337_CreatePaymentPayload_SigningErrorWithAACode(t *testing.T) {
	// Signer returns error with AA code string (e.g., "AA24 signature error").
	// Verify the PaymentCreationError has PhaseSigning and the parsed AA code reason.
	scheme, err := NewExactEvmSchemeERC4337(ExactEvmSchemeERC4337Config{
		Signer: &mockSigner{
			address: "0xSender",
			signErr: fmt.Errorf("AA24 signature error"),
		},
		BundlerClient: &mockBundlerClient{
			prepareOp: &evm.UserOperation07Json{
				Sender:               "0xSender",
				Nonce:                "0x01",
				CallData:             "0xCallData",
				CallGasLimit:         "0x5208",
				VerificationGasLimit: "0x10000",
				PreVerificationGas:   "0x5000",
				MaxFeePerGas:         "0x3B9ACA00",
				MaxPriorityFeePerGas: "0x59682F00",
			},
		},
		Entrypoint: "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
		BundlerUrl: "https://bundler.example.com",
	})
	if err != nil {
		t.Fatalf("unexpected error creating scheme: %v", err)
	}

	_, createErr := scheme.CreatePaymentPayload(context.Background(), makeClientRequirements())
	if createErr == nil {
		t.Fatal("expected error for signing failure with AA code")
	}

	pce, ok := createErr.(*PaymentCreationError)
	if !ok {
		t.Fatalf("expected *PaymentCreationError, got %T", createErr)
	}
	if pce.Phase != PhaseSigning {
		t.Errorf("Phase = %q, want %q", pce.Phase, PhaseSigning)
	}
	// The AA24 code should be parsed, and reason should be the human-readable AA message
	if pce.Reason != "Signature validation failed" {
		t.Errorf("Reason = %q, want %q", pce.Reason, "Signature validation failed")
	}
}

func TestExactEvmSchemeERC4337_CreatePaymentPayload_PreparationErrorNoAACode(t *testing.T) {
	// Preparation fails with a non-AA error.
	// Verify PaymentCreationError has PhasePreparation and no AA code.
	scheme, err := NewExactEvmSchemeERC4337(ExactEvmSchemeERC4337Config{
		Signer: &mockSigner{address: "0xSender", signature: "0xSig"},
		BundlerClient: &mockBundlerClient{
			prepareErr: fmt.Errorf("network timeout"),
		},
		Entrypoint: "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
		BundlerUrl: "https://bundler.example.com",
	})
	if err != nil {
		t.Fatalf("unexpected error creating scheme: %v", err)
	}

	_, createErr := scheme.CreatePaymentPayload(context.Background(), makeClientRequirements())
	if createErr == nil {
		t.Fatal("expected error for preparation failure")
	}

	pce, ok := createErr.(*PaymentCreationError)
	if !ok {
		t.Fatalf("expected *PaymentCreationError, got %T", createErr)
	}
	if pce.Phase != PhasePreparation {
		t.Errorf("Phase = %q, want %q", pce.Phase, PhasePreparation)
	}
	// No AA code in "network timeout", so reason should be the raw error message
	if pce.Reason != "network timeout" {
		t.Errorf("Reason = %q, want %q", pce.Reason, "network timeout")
	}
}

func TestExactEvmSchemeERC4337_CreatePaymentPayload_PreparationErrorWithAACode(t *testing.T) {
	// Preparation fails with an AA error.
	// Verify PaymentCreationError has PhasePreparation and the parsed AA reason.
	scheme, err := NewExactEvmSchemeERC4337(ExactEvmSchemeERC4337Config{
		Signer: &mockSigner{address: "0xSender", signature: "0xSig"},
		BundlerClient: &mockBundlerClient{
			prepareErr: fmt.Errorf("AA21 insufficient funds"),
		},
		Entrypoint: "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
		BundlerUrl: "https://bundler.example.com",
	})
	if err != nil {
		t.Fatalf("unexpected error creating scheme: %v", err)
	}

	_, createErr := scheme.CreatePaymentPayload(context.Background(), makeClientRequirements())
	if createErr == nil {
		t.Fatal("expected error for preparation failure with AA code")
	}

	pce, ok := createErr.(*PaymentCreationError)
	if !ok {
		t.Fatalf("expected *PaymentCreationError, got %T", createErr)
	}
	if pce.Phase != PhasePreparation {
		t.Errorf("Phase = %q, want %q", pce.Phase, PhasePreparation)
	}
	if pce.Reason != "Insufficient funds for gas prefund" {
		t.Errorf("Reason = %q, want %q", pce.Reason, "Insufficient funds for gas prefund")
	}
}

func TestParseAAError(t *testing.T) {
	t.Run("found AA21", func(t *testing.T) {
		result := ParseAAErrorString("UserOperation reverted during simulation with reason: AA21 didn't pay prefund")
		if result == nil {
			t.Fatal("expected result, got nil")
		}
		if result.Code != "AA21" {
			t.Errorf("Code = %q, want %q", result.Code, "AA21")
		}
		if result.Reason != "Insufficient funds for gas prefund" {
			t.Errorf("Reason = %q, want %q", result.Reason, "Insufficient funds for gas prefund")
		}
	})

	t.Run("found AA24", func(t *testing.T) {
		result := ParseAAErrorString("AA24 signature error")
		if result == nil {
			t.Fatal("expected result, got nil")
		}
		if result.Code != "AA24" {
			t.Errorf("Code = %q, want %q", result.Code, "AA24")
		}
	})

	t.Run("no AA code", func(t *testing.T) {
		result := ParseAAErrorString("some generic error")
		if result != nil {
			t.Errorf("expected nil, got %v", result)
		}
	})

	t.Run("nil error", func(t *testing.T) {
		result := ParseAAError(nil)
		if result != nil {
			t.Errorf("expected nil, got %v", result)
		}
	})
}
