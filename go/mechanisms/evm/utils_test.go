package evm

import (
	"math/big"
	"strings"
	"testing"
	"time"
)

// ---------------------------------------------------------------------------
// GetEvmChainId
// ---------------------------------------------------------------------------

func TestGetEvmChainId_ValidCaip2(t *testing.T) {
	t.Parallel()
	cases := []struct {
		network  string
		expected int64
	}{
		{"eip155:1", 1},
		{"eip155:8453", 8453},
		{"eip155:137", 137},
		{"eip155:0", 0},
		{"eip155:999999", 999999},
	}
	for _, tc := range cases {
		tc := tc
		t.Run(tc.network, func(t *testing.T) {
			t.Parallel()
			got, err := GetEvmChainId(tc.network)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got.Int64() != tc.expected {
				t.Fatalf("want %d, got %s", tc.expected, got)
			}
		})
	}
}

func TestGetEvmChainId_InvalidInputs(t *testing.T) {
	t.Parallel()
	cases := []string{
		"",
		"base",
		"ethereum",
		"eip155:",
		"eip155:notanumber",
		"sol:mainnet",
	}
	for _, network := range cases {
		network := network
		t.Run(network, func(t *testing.T) {
			t.Parallel()
			_, err := GetEvmChainId(network)
			if err == nil {
				t.Fatalf("expected error for %q, got nil", network)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// CreateNonce
// ---------------------------------------------------------------------------

func TestCreateNonce_Format(t *testing.T) {
	t.Parallel()
	got, err := CreateNonce()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.HasPrefix(got, "0x") {
		t.Fatalf("expected 0x prefix, got %q", got)
	}
	// 0x + 64 hex chars = 66 total
	if len(got) != 66 {
		t.Fatalf("expected length 66, got %d (%q)", len(got), got)
	}
}

func TestCreateNonce_Unique(t *testing.T) {
	t.Parallel()
	n1, _ := CreateNonce()
	n2, _ := CreateNonce()
	if n1 == n2 {
		t.Fatal("two successive nonces must not be equal")
	}
}

// ---------------------------------------------------------------------------
// CreatePermit2Nonce
// ---------------------------------------------------------------------------

func TestCreatePermit2Nonce_IsNumericString(t *testing.T) {
	t.Parallel()
	got, err := CreatePermit2Nonce()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	n, ok := new(big.Int).SetString(got, 10)
	if !ok {
		t.Fatalf("nonce %q is not a valid decimal integer", got)
	}
	if n.Sign() < 0 {
		t.Fatal("nonce must be non-negative")
	}
}

func TestCreatePermit2Nonce_Unique(t *testing.T) {
	t.Parallel()
	n1, _ := CreatePermit2Nonce()
	n2, _ := CreatePermit2Nonce()
	if n1 == n2 {
		t.Fatal("two successive Permit2 nonces must not be equal")
	}
}

// ---------------------------------------------------------------------------
// MaxUint256
// ---------------------------------------------------------------------------

func TestMaxUint256_Value(t *testing.T) {
	t.Parallel()
	max := MaxUint256()
	// 2^256 - 1 should be 115792089237316195423570985008687907853269984665640564039457584007913129639935
	expected := new(big.Int)
	expected.Exp(big.NewInt(2), big.NewInt(256), nil)
	expected.Sub(expected, big.NewInt(1))
	if max.Cmp(expected) != 0 {
		t.Fatalf("MaxUint256 mismatch: got %s", max)
	}
}

func TestMaxUint256_IndependentCopies(t *testing.T) {
	t.Parallel()
	a := MaxUint256()
	b := MaxUint256()
	// Mutating one must not affect the other
	a.Sub(a, big.NewInt(1))
	if a.Cmp(b) == 0 {
		t.Fatal("expected independent copies but mutation leaked")
	}
}

// ---------------------------------------------------------------------------
// NormalizeAddress
// ---------------------------------------------------------------------------

func TestNormalizeAddress(t *testing.T) {
	t.Parallel()
	cases := []struct {
		input, want string
	}{
		{"0xAbCdEf1234567890AbCdEf1234567890AbCdEf12", "0xabcdef1234567890abcdef1234567890abcdef12"},
		{"0x0000000000000000000000000000000000000000", "0x0000000000000000000000000000000000000000"},
		{"AbCdEf1234567890AbCdEf1234567890AbCdEf12", "0xabcdef1234567890abcdef1234567890abcdef12"},
		{"0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF", "0xffffffffffffffffffffffffffffffffffffffff"},
	}
	for _, tc := range cases {
		tc := tc
		t.Run(tc.input, func(t *testing.T) {
			t.Parallel()
			got := NormalizeAddress(tc.input)
			if got != tc.want {
				t.Fatalf("want %q, got %q", tc.want, got)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// IsValidAddress
// ---------------------------------------------------------------------------

func TestIsValidAddress_Valid(t *testing.T) {
	t.Parallel()
	cases := []string{
		"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
		"0x0000000000000000000000000000000000000000",
		"0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF",
		"833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // no 0x prefix
	}
	for _, addr := range cases {
		addr := addr
		t.Run(addr, func(t *testing.T) {
			t.Parallel()
			if !IsValidAddress(addr) {
				t.Fatalf("expected valid, got invalid for %q", addr)
			}
		})
	}
}

func TestIsValidAddress_Invalid(t *testing.T) {
	t.Parallel()
	cases := []string{
		"",
		"0x",
		"0x1234",                                     // too short
		"0x000000000000000000000000000000000000000Z",  // invalid hex char
		"0x00000000000000000000000000000000000000000", // too long (41 hex chars)
		"not-an-address",
	}
	for _, addr := range cases {
		addr := addr
		t.Run(addr, func(t *testing.T) {
			t.Parallel()
			if IsValidAddress(addr) {
				t.Fatalf("expected invalid, got valid for %q", addr)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// ParseAmount
// ---------------------------------------------------------------------------

func TestParseAmount(t *testing.T) {
	t.Parallel()
	cases := []struct {
		amount   string
		decimals int
		want     string // expected big.Int string
	}{
		{"1", 6, "1000000"},
		{"0.5", 6, "500000"},
		{"1.5", 6, "1500000"},
		{"0.000001", 6, "1"},
		{"100", 6, "100000000"},
		{"1.23456789", 6, "1234567"}, // truncated to 6 decimals
		{"0", 6, "0"},
		{"1", 18, "1000000000000000000"},
		{"1.1", 18, "1100000000000000000"},
	}
	for _, tc := range cases {
		tc := tc
		t.Run(tc.amount+"_"+string(rune('0'+tc.decimals)), func(t *testing.T) {
			t.Parallel()
			got, err := ParseAmount(tc.amount, tc.decimals)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got.String() != tc.want {
				t.Fatalf("want %s, got %s", tc.want, got)
			}
		})
	}
}

func TestParseAmount_InvalidFormat(t *testing.T) {
	t.Parallel()
	cases := []string{
		"1.2.3",
		"abc",
		"",
		"1.abc",
	}
	for _, amount := range cases {
		amount := amount
		t.Run(amount, func(t *testing.T) {
			t.Parallel()
			_, err := ParseAmount(amount, 6)
			if err == nil {
				t.Fatalf("expected error for %q, got nil", amount)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// FormatAmount
// ---------------------------------------------------------------------------

func TestFormatAmount(t *testing.T) {
	t.Parallel()
	cases := []struct {
		amount   *big.Int
		decimals int
		want     string
	}{
		{big.NewInt(1000000), 6, "1"},
		{big.NewInt(500000), 6, "0.5"},
		{big.NewInt(1), 6, "0.000001"},
		{big.NewInt(0), 6, "0"},
		{new(big.Int).Mul(big.NewInt(1000000000000000000), big.NewInt(1)), 18, "1"},
		{big.NewInt(1500000), 6, "1.5"},
		{nil, 6, "0"},
	}
	for _, tc := range cases {
		tc := tc
		t.Run(tc.want, func(t *testing.T) {
			t.Parallel()
			got := FormatAmount(tc.amount, tc.decimals)
			if got != tc.want {
				t.Fatalf("want %q, got %q", tc.want, got)
			}
		})
	}
}

func TestParseFormatRoundTrip(t *testing.T) {
	t.Parallel()
	inputs := []string{"1", "0.5", "100.123456", "0.000001"}
	for _, input := range inputs {
		input := input
		t.Run(input, func(t *testing.T) {
			t.Parallel()
			parsed, err := ParseAmount(input, 6)
			if err != nil {
				t.Fatalf("ParseAmount error: %v", err)
			}
			formatted := FormatAmount(parsed, 6)
			if formatted != input {
				t.Fatalf("round-trip failed: %q → %s → %q", input, parsed, formatted)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// GetNetworkConfig
// ---------------------------------------------------------------------------

func TestGetNetworkConfig_KnownNetworks(t *testing.T) {
	t.Parallel()
	// These networks should have full configs in NetworkConfigs
	knownNetworks := []string{
		"eip155:8453",  // Base mainnet
		"eip155:84532", // Base Sepolia
		"eip155:137",   // Polygon
	}
	for _, network := range knownNetworks {
		network := network
		t.Run(network, func(t *testing.T) {
			t.Parallel()
			cfg, err := GetNetworkConfig(network)
			if err != nil {
				t.Fatalf("unexpected error for known network %q: %v", network, err)
			}
			if cfg == nil {
				t.Fatal("expected non-nil config")
			}
			if cfg.ChainID == nil {
				t.Fatal("expected non-nil ChainID")
			}
		})
	}
}

func TestGetNetworkConfig_UnknownValidCaip2(t *testing.T) {
	t.Parallel()
	// An unknown but valid CAIP-2 address should still return a partial config
	cfg, err := GetNetworkConfig("eip155:12345678")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg == nil {
		t.Fatal("expected non-nil config")
	}
	if cfg.ChainID.Int64() != 12345678 {
		t.Fatalf("expected chainID 12345678, got %s", cfg.ChainID)
	}
}

func TestGetNetworkConfig_InvalidFormat(t *testing.T) {
	t.Parallel()
	cases := []string{
		"",
		"base",
		"mainnet",
		"eip155:",
		"eip155:notanumber",
	}
	for _, network := range cases {
		network := network
		t.Run(network, func(t *testing.T) {
			t.Parallel()
			_, err := GetNetworkConfig(network)
			if err == nil {
				t.Fatalf("expected error for %q, got nil", network)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// GetAssetInfo
// ---------------------------------------------------------------------------

func TestGetAssetInfo_DefaultAsset(t *testing.T) {
	t.Parallel()
	// Base mainnet should have USDC as default asset
	info, err := GetAssetInfo("eip155:8453", "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if info == nil {
		t.Fatal("expected non-nil AssetInfo")
	}
	if info.Address == "" {
		t.Fatal("expected non-empty Address")
	}
}

func TestGetAssetInfo_KnownAddress(t *testing.T) {
	t.Parallel()
	// Get the default asset address for Base mainnet, then query it explicitly
	defaultInfo, err := GetAssetInfo("eip155:8453", "")
	if err != nil {
		t.Fatalf("setup error: %v", err)
	}
	// Now query by address
	info, err := GetAssetInfo("eip155:8453", defaultInfo.Address)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if info.Address == "" {
		t.Fatal("expected non-empty Address")
	}
}

func TestGetAssetInfo_UnknownAddress(t *testing.T) {
	t.Parallel()
	// An unknown address should return generic info, not an error
	info, err := GetAssetInfo("eip155:8453", "0x1111111111111111111111111111111111111111")
	if err != nil {
		t.Fatalf("unexpected error for unknown address: %v", err)
	}
	if info.Name != "Unknown Token" {
		t.Fatalf("expected 'Unknown Token', got %q", info.Name)
	}
	if info.Decimals != 18 {
		t.Fatalf("expected 18 decimals, got %d", info.Decimals)
	}
}

func TestGetAssetInfo_NoDefaultAsset(t *testing.T) {
	t.Parallel()
	// An unknown CAIP-2 network with no config should error when requesting default asset
	_, err := GetAssetInfo("eip155:99999999", "")
	if err == nil {
		t.Fatal("expected error for network with no default asset, got nil")
	}
}

// ---------------------------------------------------------------------------
// CreateValidityWindow
// ---------------------------------------------------------------------------

func TestCreateValidityWindow_Ordering(t *testing.T) {
	t.Parallel()
	validAfter, validBefore := CreateValidityWindow(5 * time.Minute)
	if validAfter == nil || validBefore == nil {
		t.Fatal("got nil timestamps")
	}
	if validAfter.Cmp(validBefore) >= 0 {
		t.Fatalf("validAfter (%s) must be < validBefore (%s)", validAfter, validBefore)
	}
}

func TestCreateValidityWindow_DurationAffectsValidBefore(t *testing.T) {
	t.Parallel()
	_, before5 := CreateValidityWindow(5 * time.Minute)
	_, before10 := CreateValidityWindow(10 * time.Minute)
	if before10.Cmp(before5) <= 0 {
		t.Fatal("longer duration should produce larger validBefore")
	}
}

// ---------------------------------------------------------------------------
// HexToBytes / BytesToHex
// ---------------------------------------------------------------------------

func TestHexToBytes_ValidInputs(t *testing.T) {
	t.Parallel()
	cases := []struct {
		input string
		want  []byte
	}{
		{"0xdeadbeef", []byte{0xde, 0xad, 0xbe, 0xef}},
		{"deadbeef", []byte{0xde, 0xad, 0xbe, 0xef}},
		{"0x", []byte{}},
		{"", []byte{}},
	}
	for _, tc := range cases {
		tc := tc
		t.Run(tc.input, func(t *testing.T) {
			t.Parallel()
			got, err := HexToBytes(tc.input)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if len(got) != len(tc.want) {
				t.Fatalf("length mismatch: want %d, got %d", len(tc.want), len(got))
			}
			for i, b := range got {
				if b != tc.want[i] {
					t.Fatalf("byte[%d]: want 0x%02x, got 0x%02x", i, tc.want[i], b)
				}
			}
		})
	}
}

func TestHexToBytes_Invalid(t *testing.T) {
	t.Parallel()
	_, err := HexToBytes("0xZZZZ")
	if err == nil {
		t.Fatal("expected error for invalid hex, got nil")
	}
}

func TestBytesToHex(t *testing.T) {
	t.Parallel()
	cases := []struct {
		input []byte
		want  string
	}{
		{[]byte{0xde, 0xad, 0xbe, 0xef}, "0xdeadbeef"},
		{[]byte{}, "0x"},
		{[]byte{0x00}, "0x00"},
		{[]byte{0xff, 0xff}, "0xffff"},
	}
	for _, tc := range cases {
		tc := tc
		t.Run(tc.want, func(t *testing.T) {
			t.Parallel()
			got := BytesToHex(tc.input)
			if got != tc.want {
				t.Fatalf("want %q, got %q", tc.want, got)
			}
		})
	}
}

func TestHexBytesRoundTrip(t *testing.T) {
	t.Parallel()
	original := []byte{0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef}
	hex := BytesToHex(original)
	roundTripped, err := HexToBytes(hex)
	if err != nil {
		t.Fatalf("HexToBytes error: %v", err)
	}
	if len(roundTripped) != len(original) {
		t.Fatalf("length mismatch after round trip")
	}
	for i, b := range roundTripped {
		if b != original[i] {
			t.Fatalf("byte[%d] mismatch: want %02x, got %02x", i, original[i], b)
		}
	}
}
