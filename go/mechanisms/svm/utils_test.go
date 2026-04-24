package svm

import (
	"strings"
	"testing"
)

// TestNormalizeNetwork_V1Names tests conversion of V1 network names to CAIP-2
func TestNormalizeNetwork_V1Names(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
		wantErr  bool
	}{
		{
			name:     "solana mainnet V1",
			input:    "solana",
			expected: SolanaMainnetCAIP2,
		},
		{
			name:     "solana devnet V1",
			input:    "solana-devnet",
			expected: SolanaDevnetCAIP2,
		},
		{
			name:     "solana testnet V1",
			input:    "solana-testnet",
			expected: SolanaTestnetCAIP2,
		},
		{
			name:    "unknown V1 network",
			input:   "solana-unknown",
			wantErr: true,
		},
		{
			name:    "empty string",
			input:   "",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := NormalizeNetwork(tt.input)
			if (err != nil) != tt.wantErr {
				t.Errorf("NormalizeNetwork(%q) error = %v, wantErr %v", tt.input, err, tt.wantErr)
				return
			}
			if !tt.wantErr && got != tt.expected {
				t.Errorf("NormalizeNetwork(%q) = %q, want %q", tt.input, got, tt.expected)
			}
		})
	}
}

// TestNormalizeNetwork_CAIP2Names tests that valid CAIP-2 names pass through unchanged
func TestNormalizeNetwork_CAIP2Names(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		wantErr bool
	}{
		{
			name:  "solana mainnet CAIP-2",
			input: SolanaMainnetCAIP2,
		},
		{
			name:  "solana devnet CAIP-2",
			input: SolanaDevnetCAIP2,
		},
		{
			name:  "solana testnet CAIP-2",
			input: SolanaTestnetCAIP2,
		},
		{
			name:    "unknown CAIP-2 network",
			input:   "solana:UnknownGenesisHash",
			wantErr: true,
		},
		{
			name:    "EVM CAIP-2 not supported",
			input:   "eip155:8453",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := NormalizeNetwork(tt.input)
			if (err != nil) != tt.wantErr {
				t.Errorf("NormalizeNetwork(%q) error = %v, wantErr %v", tt.input, err, tt.wantErr)
				return
			}
			if !tt.wantErr && got != tt.input {
				t.Errorf("NormalizeNetwork(%q) = %q, want it to pass through unchanged", tt.input, got)
			}
		})
	}
}

// TestGetNetworkConfig_ValidNetworks tests that valid networks return proper config
func TestGetNetworkConfig_ValidNetworks(t *testing.T) {
	tests := []struct {
		name             string
		network          string
		expectedCAIP2    string
		expectedSymbol   string
		expectedDecimals int
	}{
		{
			name:             "mainnet via V1 name",
			network:          "solana",
			expectedCAIP2:    SolanaMainnetCAIP2,
			expectedSymbol:   "USDC",
			expectedDecimals: DefaultDecimals,
		},
		{
			name:             "devnet via V1 name",
			network:          "solana-devnet",
			expectedCAIP2:    SolanaDevnetCAIP2,
			expectedSymbol:   "USDC",
			expectedDecimals: DefaultDecimals,
		},
		{
			name:             "mainnet via CAIP-2",
			network:          SolanaMainnetCAIP2,
			expectedCAIP2:    SolanaMainnetCAIP2,
			expectedSymbol:   "USDC",
			expectedDecimals: DefaultDecimals,
		},
		{
			name:             "testnet via CAIP-2",
			network:          SolanaTestnetCAIP2,
			expectedCAIP2:    SolanaTestnetCAIP2,
			expectedSymbol:   "USDC",
			expectedDecimals: DefaultDecimals,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			config, err := GetNetworkConfig(tt.network)
			if err != nil {
				t.Fatalf("GetNetworkConfig(%q) unexpected error: %v", tt.network, err)
			}
			if config.CAIP2 != tt.expectedCAIP2 {
				t.Errorf("config.CAIP2 = %q, want %q", config.CAIP2, tt.expectedCAIP2)
			}
			if config.DefaultAsset.Symbol != tt.expectedSymbol {
				t.Errorf("config.DefaultAsset.Symbol = %q, want %q", config.DefaultAsset.Symbol, tt.expectedSymbol)
			}
			if config.DefaultAsset.Decimals != tt.expectedDecimals {
				t.Errorf("config.DefaultAsset.Decimals = %d, want %d", config.DefaultAsset.Decimals, tt.expectedDecimals)
			}
		})
	}
}

// TestGetNetworkConfig_InvalidNetworks tests that invalid networks return errors
func TestGetNetworkConfig_InvalidNetworks(t *testing.T) {
	tests := []struct {
		name    string
		network string
	}{
		{name: "empty string", network: ""},
		{name: "unknown V1", network: "solana-regtest"},
		{name: "unknown CAIP-2", network: "solana:BadHash"},
		{name: "EVM network", network: "eip155:1"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := GetNetworkConfig(tt.network)
			if err == nil {
				t.Errorf("GetNetworkConfig(%q) expected error, got nil", tt.network)
			}
		})
	}
}

// TestValidateSolanaAddress tests Solana address validation
func TestValidateSolanaAddress(t *testing.T) {
	tests := []struct {
		name    string
		address string
		valid   bool
	}{
		{
			name:    "valid USDC mainnet mint",
			address: USDCMainnetAddress,
			valid:   true,
		},
		{
			name:    "valid USDC devnet mint",
			address: USDCDevnetAddress,
			valid:   true,
		},
		{
			name:    "valid system program",
			address: "11111111111111111111111111111111",
			valid:   true,
		},
		{
			name:    "valid token program",
			address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
			valid:   true,
		},
		{
			name:    "empty string",
			address: "",
			valid:   false,
		},
		{
			name:    "too short",
			address: "abc",
			valid:   false,
		},
		{
			name:    "EVM address",
			address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
			valid:   false,
		},
		{
			name:    "contains invalid base58 char O",
			address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDtOO",
			valid:   false,
		},
		{
			name:    "contains invalid base58 char 0",
			address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt00",
			valid:   false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ValidateSolanaAddress(tt.address)
			if got != tt.valid {
				t.Errorf("ValidateSolanaAddress(%q) = %v, want %v", tt.address, got, tt.valid)
			}
		})
	}
}

// TestParseAmount tests conversion from decimal string to token smallest units
func TestParseAmount(t *testing.T) {
	tests := []struct {
		name     string
		amount   string
		decimals int
		expected uint64
		wantErr  bool
	}{
		{
			name:     "1 USDC with 6 decimals",
			amount:   "1",
			decimals: 6,
			expected: 1_000_000,
		},
		{
			name:     "0.01 USDC",
			amount:   "0.01",
			decimals: 6,
			expected: 10_000,
		},
		{
			name:     "0.001 USDC",
			amount:   "0.001",
			decimals: 6,
			expected: 1_000,
		},
		{
			name:     "0.000001 USDC (1 micro-USDC)",
			amount:   "0.000001",
			decimals: 6,
			expected: 1,
		},
		{
			name:     "100.5 USDC",
			amount:   "100.5",
			decimals: 6,
			expected: 100_500_000,
		},
		{
			name:     "zero amount",
			amount:   "0",
			decimals: 6,
			expected: 0,
		},
		{
			name:     "zero with decimal",
			amount:   "0.0",
			decimals: 6,
			expected: 0,
		},
		{
			name:     "SOL with 9 decimals",
			amount:   "1",
			decimals: 9,
			expected: 1_000_000_000,
		},
		{
			name:     "decimal truncated to fit precision",
			amount:   "0.0000001",
			decimals: 6,
			expected: 0, // truncated to 0 since 7 decimal places > 6
		},
		{
			name:     "whitespace trimmed",
			amount:   "  1.5  ",
			decimals: 6,
			expected: 1_500_000,
		},
		{
			name:     "invalid format - multiple dots",
			amount:   "1.0.0",
			decimals: 6,
			wantErr:  true,
		},
		{
			name:     "invalid format - letters",
			amount:   "abc",
			decimals: 6,
			wantErr:  true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ParseAmount(tt.amount, tt.decimals)
			if (err != nil) != tt.wantErr {
				t.Errorf("ParseAmount(%q, %d) error = %v, wantErr %v", tt.amount, tt.decimals, err, tt.wantErr)
				return
			}
			if !tt.wantErr && got != tt.expected {
				t.Errorf("ParseAmount(%q, %d) = %d, want %d", tt.amount, tt.decimals, got, tt.expected)
			}
		})
	}
}

// TestFormatAmount tests conversion from token smallest units to decimal string
func TestFormatAmount(t *testing.T) {
	tests := []struct {
		name     string
		amount   uint64
		decimals int
		expected string
	}{
		{
			name:     "1 USDC",
			amount:   1_000_000,
			decimals: 6,
			expected: "1",
		},
		{
			name:     "0.01 USDC",
			amount:   10_000,
			decimals: 6,
			expected: "0.01",
		},
		{
			name:     "0.001 USDC",
			amount:   1_000,
			decimals: 6,
			expected: "0.001",
		},
		{
			name:     "1 micro-USDC",
			amount:   1,
			decimals: 6,
			expected: "0.000001",
		},
		{
			name:     "100.5 USDC",
			amount:   100_500_000,
			decimals: 6,
			expected: "100.5",
		},
		{
			name:     "zero",
			amount:   0,
			decimals: 6,
			expected: "0",
		},
		{
			name:     "1 SOL (9 decimals)",
			amount:   1_000_000_000,
			decimals: 9,
			expected: "1",
		},
		{
			name:     "0.5 SOL",
			amount:   500_000_000,
			decimals: 9,
			expected: "0.5",
		},
		{
			name:     "trailing zeros stripped",
			amount:   1_100_000,
			decimals: 6,
			expected: "1.1",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := FormatAmount(tt.amount, tt.decimals)
			if got != tt.expected {
				t.Errorf("FormatAmount(%d, %d) = %q, want %q", tt.amount, tt.decimals, got, tt.expected)
			}
		})
	}
}

// TestParseAmountFormatAmountRoundtrip tests that ParseAmount and FormatAmount are inverse operations
func TestParseAmountFormatAmountRoundtrip(t *testing.T) {
	decimals := 6
	inputs := []string{"1", "0.5", "0.01", "100.123456", "0.000001"}

	for _, input := range inputs {
		t.Run("roundtrip/"+input, func(t *testing.T) {
			parsed, err := ParseAmount(input, decimals)
			if err != nil {
				t.Fatalf("ParseAmount(%q, %d) error: %v", input, decimals, err)
			}
			formatted := FormatAmount(parsed, decimals)
			if formatted != input {
				t.Errorf("roundtrip(%q): ParseAmount then FormatAmount = %q", input, formatted)
			}
		})
	}
}

// TestGetAssetInfo_DefaultAsset tests that unknown/default lookups return the network's default asset
func TestGetAssetInfo_DefaultAsset(t *testing.T) {
	tests := []struct {
		name          string
		network       string
		asset         string
		expectedAddr  string
		expectedSym   string
	}{
		{
			name:         "mainnet USDC by address",
			network:      SolanaMainnetCAIP2,
			asset:        USDCMainnetAddress,
			expectedAddr: USDCMainnetAddress,
			expectedSym:  "USDC",
		},
		{
			name:         "mainnet default asset via non-address string",
			network:      SolanaMainnetCAIP2,
			asset:        "USDC",
			expectedAddr: USDCMainnetAddress,
			expectedSym:  "USDC",
		},
		{
			name:         "devnet USDC by address",
			network:      SolanaDevnetCAIP2,
			asset:        USDCDevnetAddress,
			expectedAddr: USDCDevnetAddress,
			expectedSym:  "USDC",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			info, err := GetAssetInfo(tt.network, tt.asset)
			if err != nil {
				t.Fatalf("GetAssetInfo(%q, %q) unexpected error: %v", tt.network, tt.asset, err)
			}
			if info.Address != tt.expectedAddr {
				t.Errorf("info.Address = %q, want %q", info.Address, tt.expectedAddr)
			}
			if info.Symbol != tt.expectedSym {
				t.Errorf("info.Symbol = %q, want %q", info.Symbol, tt.expectedSym)
			}
		})
	}
}

// TestGetAssetInfo_UnknownToken tests that unknown mint addresses return basic info
func TestGetAssetInfo_UnknownToken(t *testing.T) {
	// A valid Solana address that isn't USDC
	unknownMint := "So11111111111111111111111111111111111111112" // Wrapped SOL

	info, err := GetAssetInfo(SolanaMainnetCAIP2, unknownMint)
	if err != nil {
		t.Fatalf("GetAssetInfo with unknown mint unexpected error: %v", err)
	}

	if info.Address != unknownMint {
		t.Errorf("info.Address = %q, want %q", info.Address, unknownMint)
	}
	if info.Symbol != "UNKNOWN" {
		t.Errorf("info.Symbol = %q, want UNKNOWN", info.Symbol)
	}
	if info.Decimals != 9 {
		t.Errorf("info.Decimals = %d, want 9", info.Decimals)
	}
}

// TestGetAssetInfo_InvalidNetwork tests error returned for invalid network
func TestGetAssetInfo_InvalidNetwork(t *testing.T) {
	_, err := GetAssetInfo("invalid-network", USDCMainnetAddress)
	if err == nil {
		t.Error("GetAssetInfo with invalid network expected error, got nil")
	}
}

// TestNetworkConfigs_Completeness verifies all V1 mappings have corresponding configs
func TestNetworkConfigs_Completeness(t *testing.T) {
	for v1Name, caip2 := range V1ToV2NetworkMap {
		t.Run("v1/"+v1Name, func(t *testing.T) {
			config, ok := NetworkConfigs[caip2]
			if !ok {
				t.Errorf("V1ToV2NetworkMap[%q] = %q has no entry in NetworkConfigs", v1Name, caip2)
				return
			}
			if config.CAIP2 != caip2 {
				t.Errorf("NetworkConfigs[%q].CAIP2 = %q, want %q", caip2, config.CAIP2, caip2)
			}
			if config.DefaultAsset.Address == "" {
				t.Errorf("NetworkConfigs[%q].DefaultAsset.Address is empty", caip2)
			}
			if config.DefaultAsset.Decimals <= 0 {
				t.Errorf("NetworkConfigs[%q].DefaultAsset.Decimals = %d, want > 0", caip2, config.DefaultAsset.Decimals)
			}
		})
	}
}

// TestNetworkConfigs_DefaultAssetAddresses verifies known USDC mint addresses
func TestNetworkConfigs_DefaultAssetAddresses(t *testing.T) {
	mainnet, ok := NetworkConfigs[SolanaMainnetCAIP2]
	if !ok {
		t.Fatal("missing mainnet config")
	}
	if mainnet.DefaultAsset.Address != USDCMainnetAddress {
		t.Errorf("mainnet USDC address = %q, want %q", mainnet.DefaultAsset.Address, USDCMainnetAddress)
	}

	devnet, ok := NetworkConfigs[SolanaDevnetCAIP2]
	if !ok {
		t.Fatal("missing devnet config")
	}
	if devnet.DefaultAsset.Address != USDCDevnetAddress {
		t.Errorf("devnet USDC address = %q, want %q", devnet.DefaultAsset.Address, USDCDevnetAddress)
	}
}

// TestNormalizeNetwork_Idempotent verifies that normalizing an already-normalized CAIP-2 is idempotent
func TestNormalizeNetwork_Idempotent(t *testing.T) {
	for caip2 := range NetworkConfigs {
		t.Run(caip2, func(t *testing.T) {
			result, err := NormalizeNetwork(caip2)
			if err != nil {
				t.Errorf("NormalizeNetwork(%q) error: %v", caip2, err)
				return
			}
			if result != caip2 {
				t.Errorf("NormalizeNetwork(%q) = %q, want idempotent result", caip2, result)
			}
		})
	}
}

// TestFormatAmount_NoLeadingZerosInIntPart verifies integer part never has unnecessary leading zeros
func TestFormatAmount_NoLeadingZerosInIntPart(t *testing.T) {
	result := FormatAmount(5_000_000, 6)
	if strings.HasPrefix(result, "0") && result != "0" {
		t.Errorf("FormatAmount has unexpected leading zero: %q", result)
	}
}
