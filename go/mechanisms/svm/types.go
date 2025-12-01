package svm

import (
	"context"
	"encoding/json"
	"fmt"

	solana "github.com/gagliardetto/solana-go"
	"github.com/gagliardetto/solana-go/rpc"
)

// ExactSvmPayload represents a SVM (Solana) payment payload
type ExactSvmPayload struct {
	Transaction string `json:"transaction"` // Base64 encoded Solana transaction
}

// ExactSvmPayloadV1 - alias for v1 compatibility
type ExactSvmPayloadV1 = ExactSvmPayload

// ExactSvmPayloadV2 - alias for v2 (currently identical, reserved for future)
type ExactSvmPayloadV2 = ExactSvmPayload

// ClientSvmSigner defines client-side operations
type ClientSvmSigner interface {
	// Address returns the signer's Solana address (base58)
	Address() solana.PublicKey

	// SignTransaction signs a Solana transaction
	SignTransaction(ctx context.Context, tx *solana.Transaction) error
}

// FacilitatorSvmSigner defines facilitator operations
type FacilitatorSvmSigner interface {
	// GetRPC returns an RPC client for the given network
	GetRPC(ctx context.Context, network string) (*rpc.Client, error)

	// SignTransaction signs a transaction with facilitator's key
	SignTransaction(ctx context.Context, tx *solana.Transaction, network string) error

	// SendTransaction sends a signed transaction
	SendTransaction(ctx context.Context, tx *solana.Transaction, network string) (solana.Signature, error)

	// ConfirmTransaction waits for transaction confirmation
	ConfirmTransaction(ctx context.Context, signature solana.Signature, network string) error

	// GetAddress returns the facilitator's address for a network
	GetAddress(ctx context.Context, network string) solana.PublicKey
}

// AssetInfo contains information about a SPL token
type AssetInfo struct {
	Address  string // Mint address
	Symbol   string // Token symbol (e.g., "USDC")
	Decimals int    // Token decimals
}

// NetworkConfig contains network-specific configuration
type NetworkConfig struct {
	Name            string               // Network name
	CAIP2           string               // CAIP-2 identifier
	RPCURL          string               // Default RPC URL
	DefaultAsset    AssetInfo            // Default token (USDC)
	SupportedAssets map[string]AssetInfo // Symbol -> AssetInfo
}

// ClientConfig contains optional client configuration
type ClientConfig struct {
	RPCURL string // Custom RPC URL
}

// ToMap converts an ExactSvmPayload to a map for JSON marshaling
func (p *ExactSvmPayload) ToMap() map[string]interface{} {
	return map[string]interface{}{
		"transaction": p.Transaction,
	}
}

// PayloadFromMap creates an ExactSvmPayload from a map
func PayloadFromMap(data map[string]interface{}) (*ExactSvmPayload, error) {
	// Try to convert to JSON and back for type safety
	jsonBytes, err := json.Marshal(data)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal payload data: %w", err)
	}

	var payload ExactSvmPayload
	if err := json.Unmarshal(jsonBytes, &payload); err != nil {
		return nil, fmt.Errorf("failed to unmarshal payload: %w", err)
	}

	if payload.Transaction == "" {
		return nil, fmt.Errorf("missing transaction field in payload")
	}

	return &payload, nil
}

// IsValidNetwork checks if the network is supported for Solana
func IsValidNetwork(network string) bool {
	// Check CAIP-2 format
	if _, ok := NetworkConfigs[network]; ok {
		return true
	}

	// Check V1 format
	if _, ok := V1ToV2NetworkMap[network]; ok {
		return true
	}

	return false
}
