package authcapture

import "fmt"

// ChargeCompletion carries the charge-only completion fields a client may add
// on top of an authorize-shaped collect payload (see spec "Completing the
// payload for settlement"). FeeBps is nil when the payload used feeAmount
// (v1.1) instead.
type ChargeCompletion struct {
	Amount              string
	FeeBps              *uint16
	FeeAmount           string
	FeeReceiver         string
	AuthorizerSignature string
}

// Eip3009CollectPayload is the parsed EIP-3009-shaped auth-capture collect payload.
type Eip3009CollectPayload struct {
	Authorization Eip3009Authorization
	Signature     string
	Salt          string
	SaltNonce     string
	Charge        *ChargeCompletion
}

// Permit2CollectPayload is the parsed Permit2-shaped auth-capture collect payload.
type Permit2CollectPayload struct {
	Permit2Authorization Permit2Authorization
	Signature            string
	Salt                 string
	SaltNonce            string
	Charge               *ChargeCompletion
}

// CapturePayload is the parsed capture lifecycle payload.
type CapturePayload struct {
	PaymentInfo              PaymentInfoStruct
	SaltNonce                string
	Amount                   string
	FeeBps                   *uint16
	FeeAmount                string
	FeeReceiver              string
	ExpectedCapturableAmount string
	ExpectedRefundableAmount string
	AuthorizerSignature      string
	VoidAuthorizerSignature  string
}

// VoidPayload is the parsed void lifecycle payload.
type VoidPayload struct {
	PaymentInfo         PaymentInfoStruct
	SaltNonce           string
	AuthorizerSignature string
}

// Eip3009CollectPayloadFromMap parses a wire payload already confirmed by IsEip3009Payload.
func Eip3009CollectPayloadFromMap(data map[string]interface{}) (*Eip3009CollectPayload, error) {
	auth, ok := data["authorization"].(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("missing or invalid authorization field")
	}
	payload := &Eip3009CollectPayload{}
	payload.Authorization.From, _ = auth["from"].(string)
	payload.Authorization.To, _ = auth["to"].(string)
	payload.Authorization.Value, _ = auth["value"].(string)
	payload.Authorization.ValidAfter, _ = auth["validAfter"].(string)
	payload.Authorization.ValidBefore, _ = auth["validBefore"].(string)
	payload.Authorization.Nonce, _ = auth["nonce"].(string)

	payload.Signature, _ = data["signature"].(string)
	payload.Salt, _ = data["salt"].(string)
	payload.SaltNonce, _ = data["saltNonce"].(string)
	payload.Charge = chargeCompletionFromMap(data)
	return payload, nil
}

// Permit2CollectPayloadFromMap parses a wire payload already confirmed by IsPermit2Payload.
func Permit2CollectPayloadFromMap(data map[string]interface{}) (*Permit2CollectPayload, error) {
	auth, ok := data["permit2Authorization"].(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("missing or invalid permit2Authorization field")
	}
	permitted, ok := auth["permitted"].(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("missing or invalid permit2Authorization.permitted field")
	}

	payload := &Permit2CollectPayload{}
	payload.Permit2Authorization.From, _ = auth["from"].(string)
	payload.Permit2Authorization.Spender, _ = auth["spender"].(string)
	payload.Permit2Authorization.Nonce, _ = auth["nonce"].(string)
	payload.Permit2Authorization.Deadline, _ = auth["deadline"].(string)
	payload.Permit2Authorization.Permitted.Token, _ = permitted["token"].(string)
	payload.Permit2Authorization.Permitted.Amount, _ = permitted["amount"].(string)

	payload.Signature, _ = data["signature"].(string)
	payload.Salt, _ = data["salt"].(string)
	payload.SaltNonce, _ = data["saltNonce"].(string)
	payload.Charge = chargeCompletionFromMap(data)
	return payload, nil
}

func chargeCompletionFromMap(data map[string]interface{}) *ChargeCompletion {
	amount, hasAmount := data["amount"].(string)
	feeReceiver, hasFeeReceiver := data["feeReceiver"].(string)
	authorizerSignature, hasAuthorizerSig := data["authorizerSignature"].(string)
	if !hasAmount || !hasFeeReceiver || !hasAuthorizerSig {
		return nil
	}

	charge := &ChargeCompletion{
		Amount:              amount,
		FeeReceiver:         feeReceiver,
		AuthorizerSignature: authorizerSignature,
	}
	if feeAmount, ok := data["feeAmount"].(string); ok {
		charge.FeeAmount = feeAmount
	}
	if feeBps, ok := jsonNumberToUint16(data["feeBps"]); ok {
		charge.FeeBps = &feeBps
	}
	return charge
}

func jsonNumberToUint16(value interface{}) (uint16, bool) {
	switch v := value.(type) {
	case float64:
		if v < 0 || v > 65535 {
			return 0, false
		}
		return uint16(v), true
	case int:
		if v < 0 || v > 65535 {
			return 0, false
		}
		return uint16(v), true
	default:
		return 0, false
	}
}

func paymentInfoStructFromMap(v map[string]interface{}) (PaymentInfoStruct, error) {
	info := PaymentInfoStruct{}
	info.Operator, _ = v["operator"].(string)
	info.Payer, _ = v["payer"].(string)
	info.Receiver, _ = v["receiver"].(string)
	info.Token, _ = v["token"].(string)
	info.MaxAmount, _ = v["maxAmount"].(string)
	info.FeeReceiver, _ = v["feeReceiver"].(string)
	info.Salt, _ = v["salt"].(string)

	preApprovalExpiry, ok := jsonNumberToUint64(v["preApprovalExpiry"])
	if !ok {
		return PaymentInfoStruct{}, fmt.Errorf("invalid preApprovalExpiry")
	}
	authorizationExpiry, ok := jsonNumberToUint64(v["authorizationExpiry"])
	if !ok {
		return PaymentInfoStruct{}, fmt.Errorf("invalid authorizationExpiry")
	}
	refundExpiry, ok := jsonNumberToUint64(v["refundExpiry"])
	if !ok {
		return PaymentInfoStruct{}, fmt.Errorf("invalid refundExpiry")
	}
	minFeeBps, ok := jsonNumberToUint16(v["minFeeBps"])
	if !ok {
		return PaymentInfoStruct{}, fmt.Errorf("invalid minFeeBps")
	}
	maxFeeBps, ok := jsonNumberToUint16(v["maxFeeBps"])
	if !ok {
		return PaymentInfoStruct{}, fmt.Errorf("invalid maxFeeBps")
	}

	info.PreApprovalExpiry = preApprovalExpiry
	info.AuthorizationExpiry = authorizationExpiry
	info.RefundExpiry = refundExpiry
	info.MinFeeBps = minFeeBps
	info.MaxFeeBps = maxFeeBps
	return info, nil
}

func jsonNumberToUint64(value interface{}) (uint64, bool) {
	switch v := value.(type) {
	case float64:
		if v < 0 {
			return 0, false
		}
		return uint64(v), true
	case int:
		if v < 0 {
			return 0, false
		}
		return uint64(v), true
	case int64:
		if v < 0 {
			return 0, false
		}
		return uint64(v), true
	case uint64:
		return v, true
	default:
		return 0, false
	}
}

// CapturePayloadFromMap parses a wire payload already confirmed by IsCapturePayload.
func CapturePayloadFromMap(data map[string]interface{}) (*CapturePayload, error) {
	infoMap, ok := data["paymentInfo"].(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("missing or invalid paymentInfo field")
	}
	info, err := paymentInfoStructFromMap(infoMap)
	if err != nil {
		return nil, err
	}

	payload := &CapturePayload{PaymentInfo: info}
	payload.SaltNonce, _ = data["saltNonce"].(string)
	payload.Amount, _ = data["amount"].(string)
	payload.FeeReceiver, _ = data["feeReceiver"].(string)
	payload.ExpectedCapturableAmount, _ = data["expectedCapturableAmount"].(string)
	payload.ExpectedRefundableAmount, _ = data["expectedRefundableAmount"].(string)
	payload.AuthorizerSignature, _ = data["authorizerSignature"].(string)
	payload.VoidAuthorizerSignature, _ = data["voidAuthorizerSignature"].(string)
	if feeAmount, ok := data["feeAmount"].(string); ok {
		payload.FeeAmount = feeAmount
	}
	if feeBps, ok := jsonNumberToUint16(data["feeBps"]); ok {
		payload.FeeBps = &feeBps
	}
	return payload, nil
}

// VoidPayloadFromMap parses a wire payload already confirmed by IsVoidPayload.
func VoidPayloadFromMap(data map[string]interface{}) (*VoidPayload, error) {
	infoMap, ok := data["paymentInfo"].(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("missing or invalid paymentInfo field")
	}
	info, err := paymentInfoStructFromMap(infoMap)
	if err != nil {
		return nil, err
	}

	payload := &VoidPayload{PaymentInfo: info}
	payload.SaltNonce, _ = data["saltNonce"].(string)
	payload.AuthorizerSignature, _ = data["authorizerSignature"].(string)
	return payload, nil
}
