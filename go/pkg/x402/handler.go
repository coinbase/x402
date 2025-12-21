package x402

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"

	"github.com/coinbase/x402/go/pkg/facilitatorclient"
	"github.com/coinbase/x402/go/pkg/tokenmetadata"
	"github.com/coinbase/x402/go/pkg/types"
)

// X402Version is the current version of the x402 protocol
const X402Version = 1

// Handler encapsulates the x402 payment flow for AnySpend facilitator.
// It handles building payment requirements, processing payments, and discovery registration.
type Handler struct {
	facilitator *facilitatorclient.Client
	tokenClient *tokenmetadata.Client
}

// NewHandler creates a new x402 handler with default AnySpend facilitator
func NewHandler() *Handler {
	return &Handler{
		facilitator: facilitatorclient.NewClient(facilitatorclient.Config{}),
		tokenClient: tokenmetadata.NewClient(tokenmetadata.Config{}),
	}
}

// NewHandlerWithClients creates a new x402 handler with custom clients
func NewHandlerWithClients(facilitator *facilitatorclient.Client, tokenClient *tokenmetadata.Client) *Handler {
	return &Handler{
		facilitator: facilitator,
		tokenClient: tokenClient,
	}
}

// PaymentResult contains the result of a successful payment
type PaymentResult struct {
	// TransactionHash is the on-chain transaction hash
	TransactionHash string `json:"transactionHash"`
	// Amount is the amount paid in smallest unit
	Amount string `json:"amount"`
	// Token is the token contract address
	Token string `json:"token"`
	// ChainID is the chain where payment was made
	ChainID int `json:"chainId"`
	// Network is the network name (e.g., "base")
	Network string `json:"network"`
	// Payer is the address that made the payment
	Payer string `json:"payer"`
}

// BuildPaymentRequirements creates the payment requirements for a 402 response.
// If preferredToken is set (from X-PREFERRED-TOKEN header), it fetches a quote
// for cross-token payment.
func (h *Handler) BuildPaymentRequirements(
	ctx context.Context,
	config *Config,
	resource string,
	preferredToken string,
	preferredNetwork string,
) (*types.PaymentRequirements, error) {
	if err := config.Validate(); err != nil {
		return nil, err
	}

	// Get network name from chain ID
	network := chainIDToNetwork(config.ChainID)

	// Build base payment requirements
	requirements := &types.PaymentRequirements{
		Scheme:            "exact",
		Network:           network,
		MaxAmountRequired: config.Price,
		Resource:          resource,
		Description:       config.Description,
		MimeType:          config.MimeType,
		PayTo:             config.Recipient,
		MaxTimeoutSeconds: config.GetMaxTimeoutSeconds(),
		Asset:             config.Token,
	}

	// Get token metadata to determine signature type
	tokenMeta, err := h.tokenClient.GetMetadata(ctx, network, config.Token)
	if err != nil {
		// Log but don't fail - we can still proceed without metadata
		fmt.Printf("x402: warning: failed to get token metadata: %v\n", err)
	} else {
		signatureType := "authorization" // EIP-3009 default
		if !tokenMeta.SupportsEip3009 && tokenMeta.SupportsEip2612 {
			signatureType = "permit"
		}

		// For permit-based tokens, get accurate EIP-712 domain from quote endpoint
		// The quote endpoint queries the contract's eip712Domain() function
		if signatureType == "permit" {
			quote, err := h.facilitator.GetQuote(ctx, &types.QuoteRequest{
				SrcTokenAddress: config.Token,
				DstTokenAddress: config.Token,
				DstAmount:       config.Price,
				SrcNetwork:      network,
				DstNetwork:      network,
			})
			if err != nil {
				fmt.Printf("x402: warning: failed to get quote for domain info: %v\n", err)
				// Fallback to token metadata (may have incorrect version)
				requirements.Extra = &types.PaymentExtra{
					Name:              tokenMeta.Name,
					Version:           tokenMeta.Version,
					SignatureType:     signatureType,
					ChainID:           config.ChainID,
					VerifyingContract: config.Token,
				}
			} else {
				// Use accurate domain info from quote
				requirements.Extra = &types.PaymentExtra{
					SignatureType:      quote.SignatureType,
					FacilitatorAddress: quote.FacilitatorAddress,
				}
				if quote.Domain != nil {
					requirements.Extra.Name = quote.Domain.Name
					requirements.Extra.Version = quote.Domain.Version
					requirements.Extra.ChainID = quote.Domain.ChainID
					requirements.Extra.VerifyingContract = quote.Domain.VerifyingContract
				}
			}
		} else {
			// For authorization (EIP-3009) tokens like USDC, use token metadata
			requirements.Extra = &types.PaymentExtra{
				Name:          tokenMeta.Name,
				Version:       tokenMeta.Version,
				SignatureType: signatureType,
			}
		}
	}

	// Add discovery fields if configured (matching TypeScript SDK format)
	// The facilitator expects: outputSchema.input.discoverable, outputSchema.metadata, etc.
	if config.Discoverable {
		requirements.OutputSchema = &types.OutputSchema{
			Input: &types.OutputSchemaInput{
				Type:           "http",
				Discoverable:   true,
				DiscoveryInput: config.DiscoveryInput,
			},
			DiscoveryOutput: config.DiscoveryOutput,
			Metadata:        config.DiscoveryMetadata,
		}
	}

	// If buyer specified a preferred token, get a quote for cross-token payment
	if preferredToken != "" && preferredToken != config.Token {
		if preferredNetwork == "" {
			preferredNetwork = network
		}

		quote, err := h.facilitator.GetQuote(ctx, &types.QuoteRequest{
			SrcTokenAddress: preferredToken,
			DstTokenAddress: config.Token,
			DstAmount:       config.Price,
			SrcNetwork:      preferredNetwork,
			DstNetwork:      network,
		})
		if err != nil {
			// Log but don't fail - buyer can still pay with the original token
			fmt.Printf("x402: warning: failed to get quote: %v\n", err)
		} else if quote != nil {
			// Update requirements with cross-token info
			requirements.SrcTokenAddress = preferredToken
			requirements.SrcNetwork = preferredNetwork
			requirements.SrcAmountRequired = quote.PaymentAmount

			// Replace extra with quote domain info (needed for buyer to create signature)
			requirements.Extra = &types.PaymentExtra{
				SignatureType:      quote.SignatureType,
				FacilitatorAddress: quote.FacilitatorAddress,
			}
			if quote.Domain != nil {
				requirements.Extra.Name = quote.Domain.Name
				requirements.Extra.Version = quote.Domain.Version
				requirements.Extra.ChainID = quote.Domain.ChainID
				requirements.Extra.VerifyingContract = quote.Domain.VerifyingContract
			}
		}
	}

	return requirements, nil
}

// ProcessPayment verifies and settles a payment.
// paymentHeader is the base64-encoded X-PAYMENT header value.
// requirements should be the same as returned by BuildPaymentRequirements.
// If preferredToken is set, it's added to requirements for cross-token verification.
func (h *Handler) ProcessPayment(
	ctx context.Context,
	paymentHeader string,
	requirements *types.PaymentRequirements,
	preferredToken string,
	preferredNetwork string,
) (*PaymentResult, error) {
	// Decode payment payload
	payload, err := types.DecodePaymentPayloadFromBase64(paymentHeader)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalidPayment, err)
	}

	// If buyer specified a preferred token, set srcTokenAddress and srcNetwork
	// This tells the facilitator which token the buyer is paying with
	if preferredToken != "" {
		requirements.SrcTokenAddress = preferredToken
		if preferredNetwork != "" {
			requirements.SrcNetwork = preferredNetwork
		}
	}

	// Verify and settle
	settleResp, err := h.facilitator.VerifyAndSettle(ctx, payload, requirements)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrSettlementFailed, err)
	}

	// Build result
	result := &PaymentResult{
		TransactionHash: settleResp.Transaction,
		Amount:          requirements.MaxAmountRequired,
		Token:           requirements.Asset,
		ChainID:         networkToChainID(requirements.Network),
		Network:         settleResp.Network,
	}
	if settleResp.Payer != nil {
		result.Payer = *settleResp.Payer
	}

	return result, nil
}

// EncodePaymentResponse encodes a SettleResponse to base64 for X-PAYMENT-RESPONSE header
func EncodePaymentResponse(resp *types.SettleResponse) (string, error) {
	data, err := json.Marshal(resp)
	if err != nil {
		return "", fmt.Errorf("failed to encode payment response: %w", err)
	}
	return base64.StdEncoding.EncodeToString(data), nil
}

// RegisterWithDiscovery registers the resource with the Bazaar discovery catalog.
// This should be called when a workflow with discoverable=true is created.
func (h *Handler) RegisterWithDiscovery(
	ctx context.Context,
	config *Config,
	resource string,
) error {
	if !config.Discoverable {
		return nil // Nothing to do
	}

	requirements, err := h.BuildPaymentRequirements(ctx, config, resource, "", "")
	if err != nil {
		return fmt.Errorf("%w: %v", ErrDiscoveryFailed, err)
	}

	err = h.facilitator.RegisterResource(ctx, resource, []types.PaymentRequirements{*requirements}, config.DiscoveryMetadata)
	if err != nil {
		return fmt.Errorf("%w: %v", ErrDiscoveryFailed, err)
	}

	return nil
}

// UnregisterFromDiscovery removes the resource from the Bazaar discovery catalog.
// This should be called when a discoverable workflow is deleted or paused.
func (h *Handler) UnregisterFromDiscovery(ctx context.Context, resource string) error {
	err := h.facilitator.UnregisterResource(ctx, resource)
	if err != nil {
		return fmt.Errorf("%w: %v", ErrDiscoveryFailed, err)
	}
	return nil
}

// chainIDToNetwork converts chain ID to network name
func chainIDToNetwork(chainID int) string {
	switch chainID {
	case 1:
		return "ethereum"
	case 8453:
		return "base"
	case 84532:
		return "base-sepolia"
	case 137:
		return "polygon"
	case 42161:
		return "arbitrum"
	case 10:
		return "optimism"
	case 56:
		return "bsc"
	case 43114:
		return "avalanche"
	default:
		return "base" // Default to base
	}
}

// networkToChainID converts network name to chain ID
func networkToChainID(network string) int {
	switch network {
	case "ethereum":
		return 1
	case "base":
		return 8453
	case "base-sepolia":
		return 84532
	case "polygon":
		return 137
	case "arbitrum":
		return 42161
	case "optimism":
		return 10
	case "bsc":
		return 56
	case "avalanche":
		return 43114
	default:
		return 8453 // Default to base
	}
}
