package evm

import (
	"fmt"
	"strconv"
	"strings"
)

// ERC4337ChainInfo contains information about an ERC-4337 supported chain.
type ERC4337ChainInfo struct {
	ChainID                    int
	Name                       string
	V1Name                     string
	CAIP2                      string
	RpcUrl                     string
	BlockExplorerUrl           string
	UsdcAddress                string
	SafeTransactionServiceUrl  string
	Testnet                    bool
}

// ERC4337SupportedChains maps chain IDs to their chain info.
var ERC4337SupportedChains = map[int]*ERC4337ChainInfo{
	8453: {
		ChainID:                   8453,
		Name:                      "Base",
		V1Name:                    "base",
		CAIP2:                     "eip155:8453",
		RpcUrl:                    "https://mainnet.base.org",
		BlockExplorerUrl:          "https://basescan.org",
		UsdcAddress:               "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
		SafeTransactionServiceUrl: "https://safe-transaction-base.safe.global",
		Testnet:                   false,
	},
	84532: {
		ChainID:                   84532,
		Name:                      "Base Sepolia",
		V1Name:                    "base-sepolia",
		CAIP2:                     "eip155:84532",
		RpcUrl:                    "https://sepolia.base.org",
		BlockExplorerUrl:          "https://sepolia.basescan.org",
		UsdcAddress:               "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
		SafeTransactionServiceUrl: "https://safe-transaction-base-sepolia.safe.global",
		Testnet:                   true,
	},
	10: {
		ChainID:                   10,
		Name:                      "Optimism",
		V1Name:                    "optimism",
		CAIP2:                     "eip155:10",
		RpcUrl:                    "https://mainnet.optimism.io",
		BlockExplorerUrl:          "https://optimistic.etherscan.io",
		UsdcAddress:               "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
		SafeTransactionServiceUrl: "https://safe-transaction-optimism.safe.global",
		Testnet:                   false,
	},
	11155420: {
		ChainID:                   11155420,
		Name:                      "Optimism Sepolia",
		V1Name:                    "optimism-sepolia",
		CAIP2:                     "eip155:11155420",
		RpcUrl:                    "https://sepolia.optimism.io",
		BlockExplorerUrl:          "https://sepolia-optimistic.etherscan.io",
		UsdcAddress:               "0x5fd84259d66Cd46123540766Be93DFE6D43130D7",
		SafeTransactionServiceUrl: "",
		Testnet:                   true,
	},
	42161: {
		ChainID:                   42161,
		Name:                      "Arbitrum One",
		V1Name:                    "arbitrum",
		CAIP2:                     "eip155:42161",
		RpcUrl:                    "https://arb1.arbitrum.io/rpc",
		BlockExplorerUrl:          "https://arbiscan.io",
		UsdcAddress:               "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
		SafeTransactionServiceUrl: "https://safe-transaction-arbitrum.safe.global",
		Testnet:                   false,
	},
	421614: {
		ChainID:                   421614,
		Name:                      "Arbitrum Sepolia",
		V1Name:                    "arbitrum-sepolia",
		CAIP2:                     "eip155:421614",
		RpcUrl:                    "https://sepolia-rollup.arbitrum.io/rpc",
		BlockExplorerUrl:          "https://sepolia.arbiscan.io",
		UsdcAddress:               "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
		SafeTransactionServiceUrl: "",
		Testnet:                   true,
	},
}

// erc4337V1NameIndex maps v1 names to chain info.
var erc4337V1NameIndex map[string]*ERC4337ChainInfo

func init() {
	erc4337V1NameIndex = make(map[string]*ERC4337ChainInfo, len(ERC4337SupportedChains))
	for _, chain := range ERC4337SupportedChains {
		erc4337V1NameIndex[chain.V1Name] = chain
	}
}

// GetERC4337Chain returns the chain info for a given chain ID.
// Returns nil if the chain is not supported.
func GetERC4337Chain(chainID int) *ERC4337ChainInfo {
	return ERC4337SupportedChains[chainID]
}

// IsERC4337Supported checks if a chain ID is in the ERC-4337 supported chains registry.
func IsERC4337Supported(chainID int) bool {
	_, ok := ERC4337SupportedChains[chainID]
	return ok
}

// ResolveERC4337ChainId resolves a network input (CAIP-2 string, v1 name, or numeric string)
// to a numeric chain ID in the ERC-4337 registry.
func ResolveERC4337ChainId(network string) (int, error) {
	// Try CAIP-2 format (eip155:CHAIN_ID)
	if strings.HasPrefix(network, "eip155:") {
		parts := strings.SplitN(network, ":", 2)
		if len(parts) != 2 {
			return 0, fmt.Errorf("invalid CAIP-2 identifier: %s", network)
		}
		chainID, err := strconv.Atoi(parts[1])
		if err != nil {
			return 0, fmt.Errorf("invalid CAIP-2 chain ID: %s", network)
		}
		return chainID, nil
	}

	// Try v1 name
	if chain, ok := erc4337V1NameIndex[network]; ok {
		return chain.ChainID, nil
	}

	// Try numeric
	chainID, err := strconv.Atoi(network)
	if err != nil {
		return 0, fmt.Errorf("unknown network: %s. Expected CAIP-2 (eip155:chainId), a known v1 name, or a numeric chain ID", network)
	}
	return chainID, nil
}
