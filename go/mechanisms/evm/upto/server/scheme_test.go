package server

import (
	"fmt"
	"math/big"
	"testing"

	x402 "github.com/x402-foundation/x402/go"
	"github.com/x402-foundation/x402/go/mechanisms/evm"
)

// ─── helpers ─────────────────────────────────────────────────────────────────

func newScheme() *UptoEvmScheme {
	return NewUptoEvmScheme()
}

const (
	// Base Sepolia: eip155:84532 is the canonical CAIP-2 network identifier used by the evm package.
	testNetworkStr    = "eip155:84532"
	testPayTo         = "0xf1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1"
	testAssetAddress  = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
	testUnknownAsset  = "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"
	testInvalidAddr   = "not-an-address"
	testUnknownNetStr = "unknown-network-xyz"
)

var (
	testNetwork    = x402.Network(testNetworkStr)
	testUnknownNet = x402.Network(testUnknownNetStr)
)

// ─── NewUptoEvmScheme ─────────────────────────────────────────────────────────

func TestNewUptoEvmScheme_NotNil(t *testing.T) {
	s := NewUptoEvmScheme()
	if s == nil {
		t.Fatal("expected non-nil UptoEvmScheme")
	}
}

func TestNewUptoEvmScheme_EmptyParsers(t *testing.T) {
	s := NewUptoEvmScheme()
	if len(s.moneyParsers) != 0 {
		t.Errorf("expected 0 parsers, got %d", len(s.moneyParsers))
	}
}

// ─── Scheme() ────────────────────────────────────────────────────────────────

func TestScheme_ReturnsUpto(t *testing.T) {
	s := newScheme()
	if got := s.Scheme(); got != evm.SchemeUpto {
		t.Errorf("Scheme() = %q, want %q", got, evm.SchemeUpto)
	}
}

// ─── GetAssetDecimals ─────────────────────────────────────────────────────────

func TestGetAssetDecimals_KnownAsset(t *testing.T) {
	s := newScheme()
	// USDC on base-sepolia has Decimals = 6 (DefaultDecimals)
	decimals := s.GetAssetDecimals(testAssetAddress, testNetwork)
	if decimals != 6 {
		t.Errorf("GetAssetDecimals = %d, want 6", decimals)
	}
}

func TestGetAssetDecimals_UnknownValidAddress_Returns18(t *testing.T) {
	s := newScheme()
	// An unrecognized address is returned as an "Unknown Token" with Decimals: 18.
	decimals := s.GetAssetDecimals(testUnknownAsset, testNetwork)
	if decimals != 18 {
		t.Errorf("GetAssetDecimals for unknown valid address = %d, want 18", decimals)
	}
}

func TestGetAssetDecimals_UnknownNetwork_NonAddressAsset_FallsBackTo6(t *testing.T) {
	s := newScheme()
	// A non-address asset on an unknown network causes GetAssetInfo to error,
	// so GetAssetDecimals falls back to 6.
	decimals := s.GetAssetDecimals("USDC", testUnknownNet)
	if decimals != 6 {
		t.Errorf("GetAssetDecimals for symbol on unknown network = %d, want 6", decimals)
	}
}

// ─── RegisterMoneyParser ──────────────────────────────────────────────────────

func TestRegisterMoneyParser_ReturnsSelf(t *testing.T) {
	s := newScheme()
	parser := func(amount float64, network x402.Network) (*x402.AssetAmount, error) {
		return nil, nil
	}
	ret := s.RegisterMoneyParser(parser)
	if ret != s {
		t.Error("RegisterMoneyParser should return the receiver for chaining")
	}
}

func TestRegisterMoneyParser_AddsParser(t *testing.T) {
	s := newScheme()
	parser := func(amount float64, network x402.Network) (*x402.AssetAmount, error) {
		return nil, nil
	}
	s.RegisterMoneyParser(parser)
	if len(s.moneyParsers) != 1 {
		t.Errorf("expected 1 parser after RegisterMoneyParser, got %d", len(s.moneyParsers))
	}
}

func TestRegisterMoneyParser_MultipleChained(t *testing.T) {
	s := newScheme()
	noop := func(amount float64, network x402.Network) (*x402.AssetAmount, error) { return nil, nil }
	s.RegisterMoneyParser(noop).RegisterMoneyParser(noop).RegisterMoneyParser(noop)
	if len(s.moneyParsers) != 3 {
		t.Errorf("expected 3 parsers, got %d", len(s.moneyParsers))
	}
}

// ─── ParsePrice — map path ────────────────────────────────────────────────────

func TestParsePrice_MapWithAmountAndAsset(t *testing.T) {
	s := newScheme()
	price := map[string]interface{}{
		"amount": "1000000",
		"asset":  testAssetAddress,
	}
	result, err := s.ParsePrice(price, testNetwork)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Amount != "1000000" {
		t.Errorf("Amount = %q, want %q", result.Amount, "1000000")
	}
	if result.Asset != testAssetAddress {
		t.Errorf("Asset = %q, want %q", result.Asset, testAssetAddress)
	}
}

func TestParsePrice_MapWithAmountAndAssetAndExtra(t *testing.T) {
	s := newScheme()
	price := map[string]interface{}{
		"amount": "500000",
		"asset":  testAssetAddress,
		"extra":  map[string]interface{}{"key": "val"},
	}
	result, err := s.ParsePrice(price, testNetwork)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Extra["key"] != "val" {
		t.Errorf("Extra[key] = %v, want %q", result.Extra["key"], "val")
	}
}

func TestParsePrice_MapWithAmountNonString_Error(t *testing.T) {
	s := newScheme()
	price := map[string]interface{}{
		"amount": 1000000, // int, not string
		"asset":  testAssetAddress,
	}
	_, err := s.ParsePrice(price, testNetwork)
	if err == nil {
		t.Fatal("expected error for non-string amount, got nil")
	}
	if err.Error() != ErrAmountMustBeString {
		t.Errorf("error = %q, want %q", err.Error(), ErrAmountMustBeString)
	}
}

func TestParsePrice_MapWithAmountButNoAsset_Error(t *testing.T) {
	s := newScheme()
	price := map[string]interface{}{
		"amount": "1000000",
		// no "asset" key
	}
	_, err := s.ParsePrice(price, testNetwork)
	if err == nil {
		t.Fatal("expected error for missing asset, got nil")
	}
	if err.Error() != ErrAssetAddressRequired {
		t.Errorf("error = %q, want %q", err.Error(), ErrAssetAddressRequired)
	}
}

func TestParsePrice_MapWithAmountAndEmptyAsset_Error(t *testing.T) {
	s := newScheme()
	price := map[string]interface{}{
		"amount": "1000000",
		"asset":  "",
	}
	_, err := s.ParsePrice(price, testNetwork)
	if err == nil {
		t.Fatal("expected error for empty asset, got nil")
	}
	if err.Error() != ErrAssetAddressRequired {
		t.Errorf("error = %q, want %q", err.Error(), ErrAssetAddressRequired)
	}
}

// ─── ParsePrice — scalar path ─────────────────────────────────────────────────

func TestParsePrice_DollarString(t *testing.T) {
	s := newScheme()
	result, err := s.ParsePrice("$1.00", testNetwork)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Asset == "" {
		t.Error("expected non-empty Asset from defaultMoneyConversion")
	}
	// $1.00 → 1_000_000 (6 decimals)
	if result.Amount != "1000000" {
		t.Errorf("Amount = %q, want %q", result.Amount, "1000000")
	}
}

func TestParsePrice_PlainDecimalString(t *testing.T) {
	s := newScheme()
	result, err := s.ParsePrice("0.50", testNetwork)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// $0.50 → 500_000
	if result.Amount != "500000" {
		t.Errorf("Amount = %q, want %q", result.Amount, "500000")
	}
}

func TestParsePrice_Float64(t *testing.T) {
	s := newScheme()
	result, err := s.ParsePrice(float64(2.00), testNetwork)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Amount != "2000000" {
		t.Errorf("Amount = %q, want %q", result.Amount, "2000000")
	}
}

func TestParsePrice_Int(t *testing.T) {
	s := newScheme()
	result, err := s.ParsePrice(int(1), testNetwork)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Amount != "1000000" {
		t.Errorf("Amount = %q, want %q", result.Amount, "1000000")
	}
}

func TestParsePrice_Int64(t *testing.T) {
	s := newScheme()
	result, err := s.ParsePrice(int64(3), testNetwork)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Amount != "3000000" {
		t.Errorf("Amount = %q, want %q", result.Amount, "3000000")
	}
}

func TestParsePrice_UnsupportedType_Error(t *testing.T) {
	s := newScheme()
	_, err := s.ParsePrice(true, testNetwork)
	if err == nil {
		t.Fatal("expected error for bool price, got nil")
	}
}

func TestParsePrice_InvalidStringNotNumeric_Error(t *testing.T) {
	s := newScheme()
	_, err := s.ParsePrice("not-a-number", testNetwork)
	if err == nil {
		t.Fatal("expected error for non-numeric string, got nil")
	}
}

func TestParsePrice_UnknownNetwork_Error(t *testing.T) {
	s := newScheme()
	_, err := s.ParsePrice(float64(1.0), testUnknownNet)
	if err == nil {
		t.Fatal("expected error for unknown network, got nil")
	}
}

// ─── ParsePrice — custom MoneyParser ─────────────────────────────────────────

func TestParsePrice_CustomParserTakesPriority(t *testing.T) {
	s := newScheme()
	customAsset := "0xCustomAssetAddress00000000000000000000000a"
	s.RegisterMoneyParser(func(amount float64, net x402.Network) (*x402.AssetAmount, error) {
		return &x402.AssetAmount{Amount: "9999", Asset: customAsset}, nil
	})

	result, err := s.ParsePrice(float64(1.0), testNetwork)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Asset != customAsset {
		t.Errorf("expected custom parser result, got Asset=%q", result.Asset)
	}
	if result.Amount != "9999" {
		t.Errorf("expected Amount=9999, got %q", result.Amount)
	}
}

func TestParsePrice_CustomParserSkippedOnError_FallsToDefault(t *testing.T) {
	s := newScheme()
	// Parser that returns an error — should be skipped, falling through to defaultMoneyConversion
	s.RegisterMoneyParser(func(amount float64, net x402.Network) (*x402.AssetAmount, error) {
		return nil, fmt.Errorf("custom parser error")
	})

	result, err := s.ParsePrice(float64(1.0), testNetwork)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Should fall through to default conversion: 1.0 → 1_000_000 on base-sepolia
	if result.Amount != "1000000" {
		t.Errorf("Amount = %q, want %q", result.Amount, "1000000")
	}
}

func TestParsePrice_CustomParserReturnsNil_FallsToDefault(t *testing.T) {
	s := newScheme()
	// Parser that returns (nil, nil) — should be skipped
	s.RegisterMoneyParser(func(amount float64, net x402.Network) (*x402.AssetAmount, error) {
		return nil, nil
	})

	result, err := s.ParsePrice(float64(0.50), testNetwork)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Amount != "500000" {
		t.Errorf("Amount = %q, want %q", result.Amount, "500000")
	}
}

// ─── ParsePrice — extra metadata set by defaultMoneyConversion ───────────────

func TestParsePrice_DefaultConversion_SetsPermit2AssetTransferMethod(t *testing.T) {
	s := newScheme()
	result, err := s.ParsePrice(float64(1.0), testNetwork)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Extra["assetTransferMethod"] != "permit2" {
		t.Errorf("Extra[assetTransferMethod] = %v, want %q", result.Extra["assetTransferMethod"], "permit2")
	}
}

func TestParsePrice_DefaultConversion_SetsNameAndVersion(t *testing.T) {
	s := newScheme()
	result, err := s.ParsePrice(float64(1.0), testNetwork)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, ok := result.Extra["name"]; !ok {
		t.Error("Extra[name] not set")
	}
	if _, ok := result.Extra["version"]; !ok {
		t.Error("Extra[version] not set")
	}
}

// ─── ValidatePaymentRequirements ─────────────────────────────────────────────

func validRequirements() x402.PaymentRequirements {
	return x402.PaymentRequirements{
		PayTo:   testPayTo,
		Amount:  "1000000",
		Asset:   testAssetAddress,
		Network: testNetworkStr,
	}
}

func TestValidatePaymentRequirements_ValidInput_NoError(t *testing.T) {
	s := newScheme()
	if err := s.ValidatePaymentRequirements(validRequirements()); err != nil {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestValidatePaymentRequirements_InvalidPayTo_Error(t *testing.T) {
	s := newScheme()
	req := validRequirements()
	req.PayTo = testInvalidAddr
	err := s.ValidatePaymentRequirements(req)
	if err == nil {
		t.Fatal("expected error for invalid payTo, got nil")
	}
}

func TestValidatePaymentRequirements_EmptyAmount_Error(t *testing.T) {
	s := newScheme()
	req := validRequirements()
	req.Amount = ""
	err := s.ValidatePaymentRequirements(req)
	if err == nil {
		t.Fatal("expected error for empty amount, got nil")
	}
}

func TestValidatePaymentRequirements_NonNumericAmount_Error(t *testing.T) {
	s := newScheme()
	req := validRequirements()
	req.Amount = "abc"
	err := s.ValidatePaymentRequirements(req)
	if err == nil {
		t.Fatal("expected error for non-numeric amount, got nil")
	}
}

func TestValidatePaymentRequirements_ZeroAmount_Error(t *testing.T) {
	s := newScheme()
	req := validRequirements()
	req.Amount = "0"
	err := s.ValidatePaymentRequirements(req)
	if err == nil {
		t.Fatal("expected error for zero amount, got nil")
	}
}

func TestValidatePaymentRequirements_NegativeAmount_Error(t *testing.T) {
	s := newScheme()
	req := validRequirements()
	req.Amount = "-1"
	err := s.ValidatePaymentRequirements(req)
	if err == nil {
		t.Fatal("expected error for negative amount, got nil")
	}
}

func TestValidatePaymentRequirements_EmptyAsset_Valid(t *testing.T) {
	// Empty asset is acceptable — the scheme will use the default asset.
	s := newScheme()
	req := validRequirements()
	req.Asset = ""
	if err := s.ValidatePaymentRequirements(req); err != nil {
		t.Errorf("unexpected error for empty asset: %v", err)
	}
}

func TestValidatePaymentRequirements_NonAddressAsset_OnUnknownNetwork_Error(t *testing.T) {
	// If the asset is not a valid address AND the network has no default asset configured,
	// GetAssetInfo should fail, propagating an error.
	s := newScheme()
	req := validRequirements()
	req.Asset = testInvalidAddr        // not an address
	req.Network = testUnknownNetStr    // unknown network → GetNetworkConfig fails
	err := s.ValidatePaymentRequirements(req)
	if err == nil {
		t.Fatal("expected error for invalid asset on unknown network, got nil")
	}
}

// ─── defaultMoneyConversion — large integer amount ────────────────────────────

func TestParsePrice_LargeIntegerAmount_NoDecimalPath(t *testing.T) {
	s := newScheme()
	// 1_000_000 units as float64 integer — should use the fast integer path
	result, err := s.ParsePrice(float64(1000000), testNetwork)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Integer path: fmt.Sprintf("%.0f", amount) = "1000000"
	n, _ := new(big.Int).SetString(result.Amount, 10)
	if n == nil || n.Sign() <= 0 {
		t.Errorf("unexpected Amount %q", result.Amount)
	}
}
