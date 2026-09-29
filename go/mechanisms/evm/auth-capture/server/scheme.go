// Package server implements the resource-server role of the EVM auth-capture
// scheme: it advertises the escrow payment flow and signs the receiver-authorizer
// Capture/Void EIP-712 messages the facilitator relays onchain.
package server

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	x402 "github.com/x402-foundation/x402/go/v2"
	"github.com/x402-foundation/x402/go/v2/mechanisms/evm"
	authcapture "github.com/x402-foundation/x402/go/v2/mechanisms/evm/auth-capture"
	"github.com/x402-foundation/x402/go/v2/types"
)

// DefaultCaptureDeadline is how far in the future authorizationExpiry is set
// when Config.CaptureDeadline is zero.
const DefaultCaptureDeadline = 10 * time.Minute

// DefaultRefundDeadline is how far in the future refundExpiry is set when
// Config.RefundDeadline is zero.
const DefaultRefundDeadline = 24 * time.Hour

// DefaultMaxFeeBps is used when Config.MaxFeeBps is nil.
const DefaultMaxFeeBps uint16 = 10000

// Config configures the server-side EVM auth-capture scheme.
type Config struct {
	// ReceiverAuthorizerSigner signs the Capture/Void EIP-712 messages that
	// authorize the facilitator (the escrow operator) to release funds. This
	// scheme only supports the escrow payment flow, and the facilitator
	// package here verifies but never produces these signatures, so a signer
	// is required.
	ReceiverAuthorizerSigner evm.ClientEvmSigner

	// CaptureAuthorizer is the escrow operator address. Falls back to the
	// facilitator's advertised captureAuthorizer when empty.
	CaptureAuthorizer string

	// FeeRecipient receives the capture fee. Falls back to the facilitator's
	// advertised feeRecipient when empty.
	FeeRecipient string

	// MinFeeBps/MaxFeeBps bound the fee charged on capture. Nil selects the
	// facilitator-advertised value, else 0/DefaultMaxFeeBps.
	MinFeeBps *uint16
	MaxFeeBps *uint16

	// CaptureDeadline/RefundDeadline are the durations, from the moment
	// requirements are issued, after which capture/refund are no longer
	// permitted onchain. Zero selects the package defaults.
	CaptureDeadline time.Duration
	RefundDeadline  time.Duration

	// Policy is an optional onchain policy contract bound into the payment's
	// salt (see IsSaltBindingOn). Leave empty when unused.
	Policy string

	// AuthCaptureEscrow optionally pins a specific commerce-payments
	// deployment (v1.0 or v1.1 escrow address). Empty selects the default.
	AuthCaptureEscrow string
}

// AuthCaptureEvmScheme implements SchemeNetworkServer for EVM auth-capture
// payments: escrow-only, with the server pre-authorizing capture/void via a
// receiver-authorizer EIP-712 signature.
type AuthCaptureEvmScheme struct {
	moneyParsers []x402.MoneyParser
	config       *Config
}

// NewAuthCaptureEvmScheme creates a new AuthCaptureEvmScheme. A
// ReceiverAuthorizerSigner is required.
func NewAuthCaptureEvmScheme(config *Config) *AuthCaptureEvmScheme {
	if config == nil {
		config = &Config{}
	}
	return &AuthCaptureEvmScheme{
		moneyParsers: []x402.MoneyParser{},
		config:       config,
	}
}

// Scheme returns the scheme identifier.
func (s *AuthCaptureEvmScheme) Scheme() string {
	return authcapture.SchemeAuthCapture
}

// DefaultAssetTransferMethod returns the ATM used when extra.assetTransferMethod is absent.
func (s *AuthCaptureEvmScheme) DefaultAssetTransferMethod() string {
	return string(evm.AssetTransferMethodEIP3009)
}

// PaymentFlows returns ATM-keyed payment flow support for auth-capture EVM.
// Auth-capture only supports the escrow flow (authorize, then capture/void).
func (s *AuthCaptureEvmScheme) PaymentFlows() map[string]x402.PaymentFlowConfig {
	escrowOnly := x402.PaymentFlowConfig{
		Supported: []x402.PaymentFlowName{x402.PaymentFlowEscrow},
		Default:   x402.PaymentFlowEscrow,
	}
	return map[string]x402.PaymentFlowConfig{
		string(evm.AssetTransferMethodEIP3009): escrowOnly,
		string(evm.AssetTransferMethodPermit2): escrowOnly,
	}
}

// ValidateFacilitatorSupport fails server startup when neither this config nor
// the facilitator can supply a receiverAuthorizerSigner-equivalent operator
// address, since capture/void could never be relayed otherwise.
func (s *AuthCaptureEvmScheme) ValidateFacilitatorSupport(
	network x402.Network,
	supportedKind types.SupportedKind,
	_ []string,
) error {
	if s.config.ReceiverAuthorizerSigner == nil {
		return errors.New(ErrMissingReceiverAuthorizerSigner)
	}
	if s.config.CaptureAuthorizer != "" {
		return nil
	}
	if advertised, _ := supportedKind.Extra["captureAuthorizer"].(string); evm.IsValidAddress(advertised) {
		return nil
	}
	return fmt.Errorf(
		"no captureAuthorizer is configured and the facilitator does not advertise one for auth-capture on %s",
		network,
	)
}

// RegisterMoneyParser registers a custom money parser in the parser chain.
// Multiple parsers can be registered - they will be tried in registration order.
// Each parser receives a decimal string (e.g., "1.50" for $1.50).
// If a parser returns nil, the next parser in the chain will be tried.
// The default parser is always the final fallback.
func (s *AuthCaptureEvmScheme) RegisterMoneyParser(parser x402.MoneyParser) *AuthCaptureEvmScheme {
	s.moneyParsers = append(s.moneyParsers, parser)
	return s
}

// ParsePrice parses a price and converts it to an asset amount.
// If price is already an AssetAmount, returns it directly.
// If price is Money (string | number), parses to decimal and tries custom parsers.
// Falls back to default conversion if all custom parsers return nil.
func (s *AuthCaptureEvmScheme) ParsePrice(price x402.Price, network x402.Network) (x402.AssetAmount, error) {
	if priceMap, ok := price.(map[string]interface{}); ok {
		if amountVal, hasAmount := priceMap["amount"]; hasAmount {
			amountStr, ok := amountVal.(string)
			if !ok {
				return x402.AssetAmount{}, errors.New(ErrAmountMustBeString)
			}

			asset := ""
			if assetVal, ok := priceMap["asset"].(string); ok {
				asset = assetVal
			}
			if asset == "" {
				return x402.AssetAmount{}, errors.New(ErrNoAssetSpecified)
			}

			extra := make(map[string]interface{})
			if extraMap, ok := priceMap["extra"].(map[string]interface{}); ok {
				extra = extraMap
			}

			return x402.AssetAmount{Amount: amountStr, Asset: asset, Extra: extra}, nil
		}
	}

	decimalAmount, symbol, err := x402.ParseMoney(price)
	if err != nil {
		return x402.AssetAmount{}, err
	}

	for _, parser := range s.moneyParsers {
		result, err := parser(decimalAmount, network)
		if err != nil {
			continue
		}
		if result != nil {
			return *result, nil
		}
	}

	return s.defaultMoneyConversion(decimalAmount, network, symbol)
}

func (s *AuthCaptureEvmScheme) defaultMoneyConversion(amount string, network x402.Network, symbol string) (x402.AssetAmount, error) {
	assetInfo, tokenAmount, err := evm.ConvertDefaultMoney(amount, string(network), symbol)
	if err != nil {
		return x402.AssetAmount{}, err
	}
	return x402.AssetAmount{
		Asset:  assetInfo.Asset,
		Amount: tokenAmount,
		Extra:  map[string]interface{}{},
	}, nil
}

// EnhancePaymentRequirements resolves the asset/amount and fills in every
// auth-capture extra field: EIP-712 domain (name/version), escrow topology
// (captureAuthorizer/feeRecipient/min-maxFeeBps/authCaptureEscrow), the
// server's receiverAuthorizer, and absolute capture/refund deadlines.
// captureAuthorizer/feeRecipient/fee-bounds resolve local config first, then
// the facilitator's advertised value; everything else is server-owned.
func (s *AuthCaptureEvmScheme) EnhancePaymentRequirements(
	ctx context.Context,
	requirements types.PaymentRequirements,
	supportedKind types.SupportedKind,
	extensionKeys []string,
) (types.PaymentRequirements, error) {
	if s.config.ReceiverAuthorizerSigner == nil {
		return requirements, errors.New(ErrMissingReceiverAuthorizerSigner)
	}

	networkStr := string(requirements.Network)
	var assetInfo *evm.AssetInfo
	var err error
	if requirements.Asset != "" {
		assetInfo, err = evm.GetAssetInfo(networkStr, requirements.Asset)
	} else {
		assetInfo, err = evm.GetAssetInfo(networkStr, "")
		if err == nil {
			requirements.Asset = assetInfo.Address
		}
	}
	if err != nil {
		return requirements, fmt.Errorf(ErrNoAssetSpecified+": %w", err)
	}

	if requirements.Amount != "" && strings.Contains(requirements.Amount, ".") {
		amount, err := evm.ParseAmount(requirements.Amount, assetInfo.Decimals)
		if err != nil {
			return requirements, fmt.Errorf(ErrFailedToParseAmount+": %w", err)
		}
		requirements.Amount = amount.String()
	}

	extra := make(map[string]interface{}, len(requirements.Extra)+len(supportedKind.Extra)+12)
	for key, value := range requirements.Extra {
		extra[key] = value
	}
	for key, value := range supportedKind.Extra {
		extra[key] = value
	}

	captureAuthorizer := s.config.CaptureAuthorizer
	if captureAuthorizer == "" {
		captureAuthorizer, _ = extra["captureAuthorizer"].(string)
	}
	if !evm.IsValidAddress(captureAuthorizer) {
		return requirements, errors.New(ErrMissingCaptureAuthorizer)
	}
	extra["captureAuthorizer"] = evm.NormalizeAddress(captureAuthorizer)

	feeRecipient := s.config.FeeRecipient
	if feeRecipient == "" {
		feeRecipient, _ = extra["feeRecipient"].(string)
	}
	if !evm.IsValidAddress(feeRecipient) {
		return requirements, errors.New(ErrMissingFeeRecipient)
	}
	extra["feeRecipient"] = evm.NormalizeAddress(feeRecipient)

	minFeeBps := s.config.MinFeeBps
	if minFeeBps == nil {
		if advertised, ok := jsonNumberToUint16(extra["minFeeBps"]); ok {
			minFeeBps = &advertised
		}
	}
	maxFeeBps := s.config.MaxFeeBps
	if maxFeeBps == nil {
		if advertised, ok := jsonNumberToUint16(extra["maxFeeBps"]); ok {
			maxFeeBps = &advertised
		}
	}
	resolvedMinFeeBps := uint16(0)
	if minFeeBps != nil {
		resolvedMinFeeBps = *minFeeBps
	}
	resolvedMaxFeeBps := DefaultMaxFeeBps
	if maxFeeBps != nil {
		resolvedMaxFeeBps = *maxFeeBps
	}
	extra["minFeeBps"] = resolvedMinFeeBps
	extra["maxFeeBps"] = resolvedMaxFeeBps

	extra["receiverAuthorizer"] = evm.NormalizeAddress(s.config.ReceiverAuthorizerSigner.Address())
	if s.config.Policy != "" {
		extra["policy"] = evm.NormalizeAddress(s.config.Policy)
	}

	captureDeadline := s.config.CaptureDeadline
	if captureDeadline <= 0 {
		captureDeadline = DefaultCaptureDeadline
	}
	refundDeadline := s.config.RefundDeadline
	if refundDeadline <= 0 {
		refundDeadline = DefaultRefundDeadline
	}
	now := time.Now()
	extra["captureDeadline"] = uint64(now.Add(captureDeadline).Unix())
	extra["refundDeadline"] = uint64(now.Add(captureDeadline + refundDeadline).Unix())

	extra["paymentFlow"] = "escrow"
	extra["captureMode"] = "sync"
	extra["operatorType"] = "delegated"

	if _, ok := extra["name"]; !ok {
		extra["name"] = assetInfo.Name
	}
	if _, ok := extra["version"]; !ok {
		extra["version"] = assetInfo.Version
	}

	deployment := authcapture.ResolveAuthCaptureDeployment(s.config.AuthCaptureEscrow)
	if deployment == nil {
		return requirements, fmt.Errorf("invalid configured AuthCaptureEscrow: %s", s.config.AuthCaptureEscrow)
	}
	extra["authCaptureEscrow"] = deployment.Escrow

	for _, key := range extensionKeys {
		if value, ok := supportedKind.Extra[key]; ok {
			extra[key] = value
		}
	}

	requirements.Extra = extra
	return requirements, nil
}
