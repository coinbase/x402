package evm

import (
	"math/big"
)

const (
	// Scheme identifier
	SchemeExact = "exact"

	// Default token decimals for USDC
	DefaultDecimals = 6

	// EIP-3009 function names
	FunctionTransferWithAuthorization = "transferWithAuthorization"
	FunctionReceiveWithAuthorization  = "receiveWithAuthorization"
	FunctionAuthorizationState        = "authorizationState"

	// Transaction status
	TxStatusSuccess = 1
	TxStatusFailed  = 0

	// Default validity period (1 hour)
	DefaultValidityPeriod = 3600 // seconds

	// ERC-6492 magic value (last 32 bytes of wrapped signature)
	// This is bytes32(uint256(keccak256("erc6492.invalid.signature")) - 1)
	ERC6492MagicValue = "0x6492649264926492649264926492649264926492649264926492649264926492"

	// EIP-1271 magic value (returned by isValidSignature on success)
	EIP1271MagicValue = "0x1626ba7e"

	// Error codes matching TypeScript implementation
	ErrInvalidSignature            = "invalid_exact_evm_payload_signature"
	ErrUndeployedSmartWallet       = "invalid_exact_evm_payload_undeployed_smart_wallet"
	ErrSmartWalletDeploymentFailed = "smart_wallet_deployment_failed"
)

var (
	// Network chain IDs
	ChainIDGateLayerTestnet = big.NewInt(10087) // Gate Layer Testnet chain ID (0x2767)

	// Network configurations
	// See DEFAULT_ASSET.md for guidelines on adding new chains
	//
	// Default Asset Selection Policy:
	// - Each chain has the right to determine its own default stablecoin
	// - If the chain has officially endorsed a stablecoin, that asset should be used
	// - If no official stance exists, the chain team should make the selection
	//
	// NOTE: Currently only EIP-3009 supporting stablecoins can be used.
	// Generic ERC-20 support via EIP-2612/Permit2 is planned but not yet implemented.
	NetworkConfigs = map[string]NetworkConfig{
		// Gate Layer Testnet
		"gatelayer_testnet": {
			ChainID: ChainIDGateLayerTestnet,
			DefaultAsset: AssetInfo{
				Address:  "0x9be8Df37C788B244cFc28E46654aD5Ec28a880AF", // USDC on Gate Layer Testnet
				Name:     "USDC",
				Version:  "2",
				Decimals: DefaultDecimals,
			},
		},
		// Gate Layer Testnet (CAIP-2 format)
		"eip155:10087": {
			ChainID: ChainIDGateLayerTestnet,
			DefaultAsset: AssetInfo{
				Address:  "0x9be8Df37C788B244cFc28E46654aD5Ec28a880AF", // USDC on Gate Layer Testnet
				Name:     "USDC",
				Version:  "2",
				Decimals: DefaultDecimals,
			},
		},
	}

	// EIP-3009 ABI for transferWithAuthorization with v,r,s (EOA signatures)
	TransferWithAuthorizationVRSABI = []byte(`[
		{
			"inputs": [
				{"name": "from", "type": "address"},
				{"name": "to", "type": "address"},
				{"name": "value", "type": "uint256"},
				{"name": "validAfter", "type": "uint256"},
				{"name": "validBefore", "type": "uint256"},
				{"name": "nonce", "type": "bytes32"},
				{"name": "v", "type": "uint8"},
				{"name": "r", "type": "bytes32"},
				{"name": "s", "type": "bytes32"}
			],
			"name": "transferWithAuthorization",
			"outputs": [],
			"stateMutability": "nonpayable",
			"type": "function"
		}
	]`)

	// EIP-3009 ABI for transferWithAuthorization with bytes signature (smart wallets)
	TransferWithAuthorizationBytesABI = []byte(`[
		{
			"inputs": [
				{"name": "from", "type": "address"},
				{"name": "to", "type": "address"},
				{"name": "value", "type": "uint256"},
				{"name": "validAfter", "type": "uint256"},
				{"name": "validBefore", "type": "uint256"},
				{"name": "nonce", "type": "bytes32"},
				{"name": "signature", "type": "bytes"}
			],
			"name": "transferWithAuthorization",
			"outputs": [],
			"stateMutability": "nonpayable",
			"type": "function"
		}
	]`)

	// Legacy: Combined ABI (deprecated, use specific ABIs above)
	TransferWithAuthorizationABI = TransferWithAuthorizationVRSABI

	// ABI for authorizationState check
	AuthorizationStateABI = []byte(`[
		{
			"inputs": [
				{"name": "authorizer", "type": "address"},
				{"name": "nonce", "type": "bytes32"}
			],
			"name": "authorizationState",
			"outputs": [{"name": "", "type": "bool"}],
			"stateMutability": "view",
			"type": "function"
		}
	]`)
)
