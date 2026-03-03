package evm

import "fmt"

// UserOperation07Json represents an ERC-4337 v0.7 User Operation in JSON-RPC format.
// All numeric values are hex-encoded strings.
type UserOperation07Json struct {
	Sender                        string `json:"sender"`
	Nonce                         string `json:"nonce"`
	Factory                       string `json:"factory,omitempty"`
	FactoryData                   string `json:"factoryData,omitempty"`
	CallData                      string `json:"callData"`
	CallGasLimit                  string `json:"callGasLimit"`
	VerificationGasLimit          string `json:"verificationGasLimit"`
	PreVerificationGas            string `json:"preVerificationGas"`
	MaxFeePerGas                  string `json:"maxFeePerGas"`
	MaxPriorityFeePerGas          string `json:"maxPriorityFeePerGas"`
	Paymaster                     string `json:"paymaster,omitempty"`
	PaymasterData                 string `json:"paymasterData,omitempty"`
	PaymasterVerificationGasLimit string `json:"paymasterVerificationGasLimit,omitempty"`
	PaymasterPostOpGasLimit       string `json:"paymasterPostOpGasLimit,omitempty"`
	Signature                     string `json:"signature"`
}

// Erc4337Payload represents an ERC-4337 payment payload for x402 payments.
type Erc4337Payload struct {
	Type          string              `json:"type,omitempty"`
	EntryPoint    string              `json:"entryPoint"`
	BundlerRpcUrl string              `json:"bundlerRpcUrl,omitempty"`
	UserOperation UserOperation07Json `json:"userOperation"`
}

// UserOperationCapability describes the ERC-4337 capability advertised in payment requirements.
type UserOperationCapability struct {
	Supported  bool   `json:"supported"`
	BundlerUrl string `json:"bundlerUrl,omitempty"`
	Paymaster  string `json:"paymaster,omitempty"`
	Entrypoint string `json:"entrypoint,omitempty"`
}

// IsErc4337Payload checks if a payload map is an ERC-4337 payload.
// ERC-4337 payloads have a `userOperation` field and an `entryPoint` field.
func IsErc4337Payload(data map[string]interface{}) bool {
	userOp, hasUserOp := data["userOperation"]
	_, hasEntryPoint := data["entryPoint"]
	return hasUserOp && userOp != nil && hasEntryPoint
}

// Erc4337PayloadFromMap creates an Erc4337Payload from a map.
// Returns an error if required fields are missing.
func Erc4337PayloadFromMap(data map[string]interface{}) (*Erc4337Payload, error) {
	payload := &Erc4337Payload{}

	if t, ok := data["type"].(string); ok {
		payload.Type = t
	}

	entryPoint, ok := data["entryPoint"].(string)
	if !ok || entryPoint == "" {
		return nil, fmt.Errorf("missing or invalid entryPoint field")
	}
	payload.EntryPoint = entryPoint

	if bundlerUrl, ok := data["bundlerRpcUrl"].(string); ok {
		payload.BundlerRpcUrl = bundlerUrl
	}

	userOpMap, ok := data["userOperation"].(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("missing or invalid userOperation field")
	}

	userOp, err := userOperationFromMap(userOpMap)
	if err != nil {
		return nil, fmt.Errorf("invalid userOperation: %w", err)
	}
	payload.UserOperation = *userOp

	return payload, nil
}

// ToMap converts an Erc4337Payload to a map for JSON marshaling.
func (p *Erc4337Payload) ToMap() map[string]interface{} {
	result := map[string]interface{}{
		"entryPoint":    p.EntryPoint,
		"userOperation": p.UserOperation.ToMap(),
	}
	if p.Type != "" {
		result["type"] = p.Type
	}
	if p.BundlerRpcUrl != "" {
		result["bundlerRpcUrl"] = p.BundlerRpcUrl
	}
	return result
}

// ToMap converts a UserOperation07Json to a map for JSON marshaling.
func (u *UserOperation07Json) ToMap() map[string]interface{} {
	result := map[string]interface{}{
		"sender":               u.Sender,
		"nonce":                u.Nonce,
		"callData":             u.CallData,
		"callGasLimit":         u.CallGasLimit,
		"verificationGasLimit": u.VerificationGasLimit,
		"preVerificationGas":   u.PreVerificationGas,
		"maxFeePerGas":         u.MaxFeePerGas,
		"maxPriorityFeePerGas": u.MaxPriorityFeePerGas,
		"signature":            u.Signature,
	}
	if u.Factory != "" {
		result["factory"] = u.Factory
	}
	if u.FactoryData != "" {
		result["factoryData"] = u.FactoryData
	}
	if u.Paymaster != "" {
		result["paymaster"] = u.Paymaster
	}
	if u.PaymasterData != "" {
		result["paymasterData"] = u.PaymasterData
	}
	if u.PaymasterVerificationGasLimit != "" {
		result["paymasterVerificationGasLimit"] = u.PaymasterVerificationGasLimit
	}
	if u.PaymasterPostOpGasLimit != "" {
		result["paymasterPostOpGasLimit"] = u.PaymasterPostOpGasLimit
	}
	return result
}

// userOperationFromMap creates a UserOperation07Json from a map.
func userOperationFromMap(data map[string]interface{}) (*UserOperation07Json, error) {
	userOp := &UserOperation07Json{}

	sender, ok := data["sender"].(string)
	if !ok || sender == "" {
		return nil, fmt.Errorf("missing or invalid sender field")
	}
	userOp.Sender = sender

	if nonce, ok := data["nonce"].(string); ok {
		userOp.Nonce = nonce
	}
	if callData, ok := data["callData"].(string); ok {
		userOp.CallData = callData
	}
	if v, ok := data["callGasLimit"].(string); ok {
		userOp.CallGasLimit = v
	}
	if v, ok := data["verificationGasLimit"].(string); ok {
		userOp.VerificationGasLimit = v
	}
	if v, ok := data["preVerificationGas"].(string); ok {
		userOp.PreVerificationGas = v
	}
	if v, ok := data["maxFeePerGas"].(string); ok {
		userOp.MaxFeePerGas = v
	}
	if v, ok := data["maxPriorityFeePerGas"].(string); ok {
		userOp.MaxPriorityFeePerGas = v
	}
	if v, ok := data["signature"].(string); ok {
		userOp.Signature = v
	}

	// Optional fields
	if v, ok := data["factory"].(string); ok {
		userOp.Factory = v
	}
	if v, ok := data["factoryData"].(string); ok {
		userOp.FactoryData = v
	}
	if v, ok := data["paymaster"].(string); ok {
		userOp.Paymaster = v
	}
	if v, ok := data["paymasterData"].(string); ok {
		userOp.PaymasterData = v
	}
	if v, ok := data["paymasterVerificationGasLimit"].(string); ok {
		userOp.PaymasterVerificationGasLimit = v
	}
	if v, ok := data["paymasterPostOpGasLimit"].(string); ok {
		userOp.PaymasterPostOpGasLimit = v
	}

	return userOp, nil
}

// ExtractUserOperationCapability extracts the UserOperation capability from payment requirements extra.
func ExtractUserOperationCapability(extra map[string]interface{}) *UserOperationCapability {
	if extra == nil {
		return nil
	}

	userOpExtra, ok := extra["userOperation"].(map[string]interface{})
	if !ok {
		return nil
	}

	supported, ok := userOpExtra["supported"].(bool)
	if !ok || !supported {
		return nil
	}

	cap := &UserOperationCapability{
		Supported: true,
	}

	if bundlerUrl, ok := userOpExtra["bundlerUrl"].(string); ok {
		cap.BundlerUrl = bundlerUrl
	}
	if paymaster, ok := userOpExtra["paymaster"].(string); ok {
		cap.Paymaster = paymaster
	}
	if entrypoint, ok := userOpExtra["entrypoint"].(string); ok {
		cap.Entrypoint = entrypoint
	}

	return cap
}
