package facilitator

import (
	"bytes"
	"context"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum/crypto"

	x402 "github.com/coinbase/x402/go"
	"github.com/coinbase/x402/go/mechanisms/evm"
	"github.com/coinbase/x402/go/mechanisms/hypercore"
	"github.com/coinbase/x402/go/types"
)

type ExactHypercoreScheme struct {
	apiURL string // optional override
}

// NewExactHypercoreScheme creates a new scheme. Pass "" for apiURL to use built-in defaults.
func NewExactHypercoreScheme(apiURL ...string) *ExactHypercoreScheme {
	s := &ExactHypercoreScheme{}
	if len(apiURL) > 0 {
		s.apiURL = apiURL[0]
	}
	return s
}

func (f *ExactHypercoreScheme) Scheme() string {
	return hypercore.SchemeExact
}

func (f *ExactHypercoreScheme) CaipFamily() string {
	return "hypercore:*"
}

// getAPIURL returns the API URL for a specific network, falling back to the configured default.
func (f *ExactHypercoreScheme) getAPIURL(network string) string {
	if url, ok := hypercore.NetworkAPIURLs[network]; ok {
		return url
	}
	return f.apiURL
}

func (f *ExactHypercoreScheme) GetExtra(network x402.Network) map[string]interface{} {
	return nil
}

func (f *ExactHypercoreScheme) GetSigners(network x402.Network) []string {
	return []string{}
}

func (f *ExactHypercoreScheme) Verify(
	ctx context.Context,
	payload types.PaymentPayload,
	requirements types.PaymentRequirements,
) (*x402.VerifyResponse, error) {
	hypercorePayload, err := parsePayload(payload.Payload)
	if err != nil {
		return &x402.VerifyResponse{
			IsValid:       false,
			InvalidReason: ErrInvalidPayloadStructure,
		}, err
	}

	if !strings.HasPrefix(string(requirements.Network), "hypercore:") {
		return &x402.VerifyResponse{
			IsValid:       false,
			InvalidReason: fmt.Sprintf("%s: %s", ErrInvalidNetwork, requirements.Network),
		}, nil
	}

	config, ok := hypercore.NetworkConfigs[string(requirements.Network)]
	if !ok {
		return &x402.VerifyResponse{
			IsValid:       false,
			InvalidReason: fmt.Sprintf("%s: %s", ErrInvalidNetwork, requirements.Network),
		}, nil
	}

	if hypercorePayload.Action.Type != "sendAsset" {
		return &x402.VerifyResponse{
			IsValid:       false,
			InvalidReason: fmt.Sprintf("%s: %s", ErrInvalidActionType, hypercorePayload.Action.Type),
		}, nil
	}

	if !strings.EqualFold(hypercorePayload.Action.Destination, requirements.PayTo) {
		return &x402.VerifyResponse{
			IsValid:       false,
			InvalidReason: ErrDestinationMismatch,
		}, nil
	}

	payloadAmount, err := hypercore.ParseAmountToInteger(hypercorePayload.Action.Amount, config.DefaultAsset.Decimals)
	if err != nil {
		return &x402.VerifyResponse{
			IsValid:       false,
			InvalidReason: ErrInvalidAmountFormat,
		}, err
	}

	requiredAmount := new(big.Int)
	requiredAmount.SetString(requirements.Amount, 10)

	if payloadAmount.Cmp(requiredAmount) < 0 {
		return &x402.VerifyResponse{
			IsValid:       false,
			InvalidReason: ErrInsufficientAmount,
		}, nil
	}

	if requirements.Asset != "" && hypercorePayload.Action.Token != requirements.Asset {
		return &x402.VerifyResponse{
			IsValid:       false,
			InvalidReason: ErrTokenMismatch,
		}, nil
	}

	if !hypercore.IsNonceFresh(hypercorePayload.Nonce, time.Duration(hypercore.MaxNonceAgeSeconds)*time.Second) {
		return &x402.VerifyResponse{
			IsValid:       false,
			InvalidReason: ErrNonceTooOld,
		}, nil
	}

	if hypercorePayload.Signature.R == "" || hypercorePayload.Signature.S == "" {
		return &x402.VerifyResponse{
			IsValid:       false,
			InvalidReason: ErrInvalidSignature,
		}, nil
	}

	return &x402.VerifyResponse{
		IsValid: true,
	}, nil
}

func (f *ExactHypercoreScheme) Settle(
	ctx context.Context,
	payload types.PaymentPayload,
	requirements types.PaymentRequirements,
) (*x402.SettleResponse, error) {
	verifyResp, err := f.Verify(ctx, payload, requirements)
	if err != nil {
		return &x402.SettleResponse{}, err
	}
	if !verifyResp.IsValid {
		return &x402.SettleResponse{
			Success:     false,
			ErrorReason: verifyResp.InvalidReason,
		}, nil
	}

	hypercorePayload, _ := parsePayload(payload.Payload)
	apiURL := f.getAPIURL(string(requirements.Network))

	payer, err := f.recoverPayer(hypercorePayload.Action, hypercorePayload.Signature)
	if err != nil {
		return &x402.SettleResponse{}, fmt.Errorf("failed to recover payer: %w", err)
	}

	startTime := time.Now()

	submitPayload := map[string]interface{}{
		"action":       hypercorePayload.Action,
		"nonce":        hypercorePayload.Nonce,
		"signature":    hypercorePayload.Signature,
		"vaultAddress": nil,
	}

	body, err := json.Marshal(submitPayload)
	if err != nil {
		return &x402.SettleResponse{}, fmt.Errorf("failed to marshal payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", apiURL+"/exchange", bytes.NewReader(body))
	if err != nil {
		return &x402.SettleResponse{}, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return &x402.SettleResponse{}, fmt.Errorf("failed to submit to hyperliquid: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return &x402.SettleResponse{}, fmt.Errorf("hyperliquid API error: %d", resp.StatusCode)
	}

	var apiResp hypercore.HyperliquidAPIResponse
	if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
		return &x402.SettleResponse{}, fmt.Errorf("failed to decode response: %w", err)
	}

	if apiResp.Status != "ok" {
		return &x402.SettleResponse{
			Success:     false,
			ErrorReason: ErrSettlementFailed,
		}, nil
	}

	txHash, err := f.getTransactionHash(
		ctx,
		apiURL,
		payer,
		hypercorePayload.Action.Destination,
		hypercorePayload.Nonce,
		startTime,
	)
	if err != nil {
		return &x402.SettleResponse{}, fmt.Errorf("failed to get transaction hash: %w", err)
	}

	return &x402.SettleResponse{
		Success:     true,
		Transaction: txHash,
		Network:     x402.Network(requirements.Network),
		Payer:       payer,
	}, nil
}

func (f *ExactHypercoreScheme) recoverPayer(
	action hypercore.HypercoreSendAssetAction,
	signature hypercore.HypercoreSignature,
) (string, error) {
	domain := evm.TypedDataDomain{
		Name:              "HyperliquidSignTransaction",
		Version:           "1",
		ChainID:           big.NewInt(999),
		VerifyingContract: "0x0000000000000000000000000000000000000000",
	}

	typedDataTypes := map[string][]evm.TypedDataField{
		"HyperliquidTransaction:SendAsset": {
			{Name: "hyperliquidChain", Type: "string"},
			{Name: "destination", Type: "string"},
			{Name: "sourceDex", Type: "string"},
			{Name: "destinationDex", Type: "string"},
			{Name: "token", Type: "string"},
			{Name: "amount", Type: "string"},
			{Name: "fromSubAccount", Type: "string"},
			{Name: "nonce", Type: "uint64"},
		},
	}

	// Note: uint64 types in EIP-712 need to be provided as strings
	message := map[string]interface{}{
		"hyperliquidChain": action.HyperliquidChain,
		"destination":      action.Destination,
		"sourceDex":        action.SourceDex,
		"destinationDex":   action.DestinationDex,
		"token":            action.Token,
		"amount":           action.Amount,
		"fromSubAccount":   action.FromSubAccount,
		"nonce":            fmt.Sprintf("%d", action.Nonce),
	}

	hash, err := evm.HashTypedData(domain, typedDataTypes, "HyperliquidTransaction:SendAsset", message)
	if err != nil {
		return "", fmt.Errorf("failed to hash typed data: %w", err)
	}

	rBytes, err := hex.DecodeString(strings.TrimPrefix(signature.R, "0x"))
	if err != nil {
		return "", fmt.Errorf("invalid r value: %w", err)
	}
	sBytes, err := hex.DecodeString(strings.TrimPrefix(signature.S, "0x"))
	if err != nil {
		return "", fmt.Errorf("invalid s value: %w", err)
	}

	v := byte(signature.V)
	if v >= 27 {
		v -= 27
	}

	sig := append(append(rBytes, sBytes...), v)

	pubKey, err := crypto.SigToPub(hash, sig)
	if err != nil {
		return "", fmt.Errorf("failed to recover public key: %w", err)
	}

	address := crypto.PubkeyToAddress(*pubKey)

	return address.Hex(), nil
}

func (f *ExactHypercoreScheme) getTransactionHash(
	ctx context.Context,
	apiURL string,
	user string,
	destination string,
	nonce int64,
	startTime time.Time,
) (string, error) {
	for attempt := 0; attempt < hypercore.TxHashMaxRetries; attempt++ {
		if attempt > 0 {
			time.Sleep(hypercore.TxHashRetryDelay)
		}

		queryPayload := map[string]interface{}{
			"type":      "userNonFundingLedgerUpdates",
			"user":      user,
			"startTime": startTime.Add(-hypercore.TxHashLookbackWindow).UnixMilli(),
		}

		body, err := json.Marshal(queryPayload)
		if err != nil {
			continue
		}

		req, err := http.NewRequestWithContext(ctx, "POST", apiURL+"/info", bytes.NewReader(body))
		if err != nil {
			continue
		}
		req.Header.Set("Content-Type", "application/json")

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			continue
		}

		respBody, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			continue
		}

		var updates []hypercore.LedgerUpdate
		if err := json.Unmarshal(respBody, &updates); err != nil {
			continue
		}

		for _, update := range updates {
			if update.Delta.Type == "send" &&
				update.Delta.Destination != nil &&
				strings.EqualFold(*update.Delta.Destination, destination) &&
				update.Delta.Nonce != nil &&
				*update.Delta.Nonce == nonce {
				return update.Hash, nil
			}
		}
	}

	return "", fmt.Errorf("transaction hash not found after %d attempts", hypercore.TxHashMaxRetries)
}

func parsePayload(payload interface{}) (*hypercore.HypercorePaymentPayload, error) {
	jsonBytes, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	var hypercorePayload hypercore.HypercorePaymentPayload
	if err := json.Unmarshal(jsonBytes, &hypercorePayload); err != nil {
		return nil, err
	}

	return &hypercorePayload, nil
}
