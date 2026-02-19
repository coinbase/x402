package client

import (
	"context"
	"fmt"
	"time"

	"github.com/coinbase/x402/go/mechanisms/hypercore"
	"github.com/coinbase/x402/go/types"
)

type ExactHypercoreScheme struct {
	signer hypercore.HyperliquidSigner
}

func NewExactHypercoreScheme(signer hypercore.HyperliquidSigner) *ExactHypercoreScheme {
	return &ExactHypercoreScheme{
		signer: signer,
	}
}

func (c *ExactHypercoreScheme) Scheme() string {
	return hypercore.SchemeExact
}

func (c *ExactHypercoreScheme) CreatePaymentPayload(
	ctx context.Context,
	requirements types.PaymentRequirements,
) (types.PaymentPayload, error) {
	nonce := time.Now().UnixMilli()

	config, ok := hypercore.NetworkConfigs[string(requirements.Network)]
	if !ok {
		return types.PaymentPayload{}, fmt.Errorf("unsupported network: %s", requirements.Network)
	}

	isMainnet := true
	if requirements.Extra != nil {
		if val, ok := requirements.Extra["isMainnet"].(bool); ok {
			isMainnet = val
		}
	}

	hyperliquidChain := "Mainnet"
	if !isMainnet {
		hyperliquidChain = "Testnet"
	}

	amountStr, err := hypercore.FormatAmount(requirements.Amount, config.DefaultAsset.Decimals)
	if err != nil {
		return types.PaymentPayload{}, fmt.Errorf("failed to format amount: %w", err)
	}

	action := hypercore.HypercoreSendAssetAction{
		Type:             "sendAsset",
		HyperliquidChain: hyperliquidChain,
		SignatureChainID: "0x3e7",
		Destination:      hypercore.NormalizeAddress(requirements.PayTo),
		SourceDex:        "spot",
		DestinationDex:   "spot",
		Token:            requirements.Asset,
		Amount:           amountStr,
		FromSubAccount:   "",
		Nonce:            nonce,
	}

	signature, err := c.signer.SignSendAsset(action)
	if err != nil {
		return types.PaymentPayload{}, fmt.Errorf("failed to sign action: %w", err)
	}

	payloadMap := map[string]interface{}{
		"action":    action,
		"signature": signature,
		"nonce":     nonce,
	}

	return types.PaymentPayload{
		X402Version: 2,
		Payload:     payloadMap,
	}, nil
}
