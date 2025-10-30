package evm

import (
	"math/big"
)

// ExactEIP3009Authorization represents the EIP-3009 TransferWithAuthorization data
type ExactEIP3009Authorization struct {
	From        string `json:"from"`        // Ethereum address (hex)
	To          string `json:"to"`          // Ethereum address (hex)
	Value       string `json:"value"`       // Amount in wei as string
	ValidAfter  string `json:"validAfter"`  // Unix timestamp as string
	ValidBefore string `json:"validBefore"` // Unix timestamp as string
	Nonce       string `json:"nonce"`       // 32-byte nonce as hex string
}

// ExactEIP3009Payload represents the exact payment payload for EVM networks
type ExactEIP3009Payload struct {
	Signature     string                    `json:"signature,omitempty"`
	Authorization ExactEIP3009Authorization `json:"authorization"`
}

// ExactEvmPayloadV1 is an alias for ExactEIP3009Payload (v1 compatibility)
type ExactEvmPayloadV1 = ExactEIP3009Payload

// ExactEvmPayloadV2 is an alias for ExactEIP3009Payload (v2 compatibility)
type ExactEvmPayloadV2 = ExactEIP3009Payload

// ClientEvmSigner defines the interface for client-side EVM signing operations
type ClientEvmSigner interface {
	// Address returns the signer's Ethereum address
	Address() string

	// SignTypedData signs EIP-712 typed data
	SignTypedData(domain TypedDataDomain, types map[string][]TypedDataField, primaryType string, message map[string]interface{}) ([]byte, error)
}

// FacilitatorEvmSigner defines the interface for facilitator EVM operations
type FacilitatorEvmSigner interface {
	// ReadContract reads data from a smart contract
	ReadContract(address string, abi []byte, functionName string, args ...interface{}) (interface{}, error)

	// VerifyTypedData verifies an EIP-712 signature
	VerifyTypedData(address string, domain TypedDataDomain, types map[string][]TypedDataField, primaryType string, message map[string]interface{}, signature []byte) (bool, error)

	// WriteContract executes a smart contract transaction
	WriteContract(address string, abi []byte, functionName string, args ...interface{}) (string, error)

	// WaitForTransactionReceipt waits for a transaction to be mined
	WaitForTransactionReceipt(txHash string) (*TransactionReceipt, error)

	// GetBalance gets the balance of an address for a specific token
	GetBalance(address string, tokenAddress string) (*big.Int, error)

	// GetChainID returns the chain ID of the connected network
	GetChainID() (*big.Int, error)
}

// TypedDataDomain represents the EIP-712 domain separator
type TypedDataDomain struct {
	Name              string   `json:"name"`
	Version           string   `json:"version"`
	ChainID           *big.Int `json:"chainId"`
	VerifyingContract string   `json:"verifyingContract"`
}

// TypedDataField represents a field in EIP-712 typed data
type TypedDataField struct {
	Name string `json:"name"`
	Type string `json:"type"`
}

// TransactionReceipt represents the receipt of a mined transaction
type TransactionReceipt struct {
	Status      uint64 `json:"status"`
	BlockNumber uint64 `json:"blockNumber"`
	TxHash      string `json:"transactionHash"`
}

// AssetInfo contains information about an ERC20 token
type AssetInfo struct {
	Address  string
	Name     string
	Version  string
	Decimals int
}

// NetworkConfig contains network-specific configuration
type NetworkConfig struct {
	ChainID         *big.Int
	DefaultAsset    AssetInfo
	SupportedAssets map[string]AssetInfo // symbol -> AssetInfo
}

// PayloadToMap converts an ExactEIP3009Payload to a map for JSON marshaling
func (p *ExactEIP3009Payload) ToMap() map[string]interface{} {
	result := map[string]interface{}{
		"authorization": map[string]interface{}{
			"from":        p.Authorization.From,
			"to":          p.Authorization.To,
			"value":       p.Authorization.Value,
			"validAfter":  p.Authorization.ValidAfter,
			"validBefore": p.Authorization.ValidBefore,
			"nonce":       p.Authorization.Nonce,
		},
	}
	if p.Signature != "" {
		result["signature"] = p.Signature
	}
	return result
}

// PayloadFromMap creates an ExactEIP3009Payload from a map
func PayloadFromMap(data map[string]interface{}) (*ExactEIP3009Payload, error) {
	payload := &ExactEIP3009Payload{}

	if sig, ok := data["signature"].(string); ok {
		payload.Signature = sig
	}

	if auth, ok := data["authorization"].(map[string]interface{}); ok {
		if from, ok := auth["from"].(string); ok {
			payload.Authorization.From = from
		}
		if to, ok := auth["to"].(string); ok {
			payload.Authorization.To = to
		}
		if value, ok := auth["value"].(string); ok {
			payload.Authorization.Value = value
		}
		if validAfter, ok := auth["validAfter"].(string); ok {
			payload.Authorization.ValidAfter = validAfter
		}
		if validBefore, ok := auth["validBefore"].(string); ok {
			payload.Authorization.ValidBefore = validBefore
		}
		if nonce, ok := auth["nonce"].(string); ok {
			payload.Authorization.Nonce = nonce
		}
	}

	return payload, nil
}

// IsValidNetwork checks if the network is supported for EVM
func IsValidNetwork(network string) bool {
	switch network {
	case "eip155:1", "eip155:8453", "eip155:84532", "base", "base-sepolia", "base-mainnet":
		return true
	default:
		return false
	}
}
