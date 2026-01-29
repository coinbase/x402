package facilitator

import (
	"context"
	"errors"
	"math/big"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum/common"

	x402 "github.com/coinbase/x402/go"
	"github.com/coinbase/x402/go/mechanisms/evm"
	"github.com/coinbase/x402/go/types"
)

// VerifyPermit2 verifies a Permit2 payment payload.
func VerifyPermit2(
	ctx context.Context,
	signer evm.FacilitatorEvmSigner,
	payload types.PaymentPayload,
	requirements types.PaymentRequirements,
	permit2Payload *evm.ExactPermit2Payload,
) (*x402.VerifyResponse, error) {
	payer := permit2Payload.Permit2Authorization.From

	// Verify scheme matches
	if payload.Accepted.Scheme != evm.SchemeExact || requirements.Scheme != evm.SchemeExact {
		return nil, x402.NewVerifyError(ErrUnsupportedPayloadType, payer, "scheme mismatch")
	}

	// Verify network matches
	if payload.Accepted.Network != requirements.Network {
		return nil, x402.NewVerifyError(ErrNetworkMismatch, payer, "network mismatch")
	}

	chainID, err := evm.GetEvmChainId(string(requirements.Network))
	if err != nil {
		return nil, x402.NewVerifyError(ErrFailedToGetNetworkConfig, payer, err.Error())
	}

	tokenAddress := evm.NormalizeAddress(requirements.Asset)

	// Verify spender is x402ExactPermit2Proxy
	if !strings.EqualFold(permit2Payload.Permit2Authorization.Spender, evm.X402ExactPermit2ProxyAddress) {
		return nil, x402.NewVerifyError(ErrPermit2InvalidSpender, payer, "invalid spender")
	}

	// Verify witness.to matches payTo
	if !strings.EqualFold(permit2Payload.Permit2Authorization.Witness.To, requirements.PayTo) {
		return nil, x402.NewVerifyError(ErrPermit2RecipientMismatch, payer, "recipient mismatch")
	}

	// Parse and verify deadline not expired (with buffer for block time)
	now := time.Now().Unix()
	deadline, ok := new(big.Int).SetString(permit2Payload.Permit2Authorization.Deadline, 10)
	if !ok {
		return nil, x402.NewVerifyError(ErrInvalidPayload, payer, "invalid deadline format")
	}
	deadlineThreshold := big.NewInt(now + evm.Permit2DeadlineBuffer)
	if deadline.Cmp(deadlineThreshold) < 0 {
		return nil, x402.NewVerifyError(ErrPermit2DeadlineExpired, payer, "deadline expired")
	}

	// Parse and verify validAfter is not in the future
	validAfter, ok := new(big.Int).SetString(permit2Payload.Permit2Authorization.Witness.ValidAfter, 10)
	if !ok {
		return nil, x402.NewVerifyError(ErrInvalidPayload, payer, "invalid validAfter format")
	}
	nowBig := big.NewInt(now)
	if validAfter.Cmp(nowBig) > 0 {
		return nil, x402.NewVerifyError(ErrPermit2NotYetValid, payer, "not yet valid")
	}

	// Parse and verify amount is sufficient
	authAmount, ok := new(big.Int).SetString(permit2Payload.Permit2Authorization.Permitted.Amount, 10)
	if !ok {
		return nil, x402.NewVerifyError(ErrInvalidPayload, payer, "invalid permitted amount format")
	}
	requiredAmount, ok := new(big.Int).SetString(requirements.Amount, 10)
	if !ok {
		return nil, x402.NewVerifyError(ErrInvalidRequiredAmount, payer, "invalid required amount format")
	}
	if authAmount.Cmp(requiredAmount) < 0 {
		return nil, x402.NewVerifyError(ErrPermit2InsufficientAmount, payer, "insufficient amount")
	}

	// Verify token matches
	if !strings.EqualFold(permit2Payload.Permit2Authorization.Permitted.Token, requirements.Asset) {
		return nil, x402.NewVerifyError(ErrPermit2TokenMismatch, payer, "token mismatch")
	}

	// Verify signature
	signatureBytes, err := evm.HexToBytes(permit2Payload.Signature)
	if err != nil {
		return nil, x402.NewVerifyError(ErrInvalidSignatureFormat, payer, err.Error())
	}

	valid, err := verifyPermit2Signature(ctx, signer, permit2Payload.Permit2Authorization, signatureBytes, chainID)
	if err != nil || !valid {
		return nil, x402.NewVerifyError(ErrPermit2InvalidSignature, payer, "invalid signature")
	}

	// Check Permit2 allowance
	allowance, err := signer.ReadContract(ctx, tokenAddress, evm.ERC20AllowanceABI, "allowance",
		common.HexToAddress(payer), common.HexToAddress(evm.PERMIT2Address))
	if err == nil {
		if allowanceBig, ok := allowance.(*big.Int); ok && allowanceBig.Cmp(requiredAmount) < 0 {
			return nil, x402.NewVerifyError(ErrPermit2AllowanceRequired, payer, "permit2 allowance required")
		}
	}

	// Check balance
	balance, err := signer.GetBalance(ctx, payer, tokenAddress)
	if err == nil && balance.Cmp(requiredAmount) < 0 {
		return nil, x402.NewVerifyError(ErrInsufficientBalance, payer, "insufficient balance")
	}

	return &x402.VerifyResponse{
		IsValid: true,
		Payer:   payer,
	}, nil
}

// SettlePermit2 settles a Permit2 payment by calling x402ExactPermit2Proxy.settle().
func SettlePermit2(
	ctx context.Context,
	signer evm.FacilitatorEvmSigner,
	payload types.PaymentPayload,
	requirements types.PaymentRequirements,
	permit2Payload *evm.ExactPermit2Payload,
) (*x402.SettleResponse, error) {
	network := x402.Network(payload.Accepted.Network)
	payer := permit2Payload.Permit2Authorization.From

	// Re-verify before settling
	verifyResp, err := VerifyPermit2(ctx, signer, payload, requirements, permit2Payload)
	if err != nil {
		ve := &x402.VerifyError{}
		if errors.As(err, &ve) {
			return nil, x402.NewSettleError(ve.InvalidReason, ve.Payer, network, "", ve.InvalidMessage)
		}
		return nil, x402.NewSettleError(ErrVerificationFailed, payer, network, "", err.Error())
	}

	// Parse values for contract call (validated during verify, but check again for safety)
	amount, ok := new(big.Int).SetString(permit2Payload.Permit2Authorization.Permitted.Amount, 10)
	if !ok {
		return nil, x402.NewSettleError(ErrInvalidPayload, payer, network, "", "invalid permitted amount")
	}
	nonce, ok := new(big.Int).SetString(permit2Payload.Permit2Authorization.Nonce, 10)
	if !ok {
		return nil, x402.NewSettleError(ErrInvalidPayload, payer, network, "", "invalid nonce")
	}
	deadline, ok := new(big.Int).SetString(permit2Payload.Permit2Authorization.Deadline, 10)
	if !ok {
		return nil, x402.NewSettleError(ErrInvalidPayload, payer, network, "", "invalid deadline")
	}
	validAfter, ok := new(big.Int).SetString(permit2Payload.Permit2Authorization.Witness.ValidAfter, 10)
	if !ok {
		return nil, x402.NewSettleError(ErrInvalidPayload, payer, network, "", "invalid validAfter")
	}
	extraBytes, err := evm.HexToBytes(permit2Payload.Permit2Authorization.Witness.Extra)
	if err != nil {
		return nil, x402.NewSettleError(ErrInvalidPayload, payer, network, "", "invalid witness extra")
	}
	signatureBytes, err := evm.HexToBytes(permit2Payload.Signature)
	if err != nil {
		return nil, x402.NewSettleError(ErrInvalidSignatureFormat, payer, network, "", "invalid signature format")
	}

	// Create struct args for the settle call
	// The ABI expects: settle(permit, owner, witness, signature)
	permitStruct := struct {
		Permitted struct {
			Token  common.Address
			Amount *big.Int
		}
		Nonce    *big.Int
		Deadline *big.Int
	}{
		Permitted: struct {
			Token  common.Address
			Amount *big.Int
		}{
			Token:  common.HexToAddress(permit2Payload.Permit2Authorization.Permitted.Token),
			Amount: amount,
		},
		Nonce:    nonce,
		Deadline: deadline,
	}

	witnessStruct := struct {
		To         common.Address
		ValidAfter *big.Int
		Extra      []byte
	}{
		To:         common.HexToAddress(permit2Payload.Permit2Authorization.Witness.To),
		ValidAfter: validAfter,
		Extra:      extraBytes,
	}

	// Call x402ExactPermit2Proxy.settle()
	txHash, err := signer.WriteContract(
		ctx,
		evm.X402ExactPermit2ProxyAddress,
		evm.X402ExactPermit2ProxySettleABI,
		evm.FunctionSettle,
		permitStruct,
		common.HexToAddress(payer),
		witnessStruct,
		signatureBytes,
	)

	if err != nil {
		errorReason := parsePermit2Error(err)
		return nil, x402.NewSettleError(errorReason, payer, network, "", err.Error())
	}

	// Wait for transaction confirmation
	receipt, err := signer.WaitForTransactionReceipt(ctx, txHash)
	if err != nil {
		return nil, x402.NewSettleError(ErrFailedToGetReceipt, payer, network, txHash, err.Error())
	}

	if receipt.Status != evm.TxStatusSuccess {
		return nil, x402.NewSettleError(ErrTransactionFailed, payer, network, txHash, "")
	}

	return &x402.SettleResponse{
		Success:     true,
		Transaction: txHash,
		Network:     network,
		Payer:       verifyResp.Payer,
	}, nil
}

// verifyPermit2Signature verifies the Permit2 EIP-712 signature.
func verifyPermit2Signature(
	ctx context.Context,
	signer evm.FacilitatorEvmSigner,
	authorization evm.Permit2Authorization,
	signature []byte,
	chainID *big.Int,
) (bool, error) {
	hash, err := evm.HashPermit2Authorization(authorization, chainID)
	if err != nil {
		return false, err
	}

	var hash32 [32]byte
	copy(hash32[:], hash)

	// Use universal verification (supports EOA and EIP-1271)
	valid, _, err := evm.VerifyUniversalSignature(ctx, signer, authorization.From, hash32, signature, true)
	return valid, err
}

// parsePermit2Error extracts meaningful error codes from contract reverts.
func parsePermit2Error(err error) string {
	msg := err.Error()
	switch {
	case strings.Contains(msg, "AmountExceedsPermitted"):
		return ErrPermit2AmountExceedsPermitted
	case strings.Contains(msg, "InvalidDestination"):
		return ErrPermit2InvalidDestination
	case strings.Contains(msg, "InvalidOwner"):
		return ErrPermit2InvalidOwner
	case strings.Contains(msg, "PaymentTooEarly"):
		return ErrPermit2PaymentTooEarly
	case strings.Contains(msg, "InvalidSignature"), strings.Contains(msg, "SignatureExpired"):
		return ErrPermit2InvalidSignature
	case strings.Contains(msg, "InvalidNonce"):
		return ErrPermit2InvalidNonce
	default:
		return ErrFailedToExecuteTransfer
	}
}
