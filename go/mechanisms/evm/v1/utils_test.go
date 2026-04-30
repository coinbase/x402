package v1_test

import (
	"math/big"
	"strings"
	"testing"

	"github.com/coinbase/x402/go/mechanisms/evm"
	v1 "github.com/coinbase/x402/go/mechanisms/evm/v1"
)

// ─── GetEvmChainId ────────────────────────────────────────────────────────────

func TestGetEvmChainId_KnownNetworks(t *testing.T) {
	cases := []struct {
		network string
		want    int64
	}{
		{"base", 8453},
		{"base-sepolia", 84532},
		{"ethereum", 1},
		{"sepolia", 11155111},
		{"polygon", 137},
		{"polygon-amoy", 80002},
		{"avalanche", 43114},
		{"avalanche-fuji", 43113},
		{"megaeth", 4326},
		{"monad", 143},
		{"stable", 988},
		{"stable-testnet", 2201},
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

	for _, tc := range cases {
		t.Run(tc.network, func(t *testing.T) {
			got, err := v1.GetEvmChainId(tc.network)
			if err != nil {
				t.Fatalf("GetEvmChainId(%q) unexpected error: %v", tc.network, err)
			}
			want := big.NewInt(tc.want)
			if got.Cmp(want) != 0 {
				t.Errorf("GetEvmChainId(%q) = %s, want %s", tc.network, got, want)
			}
		})
	}
}

func TestGetEvmChainId_UnknownNetwork(t *testing.T) {
	_, err := v1.GetEvmChainId("nonexistent-chain")
	if err == nil {
		t.Fatal("expected error for unknown network, got nil")
	}
	if !strings.Contains(err.Error(), "unsupported v1 network") {
		t.Errorf("expected 'unsupported v1 network' in error, got: %v", err)
	}
}

func TestGetEvmChainId_EmptyString(t *testing.T) {
	_, err := v1.GetEvmChainId("")
	if err == nil {
		t.Fatal("expected error for empty network string, got nil")
	}
}

// ─── GetNetworkConfig ─────────────────────────────────────────────────────────

func TestGetNetworkConfig_KnownNetworks(t *testing.T) {
	cases := []struct {
		network      string
		wantChainID  int64
		wantAssetLen int // address length should be > 0
	}{
		{"base", 8453, 42},
		{"base-sepolia", 84532, 42},
		{"polygon", 137, 42},
		{"megaeth", 4326, 42},
		{"monad", 143, 42},
		{"stable", 988, 42},
		{"stable-testnet", 2201, 42},
	}

	for _, tc := range cases {
		t.Run(tc.network, func(t *testing.T) {
			cfg, err := v1.GetNetworkConfig(tc.network)
			if err != nil {
				t.Fatalf("GetNetworkConfig(%q) unexpected error: %v", tc.network, err)
			}
			if cfg == nil {
				t.Fatal("expected non-nil config")
			}
			wantChainID := big.NewInt(tc.wantChainID)
			if cfg.ChainID.Cmp(wantChainID) != 0 {
				t.Errorf("ChainID = %s, want %s", cfg.ChainID, wantChainID)
			}
			if len(cfg.DefaultAsset.Address) != tc.wantAssetLen {
				t.Errorf("DefaultAsset.Address len = %d, want %d (addr=%s)",
					len(cfg.DefaultAsset.Address), tc.wantAssetLen, cfg.DefaultAsset.Address)
			}
			if cfg.DefaultAsset.Decimals <= 0 {
				t.Errorf("DefaultAsset.Decimals = %d, expected > 0", cfg.DefaultAsset.Decimals)
			}
		})
	}
}

func TestGetNetworkConfig_UnknownNetwork(t *testing.T) {
	_, err := v1.GetNetworkConfig("no-such-network")
	if err == nil {
		t.Fatal("expected error for unknown network, got nil")
	}
	if !strings.Contains(err.Error(), "no configuration for v1 network") {
		t.Errorf("unexpected error message: %v", err)
	}
}

func TestGetNetworkConfig_NetworkWithChainIdButNoConfig(t *testing.T) {
	// "ethereum" exists in NetworkChainIDs but not in NetworkConfigs
	_, err := v1.GetNetworkConfig("ethereum")
	if err == nil {
		t.Fatal("expected error for network without config, got nil")
	}
}

// ─── GetAssetInfo ─────────────────────────────────────────────────────────────

func TestGetAssetInfo_DefaultAsset_KnownNetwork(t *testing.T) {
	// Empty assetSymbolOrAddress → returns default asset
	info, err := v1.GetAssetInfo("base", "")
	if err != nil {
		t.Fatalf("GetAssetInfo(base, '') unexpected error: %v", err)
	}
	if info == nil {
		t.Fatal("expected non-nil AssetInfo")
	}
	// Base USDC address
	wantAddr := "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
	if !strings.EqualFold(info.Address, wantAddr) {
		t.Errorf("Address = %s, want %s", info.Address, wantAddr)
	}
	if info.Decimals != evm.DefaultDecimals {
		t.Errorf("Decimals = %d, want %d", info.Decimals, evm.DefaultDecimals)
	}
}

func TestGetAssetInfo_ValidAddress_MatchesDefault(t *testing.T) {
	// Providing the actual default asset address should return that asset's info
	addr := "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
	info, err := v1.GetAssetInfo("base", addr)
	if err != nil {
		t.Fatalf("GetAssetInfo(base, addr) unexpected error: %v", err)
	}
	if info == nil {
		t.Fatal("expected non-nil AssetInfo")
	}
	if info.Name != "USD Coin" {
		t.Errorf("Name = %q, want %q", info.Name, "USD Coin")
	}
}

func TestGetAssetInfo_ValidAddress_UnknownToken(t *testing.T) {
	// An arbitrary valid EVM address not matching the default → returns generic info
	addr := "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"
	info, err := v1.GetAssetInfo("base", addr)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if info.Name != "Unknown Token" {
		t.Errorf("Name = %q, want %q", info.Name, "Unknown Token")
	}
	if info.Decimals != 18 {
		t.Errorf("Decimals = %d, want 18", info.Decimals)
	}
}

func TestGetAssetInfo_ValidAddress_NetworkWithoutConfig(t *testing.T) {
	// Network exists in ChainIDs but not in NetworkConfigs
	// Providing a valid address should still succeed with generic info
	addr := "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"
	info, err := v1.GetAssetInfo("ethereum", addr)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if info == nil {
		t.Fatal("expected non-nil AssetInfo")
	}
	if info.Name != "Unknown Token" {
		t.Errorf("Name = %q, want %q", info.Name, "Unknown Token")
	}
}

func TestGetAssetInfo_EmptyAsset_NetworkWithoutDefaultConfig(t *testing.T) {
	// "ethereum" has no config → requesting default asset should fail
	_, err := v1.GetAssetInfo("ethereum", "")
	if err == nil {
		t.Fatal("expected error for network without default asset, got nil")
	}
}

func TestGetAssetInfo_UnknownNetwork_NoAddress(t *testing.T) {
	_, err := v1.GetAssetInfo("totally-fake-net", "")
	if err == nil {
		t.Fatal("expected error for unknown network, got nil")
	}
}

func TestGetAssetInfo_BaseSepolia_DefaultAsset(t *testing.T) {
	info, err := v1.GetAssetInfo("base-sepolia", "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	wantAddr := "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
	if !strings.EqualFold(info.Address, wantAddr) {
		t.Errorf("Address = %s, want %s", info.Address, wantAddr)
	}
}

// ─── Networks slice ───────────────────────────────────────────────────────────

func TestNetworks_ContainsAllChains(t *testing.T) {
	if len(v1.Networks) == 0 {
		t.Fatal("Networks slice is empty")
	}
	// All keys from NetworkChainIDs should appear in Networks
	for name := range v1.NetworkChainIDs {
		found := false
		for _, n := range v1.Networks {
			if n == name {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("Networks slice missing network %q", name)
		}
	}
}

func TestNetworks_LengthMatchesChainIDs(t *testing.T) {
	if len(v1.Networks) != len(v1.NetworkChainIDs) {
		t.Errorf("Networks len = %d, NetworkChainIDs len = %d; should be equal",
			len(v1.Networks), len(v1.NetworkChainIDs))
	}
}
