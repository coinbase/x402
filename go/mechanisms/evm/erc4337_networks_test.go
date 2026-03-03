package evm

import (
	"fmt"
	"testing"
)

func TestGetERC4337Chain(t *testing.T) {
	tests := []struct {
		name    string
		chainID int
		want    string
		isNil   bool
	}{
		{"Base", 8453, "Base", false},
		{"Base Sepolia", 84532, "Base Sepolia", false},
		{"Optimism", 10, "Optimism", false},
		{"Optimism Sepolia", 11155420, "Optimism Sepolia", false},
		{"Arbitrum One", 42161, "Arbitrum One", false},
		{"Arbitrum Sepolia", 421614, "Arbitrum Sepolia", false},
		{"Unknown chain", 999999, "", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			chain := GetERC4337Chain(tt.chainID)
			if tt.isNil {
				if chain != nil {
					t.Errorf("expected nil, got %v", chain)
				}
				return
			}
			if chain == nil {
				t.Fatalf("expected chain, got nil")
			}
			if chain.Name != tt.want {
				t.Errorf("Name = %q, want %q", chain.Name, tt.want)
			}
			if chain.ChainID != tt.chainID {
				t.Errorf("ChainID = %d, want %d", chain.ChainID, tt.chainID)
			}
		})
	}
}

func TestIsERC4337Supported(t *testing.T) {
	if !IsERC4337Supported(8453) {
		t.Error("expected Base (8453) to be supported")
	}
	if !IsERC4337Supported(84532) {
		t.Error("expected Base Sepolia (84532) to be supported")
	}
	if IsERC4337Supported(999999) {
		t.Error("expected chain 999999 to not be supported")
	}
}

func TestResolveERC4337ChainId(t *testing.T) {
	tests := []struct {
		name    string
		network string
		want    int
		wantErr bool
	}{
		{"CAIP-2 Base", "eip155:8453", 8453, false},
		{"CAIP-2 Base Sepolia", "eip155:84532", 84532, false},
		{"CAIP-2 Optimism", "eip155:10", 10, false},
		{"CAIP-2 Arbitrum", "eip155:42161", 42161, false},
		{"v1 name base", "base", 8453, false},
		{"v1 name base-sepolia", "base-sepolia", 84532, false},
		{"v1 name optimism", "optimism", 10, false},
		{"v1 name optimism-sepolia", "optimism-sepolia", 11155420, false},
		{"v1 name arbitrum", "arbitrum", 42161, false},
		{"v1 name arbitrum-sepolia", "arbitrum-sepolia", 421614, false},
		{"numeric string", "8453", 8453, false},
		{"unknown name", "unknown-chain", 0, true},
		{"invalid CAIP-2", "eip155:abc", 0, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ResolveERC4337ChainId(tt.network)
			if tt.wantErr {
				if err == nil {
					t.Errorf("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tt.want {
				t.Errorf("ResolveERC4337ChainId(%q) = %d, want %d", tt.network, got, tt.want)
			}
		})
	}
}

func TestERC4337ChainInfo_OptimismFields(t *testing.T) {
	chain := GetERC4337Chain(10)
	if chain == nil {
		t.Fatal("expected Optimism chain info")
	}

	if chain.CAIP2 != "eip155:10" {
		t.Errorf("CAIP2 = %q, want %q", chain.CAIP2, "eip155:10")
	}
	if chain.RpcUrl != "https://mainnet.optimism.io" {
		t.Errorf("RpcUrl = %q, want %q", chain.RpcUrl, "https://mainnet.optimism.io")
	}
	if chain.BlockExplorerUrl != "https://optimistic.etherscan.io" {
		t.Errorf("BlockExplorerUrl = %q, want %q", chain.BlockExplorerUrl, "https://optimistic.etherscan.io")
	}
	if chain.SafeTransactionServiceUrl != "https://safe-transaction-optimism.safe.global" {
		t.Errorf("SafeTransactionServiceUrl = %q, want %q", chain.SafeTransactionServiceUrl, "https://safe-transaction-optimism.safe.global")
	}
	if chain.UsdcAddress != "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85" {
		t.Errorf("UsdcAddress = %q, want Optimism USDC address", chain.UsdcAddress)
	}
	if chain.Testnet {
		t.Error("Optimism should not be a testnet")
	}
	if chain.V1Name != "optimism" {
		t.Errorf("V1Name = %q, want %q", chain.V1Name, "optimism")
	}
}

func TestERC4337ChainInfo_ArbitrumFields(t *testing.T) {
	chain := GetERC4337Chain(42161)
	if chain == nil {
		t.Fatal("expected Arbitrum One chain info")
	}

	if chain.CAIP2 != "eip155:42161" {
		t.Errorf("CAIP2 = %q, want %q", chain.CAIP2, "eip155:42161")
	}
	if chain.RpcUrl != "https://arb1.arbitrum.io/rpc" {
		t.Errorf("RpcUrl = %q, want %q", chain.RpcUrl, "https://arb1.arbitrum.io/rpc")
	}
	if chain.BlockExplorerUrl != "https://arbiscan.io" {
		t.Errorf("BlockExplorerUrl = %q, want %q", chain.BlockExplorerUrl, "https://arbiscan.io")
	}
	if chain.SafeTransactionServiceUrl != "https://safe-transaction-arbitrum.safe.global" {
		t.Errorf("SafeTransactionServiceUrl = %q, want %q", chain.SafeTransactionServiceUrl, "https://safe-transaction-arbitrum.safe.global")
	}
	if chain.UsdcAddress != "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" {
		t.Errorf("UsdcAddress = %q, want Arbitrum USDC address", chain.UsdcAddress)
	}
	if chain.Testnet {
		t.Error("Arbitrum One should not be a testnet")
	}
	if chain.V1Name != "arbitrum" {
		t.Errorf("V1Name = %q, want %q", chain.V1Name, "arbitrum")
	}
}

func TestERC4337ChainInfo_BaseSepoliaFields(t *testing.T) {
	chain := GetERC4337Chain(84532)
	if chain == nil {
		t.Fatal("expected Base Sepolia chain info")
	}

	if chain.RpcUrl != "https://sepolia.base.org" {
		t.Errorf("RpcUrl = %q, want %q", chain.RpcUrl, "https://sepolia.base.org")
	}
	if chain.BlockExplorerUrl != "https://sepolia.basescan.org" {
		t.Errorf("BlockExplorerUrl = %q, want %q", chain.BlockExplorerUrl, "https://sepolia.basescan.org")
	}
	if chain.SafeTransactionServiceUrl != "https://safe-transaction-base-sepolia.safe.global" {
		t.Errorf("SafeTransactionServiceUrl = %q, want %q", chain.SafeTransactionServiceUrl, "https://safe-transaction-base-sepolia.safe.global")
	}
}

func TestERC4337SupportedChains_CAIP2Format(t *testing.T) {
	for chainID, chain := range ERC4337SupportedChains {
		t.Run(chain.Name, func(t *testing.T) {
			// Verify CAIP2 starts with "eip155:"
			if len(chain.CAIP2) < 8 || chain.CAIP2[:7] != "eip155:" {
				t.Errorf("CAIP2 = %q, want format eip155:<chainId>", chain.CAIP2)
			}

			// Verify CAIP2 contains the correct chain ID
			wantCAIP2 := fmt.Sprintf("eip155:%d", chainID)
			if chain.CAIP2 != wantCAIP2 {
				t.Errorf("CAIP2 = %q, want %q", chain.CAIP2, wantCAIP2)
			}

			// Verify ChainID matches the map key
			if chain.ChainID != chainID {
				t.Errorf("ChainID = %d, want %d (map key)", chain.ChainID, chainID)
			}
		})
	}
}

func TestERC4337ChainInfo_Fields(t *testing.T) {
	chain := GetERC4337Chain(8453)
	if chain == nil {
		t.Fatal("expected Base chain info")
	}

	if chain.CAIP2 != "eip155:8453" {
		t.Errorf("CAIP2 = %q, want %q", chain.CAIP2, "eip155:8453")
	}
	if chain.UsdcAddress != "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" {
		t.Errorf("UsdcAddress = %q, want USDC address for Base", chain.UsdcAddress)
	}
	if chain.Testnet {
		t.Error("Base should not be a testnet")
	}
	if chain.V1Name != "base" {
		t.Errorf("V1Name = %q, want %q", chain.V1Name, "base")
	}

	sepoliaChain := GetERC4337Chain(84532)
	if sepoliaChain == nil {
		t.Fatal("expected Base Sepolia chain info")
	}
	if !sepoliaChain.Testnet {
		t.Error("Base Sepolia should be a testnet")
	}
}
