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

	// Permit2 function names
	FunctionSettle = "settle"

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

	// Permit2 constants
	// PERMIT2Address is the canonical Uniswap Permit2 contract address.
	// Same address on all EVM chains via CREATE2 deployment.
	PERMIT2Address = "0x000000000022D473030F116dDEE9F6B43aC78BA3"

	// X402ExactPermit2ProxyAddress is the x402 exact payment proxy.
	// Vanity address: 0x4020...0001 for easy recognition.
	X402ExactPermit2ProxyAddress = "0x4020615294c913F045dc10f0a5cdEbd86c280001"

	// X402UptoPermit2ProxyAddress is the x402 upto payment proxy.
	// Vanity address: 0x4020...0002 for easy recognition.
	X402UptoPermit2ProxyAddress = "0x4020633461b2895a48930Ff97eE8fCdE8E520002"

	// Permit2DeadlineBuffer is the time buffer (in seconds) added when checking
	// deadline expiration to account for block propagation time.
	Permit2DeadlineBuffer = 6

	// Permit2 error codes
	ErrPermit2AllowanceRequired      = "permit2_allowance_required"
	ErrPermit2InvalidSpender         = "invalid_permit2_spender"
	ErrPermit2RecipientMismatch      = "invalid_permit2_recipient_mismatch"
	ErrPermit2DeadlineExpired        = "permit2_deadline_expired"
	ErrPermit2NotYetValid            = "permit2_not_yet_valid"
	ErrPermit2InsufficientAmount     = "permit2_insufficient_amount"
	ErrPermit2TokenMismatch          = "permit2_token_mismatch"
	ErrPermit2InvalidSignature       = "invalid_permit2_signature"
	ErrPermit2AmountExceedsPermitted = "permit2_amount_exceeds_permitted"
	ErrPermit2InvalidDestination     = "permit2_invalid_destination"
	ErrPermit2InvalidOwner           = "permit2_invalid_owner"
	ErrPermit2PaymentTooEarly        = "permit2_payment_too_early"
	ErrPermit2InvalidNonce           = "permit2_invalid_nonce"
	ErrUnsupportedPayloadType        = "unsupported_payload_type"
)

var (
	// Network chain IDs
	ChainIDBase        = big.NewInt(8453)
	ChainIDBaseSepolia = big.NewInt(84532)

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
		// Base Mainnet
		"eip155:8453": {
			ChainID: ChainIDBase,
			DefaultAsset: AssetInfo{
				Address:  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC on Base
				Name:     "USD Coin",
				Version:  "2",
				Decimals: DefaultDecimals,
			},
		},
		// Base Mainnet (legacy v1 format)
		"base": {
			ChainID: ChainIDBase,
			DefaultAsset: AssetInfo{
				Address:  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
				Name:     "USD Coin",
				Version:  "2",
				Decimals: DefaultDecimals,
			},
		},
		// Base Sepolia Testnet
		"eip155:84532": {
			ChainID: ChainIDBaseSepolia,
			DefaultAsset: AssetInfo{
				Address:  "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // USDC on Base Sepolia
				Name:     "USDC",
				Version:  "2",
				Decimals: DefaultDecimals,
			},
		},
		// Base Sepolia Testnet (legacy v1 format)
		"base-sepolia": {
			ChainID: ChainIDBaseSepolia,
			DefaultAsset: AssetInfo{
				Address:  "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
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

	// ERC20AllowanceABI for checking Permit2 approval
	ERC20AllowanceABI = []byte(`[
		{
			"inputs": [
				{"name": "owner", "type": "address"},
				{"name": "spender", "type": "address"}
			],
			"name": "allowance",
			"outputs": [{"name": "", "type": "uint256"}],
			"stateMutability": "view",
			"type": "function"
		}
	]`)

	// ERC20ApproveABI for approving Permit2
	ERC20ApproveABI = []byte(`[
		{
			"inputs": [
				{"name": "spender", "type": "address"},
				{"name": "amount", "type": "uint256"}
			],
			"name": "approve",
			"outputs": [{"name": "", "type": "bool"}],
			"stateMutability": "nonpayable",
			"type": "function"
		}
	]`)

	// ERC20BalanceOfABI for checking token balance
	ERC20BalanceOfABI = []byte(`[
		{
			"inputs": [
				{"name": "account", "type": "address"}
			],
			"name": "balanceOf",
			"outputs": [{"name": "", "type": "uint256"}],
			"stateMutability": "view",
			"type": "function"
		}
	]`)

	// X402ExactPermit2ProxySettleABI for calling settle on x402ExactPermit2Proxy
	X402ExactPermit2ProxySettleABI = []byte(`[
		{
			"type": "function",
			"name": "settle",
			"inputs": [
				{
					"name": "permit",
					"type": "tuple",
					"components": [
						{
							"name": "permitted",
							"type": "tuple",
							"components": [
								{"name": "token", "type": "address"},
								{"name": "amount", "type": "uint256"}
							]
						},
						{"name": "nonce", "type": "uint256"},
						{"name": "deadline", "type": "uint256"}
					]
				},
				{"name": "owner", "type": "address"},
				{
					"name": "witness",
					"type": "tuple",
					"components": [
						{"name": "to", "type": "address"},
						{"name": "validAfter", "type": "uint256"},
						{"name": "extra", "type": "bytes"}
					]
				},
				{"name": "signature", "type": "bytes"}
			],
			"outputs": [],
			"stateMutability": "nonpayable"
		}
	]`)

	// EIP712DomainTypes defines the standard EIP-712 domain type for Permit2.
	// Permit2 uses name + chainId + verifyingContract (no version field).
	EIP712DomainTypes = []TypedDataField{
		{Name: "name", Type: "string"},
		{Name: "chainId", Type: "uint256"},
		{Name: "verifyingContract", Type: "address"},
	}

	// Permit2WitnessTypes defines the EIP-712 types for Permit2 with witness.
	// Field order MUST match the on-chain Permit2 contract and TypeScript implementation.
	Permit2WitnessTypes = map[string][]TypedDataField{
		"PermitWitnessTransferFrom": {
			{Name: "permitted", Type: "TokenPermissions"},
			{Name: "spender", Type: "address"},
			{Name: "nonce", Type: "uint256"},
			{Name: "deadline", Type: "uint256"},
			{Name: "witness", Type: "Witness"},
		},
		"TokenPermissions": {
			{Name: "token", Type: "address"},
			{Name: "amount", Type: "uint256"},
		},
		"Witness": {
			{Name: "to", Type: "address"},
			{Name: "validAfter", Type: "uint256"},
			{Name: "extra", Type: "bytes"},
		},
	}
)

// GetPermit2EIP712Types returns the complete EIP-712 types map for Permit2 signing.
// This combines the EIP712Domain with the Permit2-specific types.
// Use this function instead of defining types locally to ensure consistency.
func GetPermit2EIP712Types() map[string][]TypedDataField {
	return map[string][]TypedDataField{
		"EIP712Domain":              EIP712DomainTypes,
		"PermitWitnessTransferFrom": Permit2WitnessTypes["PermitWitnessTransferFrom"],
		"TokenPermissions":          Permit2WitnessTypes["TokenPermissions"],
		"Witness":                   Permit2WitnessTypes["Witness"],
	}
}
