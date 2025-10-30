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
)

var (
	// Network chain IDs
	ChainIDMainnet     = big.NewInt(1)
	ChainIDBase        = big.NewInt(8453)
	ChainIDBaseSepolia = big.NewInt(84532)

	// Network configurations
	NetworkConfigs = map[string]NetworkConfig{
		"eip155:1": {
			ChainID: ChainIDMainnet,
			DefaultAsset: AssetInfo{
				Address:  "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC on Ethereum mainnet
				Name:     "USD Coin",
				Version:  "2",
				Decimals: DefaultDecimals,
			},
			SupportedAssets: map[string]AssetInfo{
				"USDC": {
					Address:  "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
					Name:     "USD Coin",
					Version:  "2",
					Decimals: DefaultDecimals,
				},
			},
		},
		"eip155:8453": {
			ChainID: ChainIDBase,
			DefaultAsset: AssetInfo{
				Address:  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC on Base
				Name:     "USD Coin",
				Version:  "2",
				Decimals: DefaultDecimals,
			},
			SupportedAssets: map[string]AssetInfo{
				"USDC": {
					Address:  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
					Name:     "USD Coin",
					Version:  "2",
					Decimals: DefaultDecimals,
				},
			},
		},
		"base": {
			ChainID: ChainIDBase,
			DefaultAsset: AssetInfo{
				Address:  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
				Name:     "USD Coin",
				Version:  "2",
				Decimals: DefaultDecimals,
			},
			SupportedAssets: map[string]AssetInfo{
				"USDC": {
					Address:  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
					Name:     "USD Coin",
					Version:  "2",
					Decimals: DefaultDecimals,
				},
			},
		},
		"base-mainnet": {
			ChainID: ChainIDBase,
			DefaultAsset: AssetInfo{
				Address:  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
				Name:     "USD Coin",
				Version:  "2",
				Decimals: DefaultDecimals,
			},
			SupportedAssets: map[string]AssetInfo{
				"USDC": {
					Address:  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
					Name:     "USD Coin",
					Version:  "2",
					Decimals: DefaultDecimals,
				},
			},
		},
		"eip155:84532": {
			ChainID: ChainIDBaseSepolia,
			DefaultAsset: AssetInfo{
				Address:  "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // USDC on Base Sepolia
				Name:     "USD Coin",
				Version:  "2",
				Decimals: DefaultDecimals,
			},
			SupportedAssets: map[string]AssetInfo{
				"USDC": {
					Address:  "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
					Name:     "USD Coin",
					Version:  "2",
					Decimals: DefaultDecimals,
				},
			},
		},
		"base-sepolia": {
			ChainID: ChainIDBaseSepolia,
			DefaultAsset: AssetInfo{
				Address:  "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
				Name:     "USD Coin",
				Version:  "2",
				Decimals: DefaultDecimals,
			},
			SupportedAssets: map[string]AssetInfo{
				"USDC": {
					Address:  "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
					Name:     "USD Coin",
					Version:  "2",
					Decimals: DefaultDecimals,
				},
			},
		},
	}

	// EIP-3009 ABI for transferWithAuthorization
	TransferWithAuthorizationABI = []byte(`[
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
		},
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
