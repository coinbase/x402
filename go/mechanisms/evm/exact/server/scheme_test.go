package server

import (
	"context"
	"strings"
	"testing"

	x402 "github.com/x402-foundation/x402/go"
)

const (
	baseSepoliaUSDC   = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
	validPayToAddress = "0x1234567890123456789012345678901234567890"
)

// TestScheme verifies the scheme identifier.
func TestScheme(t *testing.T) {
	s := NewExactEvmScheme()
	if s.Scheme() != "exact" {
		t.Errorf("Expected scheme='exact', got %q", s.Scheme())
	}
}

// TestGetAssetDecimals verifies decimal lookup for known and unknown assets.
func TestGetAssetDecimals(t *testing.T) {
	s := NewExactEvmScheme()

	// Known USDC asset on Base mainnet → 6 decimals
	dec := s.GetAssetDecimals(baseMainnetUSDC, "eip155:8453")
	if dec != 6 {
		t.Errorf("Expected 6 decimals for USDC on Base mainnet, got %d", dec)
	}

	// Unknown valid address on any EVM network → 18 decimals (generic token default)
	// GetAssetInfo succeeds but returns generic AssetInfo{Decimals: 18} for unknown addresses
	dec = s.GetAssetDecimals("0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef", "eip155:8453")
	if dec != 18 {
		t.Errorf("Expected 18 decimals for unknown EVM token, got %d", dec)
	}
}

// TestParsePrice_IntAndInt64 verifies int and int64 prices are converted correctly.
func TestParsePrice_IntAndInt64(t *testing.T) {
	s := NewExactEvmScheme()

	tests := []struct {
		price          interface{}
		expectedAmount string
	}{
		{int(1), "1000000"},
		{int64(2), "2000000"},
	}

	for _, tt := range tests {
		result, err := s.ParsePrice(tt.price, "eip155:8453")
		if err != nil {
			t.Errorf("price=%v: unexpected error: %v", tt.price, err)
			continue
		}
		if result.Amount != tt.expectedAmount {
			t.Errorf("price=%v: expected amount %s, got %s", tt.price, tt.expectedAmount, result.Amount)
		}
	}
}

// TestParsePrice_InvalidString verifies error on unparseable price string.
func TestParsePrice_InvalidString(t *testing.T) {
	s := NewExactEvmScheme()
	_, err := s.ParsePrice("not-a-number", "eip155:8453")
	if err == nil {
		t.Error("Expected error for invalid price string")
	}
}

// TestParsePrice_UnsupportedType verifies error on unsupported price type.
func TestParsePrice_UnsupportedType(t *testing.T) {
	s := NewExactEvmScheme()
	_, err := s.ParsePrice([]int{1, 2, 3}, "eip155:8453")
	if err == nil {
		t.Error("Expected error for unsupported price type")
	}
}

// TestParsePrice_AssetAmountPassthrough verifies direct AssetAmount map is returned unchanged.
func TestParsePrice_AssetAmountPassthrough(t *testing.T) {
	s := NewExactEvmScheme()

	price := map[string]interface{}{
		"amount": "1500000",
		"asset":  baseSepoliaUSDC,
		"extra":  map[string]interface{}{"name": "USD Coin"},
	}

	result, err := s.ParsePrice(price, "eip155:84532")
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}
	if result.Amount != "1500000" {
		t.Errorf("Expected '1500000', got %s", result.Amount)
	}
	if result.Asset != baseSepoliaUSDC {
		t.Errorf("Expected asset passthrough %s, got %s", baseSepoliaUSDC, result.Asset)
	}
	if result.Extra["name"] != "USD Coin" {
		t.Errorf("Expected extra passthrough, got %v", result.Extra["name"])
	}
}

// TestParsePrice_AssetAmountMissingAsset verifies error when asset key is absent.
func TestParsePrice_AssetAmountMissingAsset(t *testing.T) {
	s := NewExactEvmScheme()

	price := map[string]interface{}{
		"amount": "1000000",
		// no "asset" key
	}
	_, err := s.ParsePrice(price, "eip155:8453")
	if err == nil {
		t.Error("Expected error for AssetAmount map missing 'asset'")
	}
}

// TestParsePrice_AssetAmountNonStringAmount verifies error when amount is not a string.
func TestParsePrice_AssetAmountNonStringAmount(t *testing.T) {
	s := NewExactEvmScheme()

	price := map[string]interface{}{
		"amount": 1000000, // int instead of string
		"asset":  baseMainnetUSDC,
	}
	_, err := s.ParsePrice(price, "eip155:8453")
	if err == nil {
		t.Error("Expected error for non-string amount in AssetAmount map")
	}
}

// TestValidatePaymentRequirements_Valid verifies a fully valid set of requirements passes.
func TestValidatePaymentRequirements_Valid(t *testing.T) {
	s := NewExactEvmScheme()

	req := x402.PaymentRequirements{
		Scheme:  "exact",
		Network: "eip155:8453",
		Amount:  "1000000",
		Asset:   baseMainnetUSDC,
		PayTo:   validPayToAddress,
	}
	if err := s.ValidatePaymentRequirements(req); err != nil {
		t.Errorf("Expected valid requirements to pass, got error: %v", err)
	}
}

// TestValidatePaymentRequirements_InvalidPayTo verifies rejection of an invalid PayTo.
func TestValidatePaymentRequirements_InvalidPayTo(t *testing.T) {
	s := NewExactEvmScheme()

	req := x402.PaymentRequirements{
		Scheme:  "exact",
		Network: "eip155:8453",
		Amount:  "1000000",
		PayTo:   "not-an-address",
	}
	if err := s.ValidatePaymentRequirements(req); err == nil {
		t.Error("Expected error for invalid PayTo")
	}
}

// TestValidatePaymentRequirements_EmptyAmount verifies rejection of empty amount.
func TestValidatePaymentRequirements_EmptyAmount(t *testing.T) {
	s := NewExactEvmScheme()

	req := x402.PaymentRequirements{
		Scheme:  "exact",
		Network: "eip155:8453",
		Amount:  "",
		PayTo:   validPayToAddress,
	}
	if err := s.ValidatePaymentRequirements(req); err == nil {
		t.Error("Expected error for empty amount")
	}
}

// TestValidatePaymentRequirements_InvalidAmounts verifies rejection of non-positive amounts.
func TestValidatePaymentRequirements_InvalidAmounts(t *testing.T) {
	s := NewExactEvmScheme()

	for _, amount := range []string{"0", "-1", "not-a-number"} {
		req := x402.PaymentRequirements{
			Scheme:  "exact",
			Network: "eip155:8453",
			Amount:  amount,
			PayTo:   validPayToAddress,
		}
		if err := s.ValidatePaymentRequirements(req); err == nil {
			t.Errorf("Expected error for amount %q", amount)
		}
	}
}

// TestEnhancePaymentRequirements_SetsAsset verifies that missing asset is filled in.
func TestEnhancePaymentRequirements_SetsAsset(t *testing.T) {
	s := NewExactEvmScheme()

	req := x402.PaymentRequirements{
		Scheme:  "exact",
		Network: "eip155:8453",
		Amount:  "1000000",
		// no Asset
		PayTo: validPayToAddress,
	}

	enhanced, err := s.EnhancePaymentRequirements(context.Background(), req, x402.SupportedKind{}, nil)
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}

	if enhanced.Asset == "" {
		t.Error("Expected asset to be filled in by EnhancePaymentRequirements")
	}
}

// TestEnhancePaymentRequirements_ConvertDecimalAmount verifies decimal amounts are converted to integer units.
func TestEnhancePaymentRequirements_ConvertDecimalAmount(t *testing.T) {
	s := NewExactEvmScheme()

	req := x402.PaymentRequirements{
		Scheme:  "exact",
		Network: "eip155:8453",
		Amount:  "1.500000", // decimal
		Asset:   baseMainnetUSDC,
		PayTo:   validPayToAddress,
	}

	enhanced, err := s.EnhancePaymentRequirements(context.Background(), req, x402.SupportedKind{}, nil)
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}

	if strings.Contains(enhanced.Amount, ".") {
		t.Errorf("Expected integer amount after enhancement, got %s", enhanced.Amount)
	}
}

// TestEnhancePaymentRequirements_ExtensionKeysCopied verifies extra fields from SupportedKind are copied.
func TestEnhancePaymentRequirements_ExtensionKeysCopied(t *testing.T) {
	s := NewExactEvmScheme()

	req := x402.PaymentRequirements{
		Scheme:  "exact",
		Network: "eip155:8453",
		Amount:  "1000000",
		Asset:   baseMainnetUSDC,
		PayTo:   validPayToAddress,
	}

	kind := x402.SupportedKind{
		Scheme:  "exact",
		Network: "eip155:8453",
		Extra: map[string]interface{}{
			"customExtension": "customValue",
		},
	}

	enhanced, err := s.EnhancePaymentRequirements(context.Background(), req, kind, []string{"customExtension"})
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}

	if enhanced.Extra["customExtension"] != "customValue" {
		t.Errorf("Expected customExtension='customValue', got %v", enhanced.Extra["customExtension"])
	}
}

// TestGetDisplayAmount_Valid verifies human-readable amount formatting.
func TestGetDisplayAmount_Valid(t *testing.T) {
	s := NewExactEvmScheme()

	display, err := s.GetDisplayAmount("1500000", "eip155:8453", baseMainnetUSDC)
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}

	if !strings.Contains(display, "1.5") {
		t.Errorf("Expected '1.5' in display, got %q", display)
	}
	if !strings.Contains(display, "USDC") {
		t.Errorf("Expected 'USDC' in display, got %q", display)
	}
}

// TestGetDisplayAmount_InvalidAmount verifies error for non-numeric amount.
func TestGetDisplayAmount_InvalidAmount(t *testing.T) {
	s := NewExactEvmScheme()

	_, err := s.GetDisplayAmount("not-a-number", "eip155:8453", baseMainnetUSDC)
	if err == nil {
		t.Error("Expected error for non-numeric amount string")
	}
}

// TestConvertToTokenAmount_Valid verifies decimal → smallest unit conversion.
func TestConvertToTokenAmount_Valid(t *testing.T) {
	s := NewExactEvmScheme()

	result, err := s.ConvertToTokenAmount("1.500000", "eip155:8453")
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}

	if result != "1500000" {
		t.Errorf("Expected '1500000', got %s", result)
	}
}

// TestConvertToTokenAmount_InvalidNetwork verifies error for unknown network.
func TestConvertToTokenAmount_InvalidNetwork(t *testing.T) {
	s := NewExactEvmScheme()

	_, err := s.ConvertToTokenAmount("1.0", "eip155:99999999")
	if err == nil {
		t.Error("Expected error for unknown network")
	}
}

// TestConvertFromTokenAmount_Valid verifies smallest-unit → decimal conversion.
func TestConvertFromTokenAmount_Valid(t *testing.T) {
	s := NewExactEvmScheme()

	result, err := s.ConvertFromTokenAmount("1500000", "eip155:8453")
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}

	if result != "1.5" {
		t.Errorf("Expected '1.5', got %s", result)
	}
}

// TestConvertFromTokenAmount_InvalidAmount verifies error for a non-integer token amount.
func TestConvertFromTokenAmount_InvalidAmount(t *testing.T) {
	s := NewExactEvmScheme()

	_, err := s.ConvertFromTokenAmount("1.5", "eip155:8453")
	if err == nil {
		t.Error("Expected error for decimal token amount (not a valid integer)")
	}
}

// TestConvertFromTokenAmount_ZeroAmount verifies zero token amount formatting.
func TestConvertFromTokenAmount_ZeroAmount(t *testing.T) {
	s := NewExactEvmScheme()

	result, err := s.ConvertFromTokenAmount("0", "eip155:8453")
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}
	if result != "0" {
		t.Errorf("Expected '0', got %s", result)
	}
}

// TestGetSupportedNetworks verifies the list is non-empty and includes Base mainnet.
func TestGetSupportedNetworks(t *testing.T) {
	s := NewExactEvmScheme()

	networks := s.GetSupportedNetworks()
	if len(networks) == 0 {
		t.Fatal("Expected at least one supported network")
	}

	found := false
	for _, n := range networks {
		if n == "eip155:8453" {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("Expected 'eip155:8453' in supported networks, got %v", networks)
	}
}
