package authcapture

import (
	"encoding/json"
	"fmt"

	"github.com/x402-foundation/x402/go/v2/types"
)

// ParseAuthCaptureExtra validates and parses requirements.Extra into an
// AuthCaptureExtra plus the resolved commerce-payments deployment. Shared by
// the client (to build a collect payload) and the facilitator (to verify and
// settle one).
func ParseAuthCaptureExtra(requirements types.PaymentRequirements) (AuthCaptureExtra, AuthCaptureDeployment, error) {
	if requirements.Extra == nil {
		return AuthCaptureExtra{}, AuthCaptureDeployment{}, fmt.Errorf("'captureAuthorizer' is required in payment requirements extra")
	}
	ex := requirements.Extra

	name, _ := ex["name"].(string)
	if name == "" {
		return AuthCaptureExtra{}, AuthCaptureDeployment{}, fmt.Errorf("EIP-712 domain parameter 'name' is required in payment requirements for asset %s", requirements.Asset)
	}
	version, _ := ex["version"].(string)
	if version == "" {
		return AuthCaptureExtra{}, AuthCaptureDeployment{}, fmt.Errorf("EIP-712 domain parameter 'version' is required in payment requirements for asset %s", requirements.Asset)
	}

	captureAuthorizer, _ := ex["captureAuthorizer"].(string)
	if captureAuthorizer == "" {
		return AuthCaptureExtra{}, AuthCaptureDeployment{}, fmt.Errorf("'captureAuthorizer' is required in payment requirements extra")
	}
	feeRecipient, _ := ex["feeRecipient"].(string)
	if feeRecipient == "" {
		return AuthCaptureExtra{}, AuthCaptureDeployment{}, fmt.Errorf("'feeRecipient' is required in payment requirements extra")
	}

	captureDeadline, err := extraUint64(ex, "captureDeadline")
	if err != nil {
		return AuthCaptureExtra{}, AuthCaptureDeployment{}, fmt.Errorf("'captureDeadline' is required in payment requirements extra")
	}
	refundDeadline, err := extraUint64(ex, "refundDeadline")
	if err != nil {
		return AuthCaptureExtra{}, AuthCaptureDeployment{}, fmt.Errorf("'refundDeadline' is required in payment requirements extra")
	}
	minFeeBps, err := extraUint16(ex, "minFeeBps")
	if err != nil {
		return AuthCaptureExtra{}, AuthCaptureDeployment{}, fmt.Errorf("'minFeeBps' is required in payment requirements extra")
	}
	maxFeeBps, err := extraUint16(ex, "maxFeeBps")
	if err != nil {
		return AuthCaptureExtra{}, AuthCaptureDeployment{}, fmt.Errorf("'maxFeeBps' is required in payment requirements extra")
	}

	authCaptureEscrow := stringFromExtra(ex, "authCaptureEscrow")
	deployment := ResolveAuthCaptureDeployment(authCaptureEscrow)
	if deployment == nil {
		return AuthCaptureExtra{}, AuthCaptureDeployment{}, fmt.Errorf("invalid authCaptureEscrow in payment requirements extra")
	}

	extraOut := AuthCaptureExtra{
		CaptureAuthorizer:   captureAuthorizer,
		CaptureDeadline:     captureDeadline,
		RefundDeadline:      refundDeadline,
		FeeRecipient:        feeRecipient,
		MinFeeBps:           minFeeBps,
		MaxFeeBps:           maxFeeBps,
		Name:                name,
		Version:             version,
		ReceiverAuthorizer:  stringFromExtra(ex, "receiverAuthorizer"),
		Policy:              stringFromExtra(ex, "policy"),
		PaymentFlow:         stringFromExtra(ex, "paymentFlow"),
		CaptureMode:         stringFromExtra(ex, "captureMode"),
		OperatorType:        stringFromExtra(ex, "operatorType"),
		AssetTransferMethod: stringFromExtra(ex, "assetTransferMethod"),
		AuthCaptureEscrow:   deployment.Escrow,
	}
	return extraOut, *deployment, nil
}

// ReconstructPaymentInfo rebuilds the onchain PaymentInfo struct from wire-payload-derived
// inputs (payer, preApprovalExpiry, salt) plus the server-published requirements/extra.
// maxAmount defaults to requirements.Amount when empty (the authorize-only path).
func ReconstructPaymentInfo(
	payer string,
	preApprovalExpiry uint64,
	salt string,
	requirements types.PaymentRequirements,
	extra AuthCaptureExtra,
	maxAmount string,
) PaymentInfoStruct {
	if maxAmount == "" {
		maxAmount = requirements.Amount
	}
	return PaymentInfoStruct{
		Operator:            extra.CaptureAuthorizer,
		Payer:               payer,
		Receiver:            requirements.PayTo,
		Token:               requirements.Asset,
		MaxAmount:           maxAmount,
		PreApprovalExpiry:   preApprovalExpiry,
		AuthorizationExpiry: extra.CaptureDeadline,
		RefundExpiry:        extra.RefundDeadline,
		MinFeeBps:           extra.MinFeeBps,
		MaxFeeBps:           extra.MaxFeeBps,
		FeeReceiver:         extra.FeeRecipient,
		Salt:                salt,
	}
}

func stringFromExtra(ex map[string]interface{}, key string) string {
	if v, ok := ex[key].(string); ok {
		return v
	}
	return ""
}

func extraUint64(ex map[string]interface{}, key string) (uint64, error) {
	value, ok := ex[key]
	if !ok {
		return 0, fmt.Errorf("missing %s", key)
	}
	switch v := value.(type) {
	case float64:
		if v < 0 || v != float64(uint64(v)) {
			return 0, fmt.Errorf("invalid %s", key)
		}
		return uint64(v), nil
	case int:
		if v < 0 {
			return 0, fmt.Errorf("invalid %s", key)
		}
		return uint64(v), nil
	case int64:
		if v < 0 {
			return 0, fmt.Errorf("invalid %s", key)
		}
		return uint64(v), nil
	case uint64:
		return v, nil
	case json.Number:
		n, err := v.Int64()
		if err != nil || n < 0 {
			return 0, fmt.Errorf("invalid %s", key)
		}
		return uint64(n), nil
	default:
		return 0, fmt.Errorf("invalid %s", key)
	}
}

func extraUint16(ex map[string]interface{}, key string) (uint16, error) {
	n, err := extraUint64(ex, key)
	if err != nil {
		return 0, err
	}
	if n > 65535 {
		return 0, fmt.Errorf("invalid %s", key)
	}
	return uint16(n), nil
}
