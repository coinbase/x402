package facilitator

import (
	"context"
	"errors"
	"math/big"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum/common"

	x402 "github.com/coinbase/x402/go"
	"github.com/coinbase/x402/go/extensions/eip2612gassponsor"
	"github.com/coinbase/x402/go/extensions/erc20approvalgassponsor"
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
	facilCtx *x402.FacilitatorContext,
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
	if authAmount.Cmp(requiredAmount) != 0 {
		return nil, x402.NewVerifyError(ErrPermit2AmountMismatch, payer, "amount mismatch")
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

	needsExtension := true
	allowance, allowanceErr := signer.ReadContract(ctx, tokenAddress, evm.ERC20AllowanceABI, "allowance",
		common.HexToAddress(payer), common.HexToAddress(evm.PERMIT2Address))
	if allowanceErr == nil {
		if allowanceBig, ok := allowance.(*big.Int); ok && allowanceBig.Cmp(requiredAmount) >= 0 {
			needsExtension = false
		}
	}

	if needsExtension {
		if extErr := verifyPermit2Extensions(payload, payer, tokenAddress, facilCtx); extErr != nil {
			return nil, extErr
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

// verifyPermit2Extensions validates gas-sponsoring extensions when Permit2 allowance
// is insufficient or could not be read. Returns nil if a valid extension is found,
// or a VerifyError if none are present/valid.
func verifyPermit2Extensions(
	payload types.PaymentPayload,
	payer string,
	tokenAddress string,
	facilCtx *x402.FacilitatorContext,
) error {
	eip2612Info, _ := eip2612gassponsor.ExtractEip2612GasSponsoringInfo(payload.Extensions)
	if eip2612Info != nil {
		if validErr := validateEip2612PermitForPayment(eip2612Info, payer, tokenAddress); validErr != "" {
			return x402.NewVerifyError(validErr, payer, "eip2612 validation failed")
		}
		return nil
	}

	erc20Info, _ := erc20approvalgassponsor.ExtractInfo(payload.Extensions)
	if erc20Info != nil && facilCtx != nil {
		ext, ok := facilCtx.GetExtension(erc20approvalgassponsor.ERC20ApprovalGasSponsoring.Key()).(*erc20approvalgassponsor.Erc20ApprovalFacilitatorExtension)
		var extensionSigner erc20approvalgassponsor.Erc20ApprovalGasSponsoringSigner
		if ok && ext != nil {
			extensionSigner = ext.ResolveSigner(payload.Accepted.Network)
		}
		if extensionSigner != nil {
			if reason, msg := ValidateErc20ApprovalForPayment(erc20Info, payer, tokenAddress); reason != "" {
				return x402.NewVerifyError(reason, payer, msg)
			}
			return nil
		}
	}

	return x402.NewVerifyError(ErrPermit2AllowanceRequired, payer, "permit2 allowance required")
}

// SettlePermit2 settles a Permit2 payment by calling x402ExactPermit2Proxy.settle().
func SettlePermit2(
	ctx context.Context,
	signer evm.FacilitatorEvmSigner,
	payload types.PaymentPayload,
	requirements types.PaymentRequirements,
	permit2Payload *evm.ExactPermit2Payload,
	facilCtx *x402.FacilitatorContext,
) (*x402.SettleResponse, error) {
	network := x402.Network(payload.Accepted.Network)
	payer := permit2Payload.Permit2Authorization.From

	// Re-verify before settling
	verifyResp, err := VerifyPermit2(ctx, signer, payload, requirements, permit2Payload, facilCtx)
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
	}{
		To:         common.HexToAddress(permit2Payload.Permit2Authorization.Witness.To),
		ValidAfter: validAfter,
	}

	eip2612Info, _ := eip2612gassponsor.ExtractEip2612GasSponsoringInfo(payload.Extensions)
	erc20Info, _ := erc20approvalgassponsor.ExtractInfo(payload.Extensions)

	var txHash string

	switch {
	case eip2612Info != nil:
		// Use settleWithPermit - includes the EIP-2612 permit
		v, r, s, splitErr := splitEip2612Signature(eip2612Info.Signature)
		if splitErr != nil {
			return nil, x402.NewSettleError(ErrInvalidPayload, payer, network, "", "invalid eip2612 signature format")
		}

		eip2612Value, ok := new(big.Int).SetString(eip2612Info.Amount, 10)
		if !ok {
			return nil, x402.NewSettleError(ErrInvalidPayload, payer, network, "", "invalid eip2612 amount")
		}
		eip2612Deadline, ok := new(big.Int).SetString(eip2612Info.Deadline, 10)
		if !ok {
			return nil, x402.NewSettleError(ErrInvalidPayload, payer, network, "", "invalid eip2612 deadline")
		}

		permit2612Struct := struct {
			Value    *big.Int
			Deadline *big.Int
			R        [32]byte
			S        [32]byte
			V        uint8
		}{
			Value:    eip2612Value,
			Deadline: eip2612Deadline,
			R:        r,
			S:        s,
			V:        v,
		}

		txHash, err = signer.WriteContract(
			ctx,
			evm.X402ExactPermit2ProxyAddress,
			evm.X402ExactPermit2ProxySettleWithPermitABI,
			evm.FunctionSettleWithPermit,
			permit2612Struct,
			permitStruct,
			common.HexToAddress(payer),
			witnessStruct,
			signatureBytes,
		)
	case erc20Info != nil && facilCtx != nil:
		// Branch: ERC-20 approval gas sponsoring (broadcast approval + settle via extension signer)
		ext, ok := facilCtx.GetExtension(erc20approvalgassponsor.ERC20ApprovalGasSponsoring.Key()).(*erc20approvalgassponsor.Erc20ApprovalFacilitatorExtension)
		var extensionSigner erc20approvalgassponsor.Erc20ApprovalGasSponsoringSigner
		if ok && ext != nil {
			extensionSigner = ext.ResolveSigner(payload.Accepted.Network)
		}
		if extensionSigner != nil {
			settle := erc20approvalgassponsor.WriteContractCall{
				Address:  evm.X402ExactPermit2ProxyAddress,
				ABI:      evm.X402ExactPermit2ProxySettleABI,
				Function: evm.FunctionSettle,
				Args:     []interface{}{permitStruct, common.HexToAddress(payer), witnessStruct, signatureBytes},
			}
			txHashes, sendErr := extensionSigner.SendTransactions(ctx, []erc20approvalgassponsor.TransactionRequest{
				{Serialized: erc20Info.SignedTransaction},
				{Call: &settle},
			})
			if sendErr != nil {
				err = sendErr
			} else if len(txHashes) > 0 {
				txHash = txHashes[len(txHashes)-1]
			}
		} else {
			txHash, err = signer.WriteContract(
				ctx,
				evm.X402ExactPermit2ProxyAddress,
				evm.X402ExactPermit2ProxySettleABI,
				evm.FunctionSettle,
				permitStruct,
				common.HexToAddress(payer),
				witnessStruct,
				signatureBytes,
			)
		}
	default:
		txHash, err = signer.WriteContract(
			ctx,
			evm.X402ExactPermit2ProxyAddress,
			evm.X402ExactPermit2ProxySettleABI,
			evm.FunctionSettle,
			permitStruct,
			common.HexToAddress(payer),
			witnessStruct,
			signatureBytes,
		)
	}

	if err != nil {
		errorReason := parsePermit2Error(err)
		return nil, x402.NewSettleError(errorReason, payer, network, "", err.Error())
	}

	// Wait for transaction confirmation
	receiptWaitSigner := signer
	if erc20Info != nil && facilCtx != nil {
		if ext, ok := facilCtx.GetExtension(erc20approvalgassponsor.ERC20ApprovalGasSponsoring.Key()).(*erc20approvalgassponsor.Erc20ApprovalFacilitatorExtension); ok && ext != nil {
			if extensionSigner := ext.ResolveSigner(payload.Accepted.Network); extensionSigner != nil {
				receiptWaitSigner = extensionSigner
			}
		}
	}
	receipt, err := receiptWaitSigner.WaitForTransactionReceipt(ctx, txHash)
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

// validateEip2612PermitForPayment validates the EIP-2612 extension data.
// Returns an empty string if valid, or an error reason string.
func validateEip2612PermitForPayment(info *eip2612gassponsor.Info, payer string, tokenAddress string) string {
	if !eip2612gassponsor.ValidateEip2612GasSponsoringInfo(info) {
		return "invalid_eip2612_extension_format"
	}

	// Verify from matches payer
	if !strings.EqualFold(info.From, payer) {
		return "eip2612_from_mismatch"
	}

	// Verify asset matches token
	if !strings.EqualFold(info.Asset, tokenAddress) {
		return "eip2612_asset_mismatch"
	}

	// Verify spender is Permit2
	if !strings.EqualFold(info.Spender, evm.PERMIT2Address) {
		return "eip2612_spender_not_permit2"
	}

	// Verify deadline not expired
	// Use 6 second buffer consistent with Permit2 deadline check
	now := time.Now().Unix()
	deadline, ok := new(big.Int).SetString(info.Deadline, 10)
	if !ok || deadline.Int64() < now+evm.Permit2DeadlineBuffer {
		return "eip2612_deadline_expired"
	}

	return ""
}

// splitEip2612Signature splits a 65-byte hex signature into v, r, s.
func splitEip2612Signature(signature string) (uint8, [32]byte, [32]byte, error) {
	sigBytes, err := evm.HexToBytes(signature)
	if err != nil {
		return 0, [32]byte{}, [32]byte{}, err
	}

	if len(sigBytes) != 65 {
		return 0, [32]byte{}, [32]byte{}, errors.New("signature must be 65 bytes")
	}

	var r, s [32]byte
	copy(r[:], sigBytes[0:32])
	copy(s[:], sigBytes[32:64])
	v := sigBytes[64]

	return v, r, s, nil
}

// parsePermit2Error extracts meaningful error codes from contract reverts.
func parsePermit2Error(err error) string {
	msg := err.Error()
	switch {
	case strings.Contains(msg, "Permit2612AmountMismatch"):
		return ErrPermit2612AmountMismatch
	case strings.Contains(msg, "InvalidAmount"):
		return ErrPermit2InvalidAmount
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
	case strings.Contains(msg, "erc20_approval_tx_failed"):
		return ErrErc20ApprovalBroadcastFailed
	default:
		return ErrFailedToExecuteTransfer
	}
}
