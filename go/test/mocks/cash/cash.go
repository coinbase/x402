package cash

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	x402 "github.com/coinbase/x402/go"
)

// ============================================================================
// Cash Scheme Network Client
// ============================================================================

// SchemeNetworkClient implements the client side of the cash payment scheme
type SchemeNetworkClient struct {
	payer string
}

// NewSchemeNetworkClient creates a new cash scheme client
func NewSchemeNetworkClient(payer string) *SchemeNetworkClient {
	return &SchemeNetworkClient{
		payer: payer,
	}
}

// Scheme returns the payment scheme identifier
func (c *SchemeNetworkClient) Scheme() string {
	return "cash"
}

// CreatePaymentPayload creates a payment payload for the cash scheme
func (c *SchemeNetworkClient) CreatePaymentPayload(ctx context.Context, version int, requirements x402.PaymentRequirements) (x402.PartialPaymentPayload, error) {
	validUntil := time.Now().Add(time.Duration(requirements.MaxTimeoutSeconds) * time.Second).Unix()

	return x402.PartialPaymentPayload{
		X402Version: version,
		Payload: map[string]interface{}{
			"signature":  fmt.Sprintf("~%s", c.payer),
			"validUntil": strconv.FormatInt(validUntil, 10),
			"name":       c.payer,
		},
	}, nil
}

// ============================================================================
// Cash Scheme Network Facilitator
// ============================================================================

// SchemeNetworkFacilitator implements the facilitator side of the cash payment scheme
type SchemeNetworkFacilitator struct{}

// NewSchemeNetworkFacilitator creates a new cash scheme facilitator
func NewSchemeNetworkFacilitator() *SchemeNetworkFacilitator {
	return &SchemeNetworkFacilitator{}
}

// Scheme returns the payment scheme identifier
func (f *SchemeNetworkFacilitator) Scheme() string {
	return "cash"
}

// Verify verifies a payment payload against requirements
func (f *SchemeNetworkFacilitator) Verify(ctx context.Context, payload x402.PaymentPayload, requirements x402.PaymentRequirements) (x402.VerifyResponse, error) {
	// Extract payload fields
	signature, ok := payload.Payload["signature"].(string)
	if !ok {
		return x402.VerifyResponse{
			IsValid:       false,
			InvalidReason: "missing_signature",
		}, nil
	}

	name, ok := payload.Payload["name"].(string)
	if !ok {
		return x402.VerifyResponse{
			IsValid:       false,
			InvalidReason: "missing_name",
		}, nil
	}

	validUntilStr, ok := payload.Payload["validUntil"].(string)
	if !ok {
		return x402.VerifyResponse{
			IsValid:       false,
			InvalidReason: "missing_validUntil",
		}, nil
	}

	// Check signature
	expectedSig := fmt.Sprintf("~%s", name)
	if signature != expectedSig {
		return x402.VerifyResponse{
			IsValid:       false,
			InvalidReason: "invalid_signature",
		}, nil
	}

	// Check expiration
	validUntil, err := strconv.ParseInt(validUntilStr, 10, 64)
	if err != nil {
		return x402.VerifyResponse{
			IsValid:       false,
			InvalidReason: "invalid_validUntil",
		}, nil
	}

	if validUntil < time.Now().Unix() {
		return x402.VerifyResponse{
			IsValid:       false,
			InvalidReason: "expired_signature",
		}, nil
	}

	return x402.VerifyResponse{
		IsValid:       true,
		InvalidReason: "",
		Payer:         signature,
	}, nil
}

// Settle settles a payment based on the payload and requirements
func (f *SchemeNetworkFacilitator) Settle(ctx context.Context, payload x402.PaymentPayload, requirements x402.PaymentRequirements) (x402.SettleResponse, error) {
	// First verify the payment
	verifyResponse, err := f.Verify(ctx, payload, requirements)
	if err != nil {
		return x402.SettleResponse{
			Success:     false,
			ErrorReason: err.Error(),
			Network:     requirements.Network,
		}, nil
	}

	if !verifyResponse.IsValid {
		return x402.SettleResponse{
			Success:     false,
			ErrorReason: verifyResponse.InvalidReason,
			Payer:       verifyResponse.Payer,
			Network:     requirements.Network,
		}, nil
	}

	// Extract name for transaction message
	name, _ := payload.Payload["name"].(string)

	return x402.SettleResponse{
		Success:     true,
		Transaction: fmt.Sprintf("%s transferred %s %s to %s", name, requirements.Amount, requirements.Asset, requirements.PayTo),
		Network:     requirements.Network,
		Payer:       verifyResponse.Payer,
	}, nil
}

// ============================================================================
// Cash Scheme Network Service
// ============================================================================

// SchemeNetworkService implements the service side of the cash payment scheme
type SchemeNetworkService struct{}

// NewSchemeNetworkService creates a new cash scheme service
func NewSchemeNetworkService() *SchemeNetworkService {
	return &SchemeNetworkService{}
}

// Scheme returns the payment scheme identifier
func (s *SchemeNetworkService) Scheme() string {
	return "cash"
}

// ParsePrice parses a price into asset amount format
func (s *SchemeNetworkService) ParsePrice(price x402.Price, network x402.Network) (x402.AssetAmount, error) {
	// Handle pre-parsed price object
	if assetAmount, ok := price.(x402.AssetAmount); ok {
		return assetAmount, nil
	}

	// Handle map format
	if priceMap, ok := price.(map[string]interface{}); ok {
		amount, _ := priceMap["amount"].(string)
		asset, _ := priceMap["asset"].(string)
		if asset == "" {
			asset = "USD"
		}
		return x402.AssetAmount{
			Amount: amount,
			Asset:  asset,
			Extra:  nil,
		}, nil
	}

	// Parse string prices like "$10" or "10 USD"
	if priceStr, ok := price.(string); ok {
		// Remove dollar sign and USD suffix
		cleanPrice := strings.TrimPrefix(priceStr, "$")
		cleanPrice = strings.TrimSuffix(cleanPrice, " USD")
		cleanPrice = strings.TrimSuffix(cleanPrice, "USD")
		cleanPrice = strings.TrimSpace(cleanPrice)

		return x402.AssetAmount{
			Amount: cleanPrice,
			Asset:  "USD",
			Extra:  nil,
		}, nil
	}

	// Handle number input
	if priceNum, ok := price.(float64); ok {
		return x402.AssetAmount{
			Amount: fmt.Sprintf("%.2f", priceNum),
			Asset:  "USD",
			Extra:  nil,
		}, nil
	}

	if priceInt, ok := price.(int); ok {
		return x402.AssetAmount{
			Amount: strconv.Itoa(priceInt),
			Asset:  "USD",
			Extra:  nil,
		}, nil
	}

	return x402.AssetAmount{}, fmt.Errorf("invalid price format: %v", price)
}

// EnhancePaymentRequirements enhances payment requirements with cash-specific details
func (s *SchemeNetworkService) EnhancePaymentRequirements(
	ctx context.Context,
	requirements x402.PaymentRequirements,
	supportedKind x402.SupportedKind,
	facilitatorExtensions []string,
) (x402.PaymentRequirements, error) {
	// Cash scheme doesn't need any special enhancements
	return requirements, nil
}

// ============================================================================
// Cash Facilitator Client
// ============================================================================

// FacilitatorClient wraps a facilitator for the cash scheme
type FacilitatorClient struct {
	facilitator *x402.X402Facilitator
}

// NewFacilitatorClient creates a new cash facilitator client
func NewFacilitatorClient(facilitator *x402.X402Facilitator) *FacilitatorClient {
	return &FacilitatorClient{
		facilitator: facilitator,
	}
}

// Verify verifies a payment payload against requirements
func (c *FacilitatorClient) Verify(ctx context.Context, payload x402.PaymentPayload, requirements x402.PaymentRequirements) (x402.VerifyResponse, error) {
	return c.facilitator.Verify(ctx, payload, requirements)
}

// Settle settles a payment based on the payload and requirements
func (c *FacilitatorClient) Settle(ctx context.Context, payload x402.PaymentPayload, requirements x402.PaymentRequirements) (x402.SettleResponse, error) {
	return c.facilitator.Settle(ctx, payload, requirements)
}

// GetSupported gets supported payment kinds and extensions
func (c *FacilitatorClient) GetSupported(ctx context.Context) (x402.SupportedResponse, error) {
	return x402.SupportedResponse{
		Kinds: []x402.SupportedKind{
			{
				X402Version: 2,
				Scheme:      "cash",
				Network:     "x402:cash",
				Extra:       nil,
			},
		},
		Extensions: []string{},
	}, nil
}

// Identifier returns the identifier for this facilitator client
func (c *FacilitatorClient) Identifier() string {
	return "cash-facilitator"
}

// ============================================================================
// Helper Functions
// ============================================================================

// BuildPaymentRequirements creates a payment requirements object for the cash scheme
func BuildPaymentRequirements(payTo string, asset string, amount string) x402.PaymentRequirements {
	return x402.PaymentRequirements{
		Scheme:            "cash",
		Network:           "x402:cash",
		Asset:             asset,
		Amount:            amount,
		PayTo:             payTo,
		MaxTimeoutSeconds: 1000,
		Extra:             nil,
	}
}
