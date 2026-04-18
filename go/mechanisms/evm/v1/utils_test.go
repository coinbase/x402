package v1

import (
	"math/big"
	"strings"
	"testing"

	"github.com/coinbase/x402/go/mechanisms/evm"
)

// ─── GetEvmChainId ────────────────────────────────────────────────────────────

func TestGetEvmChainId_KnownNetworks(t *testing.T) {
	tests := []struct {
		network string
		want    int64
	}{
		{"base", 8453},
		{"base-sepolia", 84532},
		{"ethereum", 1},
		{"sepolia", 11155111},
		{"polygon", 137},
		{"polygon-amoy", 80002},
		{"megaeth", 4326},
		{"monad", 143},
		{"stable", 988},
		{"stable-testnet", 2201},
		{"avalanche", 43114},
		{"avalanche-fuji", 43113},
		{"abstract", 2741},
		{"abstract-testnet", 11124},
		{"iotex", 4689},
		{"sei", 1329},
		{"sei-testnet", 1328},
		{"peaq", 3338},
		{"story", 1514},
		{"educhain", 41923},
		{"skale-base-sepolia", 324705682},
	}

	for _, tt := range tests {
		t.Run(tt.network, func(t *testing.T) {
			got, err := GetEvmChainId(tt.network)
			if err != nil {
				t.Fatalf("GetEvmChainId(%q) unexpected error: %v", tt.network, err)
			}
			want := big.NewInt(tt.want)
			if got.Cmp(want) != 0 {
				t.Errorf("GetEvmChainId(%q) = %s, want %s", tt.network, got, want)
			}
		})
	}
}

func TestGetEvmChainId_UnknownNetwork(t *testing.T) {
	_, err := GetEvmChainId("unknown-chain")
	if err == nil {
		t.Fatal("expected error for unknown network, got nil")
	}
	if !strings.Contains(err.Error(), "unsupported v1 network") {
		t.Errorf("expected 'unsupported v1 network' in error, got: %v", err)
	}
}

func TestGetEvmChainId_EmptyString(t *testing.T) {
	_, err := GetEvmChainId("")
	if err == nil {
		t.Fatal("expected error for empty network string, got nil")
	}
}

// ─── GetNetworkConfig ─────────────────────────────────────────────────────────

func TestGetNetworkConfig_KnownNetworks(t *testing.T) {
	tests := []struct {
		network      string
		wantChainID  int64
		wantAsset    string
		wantDecimals int
	}{
		{
			network:      "base",
			wantChainID:  8453,
			wantAsset:    "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
			wantDecimals: evm.DefaultDecimals,
		},
		{
			network:      "base-sepolia",
			wantChainID:  84532,
			wantAsset:    "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
			wantDecimals: evm.DefaultDecimals,
		},
		{
			network:      "polygon",
			wantChainID:  137,
			wantAsset:    "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
			wantDecimals: evm.DefaultDecimals,
		},
		{
			network:      "megaeth",
			wantChainID:  4326,
			wantAsset:    "0xFAfDdbb3FC7688494971a79cc65DCa3EF82079E7",
			wantDecimals: 18,
		},
		{
			network:      "monad",
			wantChainID:  143,
			wantAsset:    "0x754704Bc059F8C67012fEd69BC8A327a5aafb603",
			wantDecimals: evm.DefaultDecimals,
		},
		{
			network:      "stable",
			wantChainID:  988,
			wantAsset:    "0x779Ded0c9e1022225f8E0630b35a9b54bE713736",
			wantDecimals: evm.DefaultDecimals,
		},
		{
			network:      "stable-testnet",
			wantChainID:  2201,
			wantAsset:    "0x78Cf24370174180738C5B8E352B6D14c83a6c9A9",
			wantDecimals: evm.DefaultDecimals,
		},
	}

	for _, tt := range tests {
		t.Run(tt.network, func(t *testing.T) {
			cfg, err := GetNetworkConfig(tt.network)
			if err != nil {
				t.Fatalf("GetNetworkConfig(%q) unexpected error: %v", tt.network, err)
			}

			wantChain := big.NewInt(tt.wantChainID)
			if cfg.ChainID.Cmp(wantChain) != 0 {
				t.Errorf("ChainID = %s, want %s", cfg.ChainID, wantChain)
			}
			if cfg.DefaultAsset.Address != tt.wantAsset {
				t.Errorf("DefaultAsset.Address = %s, want %s", cfg.DefaultAsset.Address, tt.wantAsset)
			}
			if cfg.DefaultAsset.Decimals != tt.wantDecimals {
				t.Errorf("DefaultAsset.Decimals = %d, want %d", cfg.DefaultAsset.Decimals, tt.wantDecimals)
			}
		})
	}
}

func TestGetNetworkConfig_UnknownNetwork(t *testing.T) {
	_, err := GetNetworkConfig("unknown-chain")
	if err == nil {
		t.Fatal("expected error for unknown network, got nil")
	}
	if !strings.Contains(err.Error(), "no configuration for v1 network") {
		t.Errorf("expected 'no configuration for v1 network' in error, got: %v", err)
	}
}

func TestGetNetworkConfig_NetworkWithoutDefaultAsset(t *testing.T) {
	// Networks like "ethereum" are in NetworkChainIDs but not in NetworkConfigs.
	// GetNetworkConfig should return an error.
	_, err := GetNetworkConfig("ethereum")
	if err == nil {
		t.Fatal("expected error for network without config entry, got nil")
	}
}

// ─── GetAssetInfo ─────────────────────────────────────────────────────────────

func TestGetAssetInfo_DefaultAssetByNetwork(t *testing.T) {
	// Empty assetSymbolOrAddress: return the network's default asset.
	info, err := GetAssetInfo("base", "")
	if err != nil {
		t.Fatalf("GetAssetInfo(base, '') unexpected error: %v", err)
	}
	if info.Address != "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" {
		t.Errorf("expected Base USDC address, got %s", info.Address)
	}
	if info.Name != "USD Coin" {
		t.Errorf("expected asset name 'USD Coin', got %s", info.Name)
	}
	if info.Decimals != evm.DefaultDecimals {
		t.Errorf("expected Decimals=%d, got %d", evm.DefaultDecimals, info.Decimals)
	}
}

func TestGetAssetInfo_KnownAddressMatchesDefaultAsset(t *testing.T) {
	// Valid address that matches the network's default asset: return full asset info.
	addr := "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
	info, err := GetAssetInfo("base", addr)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if info.Address != addr {
		t.Errorf("expected address %s, got %s", addr, info.Address)
	}
	if info.Name != "USD Coin" {
		t.Errorf("expected name 'USD Coin', got %s", info.Name)
	}
}

func TestGetAssetInfo_KnownAddressCaseInsensitive(t *testing.T) {
	// Lowercase address should still match the default asset config.
	addr := strings.ToLower("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913")
	info, err := GetAssetInfo("base", addr)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Address should be normalized in the returned info.
	if info.Name != "USD Coin" {
		t.Errorf("expected name 'USD Coin' for case-insensitive match, got %s", info.Name)
	}
}

func TestGetAssetInfo_UnknownAddressReturnsGenericInfo(t *testing.T) {
	// Valid address that does not match any known token: return generic "Unknown Token" info.
	addr := "0x1234567890123456789012345678901234567890"
	info, err := GetAssetInfo("base", addr)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if info.Name != "Unknown Token" {
		t.Errorf("expected name 'Unknown Token', got %s", info.Name)
	}
	if info.Decimals != 18 {
		t.Errorf("expected Decimals=18 for generic token, got %d", info.Decimals)
	}
}

func TestGetAssetInfo_UnknownAddressOnNetworkWithoutConfig(t *testing.T) {
	// Valid address on a network that has no NetworkConfig entry: should still
	// return generic info because the address itself is valid.
	addr := "0x1234567890123456789012345678901234567890"
	info, err := GetAssetInfo("ethereum", addr)
	if err != nil {
		t.Fatalf("unexpected error for valid address on unknown config network: %v", err)
	}
	if info.Name != "Unknown Token" {
		t.Errorf("expected 'Unknown Token', got %s", info.Name)
	}
}

func TestGetAssetInfo_NoAssetNetworkWithoutConfig(t *testing.T) {
	// Empty asset on a network with no NetworkConfig: should return an error.
	_, err := GetAssetInfo("ethereum", "")
	if err == nil {
		t.Fatal("expected error for network without default asset, got nil")
	}
}

func TestGetAssetInfo_NoAssetUnknownNetwork(t *testing.T) {
	_, err := GetAssetInfo("unknown-chain", "")
	if err == nil {
		t.Fatal("expected error for unknown network, got nil")
	}
}

func TestGetAssetInfo_BaseSepolia(t *testing.T) {
	info, err := GetAssetInfo("base-sepolia", "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if info.Address != "0x036CbD53842c5426634e7929541eC2318f3dCF7e" {
		t.Errorf("expected Base Sepolia USDC address, got %s", info.Address)
	}
}
