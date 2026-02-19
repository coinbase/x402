package facilitator

import (
	"bytes"
	"context"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"time"

	ethabi "github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	ethTypes "github.com/ethereum/go-ethereum/core/types"

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
	fctx *x402.FacilitatorContext,
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
			// Allowance insufficient - check for EIP-2612 gas sponsoring extension first
			eip2612Info, extErr := eip2612gassponsor.ExtractEip2612GasSponsoringInfo(payload.Extensions)
			if extErr != nil || eip2612Info == nil {
				// EIP-2612 not available - try ERC-20 raw approval extension as fallback
				erc20Info, erc20ExtErr := erc20approvalgassponsor.ExtractErc20ApprovalGasSponsoringInfo(payload.Extensions)
				if erc20ExtErr != nil || erc20Info == nil {
					return nil, x402.NewVerifyError(ErrPermit2AllowanceRequired, payer, "permit2 allowance required")
				}
				// Validate the ERC-20 extension data
				if validErr := validateErc20ApprovalForPayment(ctx, signer, erc20Info, payer, tokenAddress, chainID); validErr != "" {
					return nil, x402.NewVerifyError(validErr, payer, "erc20 approval validation failed")
				}
				// ERC-20 extension is valid, approval will be submitted during settlement
			} else {
				// Validate the EIP-2612 extension data
				if validErr := validateEip2612PermitForPayment(eip2612Info, payer, tokenAddress); validErr != "" {
					return nil, x402.NewVerifyError(validErr, payer, "eip2612 validation failed")
				}
				// EIP-2612 extension is valid, allowance will be set during settlement
			}
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
	fctx *x402.FacilitatorContext,
) (*x402.SettleResponse, error) {
	network := x402.Network(payload.Accepted.Network)
	payer := permit2Payload.Permit2Authorization.From

	// Re-verify before settling
	verifyResp, err := VerifyPermit2(ctx, signer, payload, requirements, permit2Payload, fctx)
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

	// Check for EIP-2612 gas sponsoring extension
	eip2612Info, _ := eip2612gassponsor.ExtractEip2612GasSponsoringInfo(payload.Extensions)

	// Check for ERC-20 approval gas sponsoring (fallback to EIP-2612)
	erc20Info, _ := erc20approvalgassponsor.ExtractErc20ApprovalGasSponsoringInfo(payload.Extensions)

	var txHash string

	if eip2612Info != nil {
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
	} else if erc20Info != nil {
		// ERC-20 raw approval batch settle path
		extRaw := fctx.GetExtension(erc20approvalgassponsor.ERC20ApprovalGasSponsoring)
		ext, ok := extRaw.(*erc20approvalgassponsor.FacilitatorExt)
		if !ok || ext == nil || ext.SmartWalletSigner == nil {
			return nil, x402.NewSettleError(ErrErc20GasSponsoringNotConfigured, payer, network, "", "smart wallet signer not configured for erc20 gas sponsoring")
		}

		// Extract calldata from the pre-signed approval transaction
		approvalCalldata, approvalErr := extractCalldataFromSignedTx(erc20Info.SignedTransaction)
		if approvalErr != nil {
			return nil, x402.NewSettleError(ErrErc20InvalidSignedTx, payer, network, "", approvalErr.Error())
		}

		// ABI-encode settle calldata for inclusion in the batch
		settleCalldata, settleErr := encodeSettleCalldata(
			common.HexToAddress(permit2Payload.Permit2Authorization.Permitted.Token),
			amount, nonce, deadline,
			common.HexToAddress(payer),
			common.HexToAddress(permit2Payload.Permit2Authorization.Witness.To),
			validAfter, extraBytes,
			signatureBytes,
		)
		if settleErr != nil {
			return nil, x402.NewSettleError(ErrInvalidPayload, payer, network, "", fmt.Sprintf("failed to encode settle calldata: %s", settleErr.Error()))
		}

		// Build atomic batch: [approve Permit2] + [settle]
		calls := []erc20approvalgassponsor.BatchCall{
			{To: evm.NormalizeAddress(permit2Payload.Permit2Authorization.Permitted.Token), Data: approvalCalldata},
			{To: evm.X402ExactPermit2ProxyAddress, Data: settleCalldata},
		}

		batchTxHash, batchErr := ext.SmartWalletSigner.SendBatchTransaction(ctx, calls)
		if batchErr != nil {
			return nil, x402.NewSettleError(ErrFailedToExecuteTransfer, payer, network, "", batchErr.Error())
		}

		batchReceipt, batchErr := ext.SmartWalletSigner.WaitForTransactionReceipt(ctx, batchTxHash)
		if batchErr != nil {
			return nil, x402.NewSettleError(ErrFailedToGetReceipt, payer, network, batchTxHash, batchErr.Error())
		}
		if batchReceipt.Status != evm.TxStatusSuccess {
			return nil, x402.NewSettleError(ErrTransactionFailed, payer, network, batchTxHash, "")
		}

		return &x402.SettleResponse{
			Success:     true,
			Transaction: batchTxHash,
			Network:     network,
			Payer:       verifyResp.Payer,
		}, nil
	} else {
		// Standard settle - no EIP-2612 or ERC-20 extension
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

// validateErc20ApprovalForPayment validates the ERC-20 approval extension data
// matches the expected payment. Returns an empty string if valid, or an error reason.
func validateErc20ApprovalForPayment(
	_ context.Context,
	_ evm.FacilitatorEvmSigner,
	info *erc20approvalgassponsor.Info,
	payer string,
	tokenAddress string,
	chainID *big.Int,
) string {
	if !erc20approvalgassponsor.ValidateErc20ApprovalGasSponsoringInfo(info) {
		return "invalid_erc20_extension_format"
	}

	if !strings.EqualFold(info.From, payer) {
		return ErrErc20SignerMismatch
	}

	if !strings.EqualFold(info.Asset, tokenAddress) {
		return ErrErc20TokenMismatch
	}

	if !strings.EqualFold(info.Spender, evm.PERMIT2Address) {
		return ErrErc20SpenderNotPermit2
	}

	// Decode the signed transaction
	txBytes, err := hex.DecodeString(strings.TrimPrefix(info.SignedTransaction, "0x"))
	if err != nil {
		return ErrErc20InvalidSignedTx
	}

	tx := new(ethTypes.Transaction)
	if err := tx.UnmarshalBinary(txBytes); err != nil {
		return ErrErc20InvalidSignedTx
	}

	// Verify the transaction sender matches From
	txSigner := ethTypes.LatestSignerForChainID(chainID)
	sender, senderErr := txSigner.Sender(tx)
	if senderErr != nil || !strings.EqualFold(sender.Hex(), info.From) {
		return ErrErc20SignerMismatch
	}

	// Verify the transaction targets the correct token contract
	if tx.To() == nil || !strings.EqualFold(tx.To().Hex(), tokenAddress) {
		return ErrErc20TokenMismatch
	}

	// Verify calldata starts with approve(address,uint256) selector
	txData := tx.Data()
	if len(txData) < 4 {
		return ErrErc20InvalidCalldata
	}

	selectorHex := "0x" + hex.EncodeToString(txData[:4])
	if !strings.EqualFold(selectorHex, evm.ERC20ApproveFunctionSelector) {
		return ErrErc20InvalidCalldata
	}

	// ABI-decode the approve arguments and verify spender is Permit2
	parsedABI, parseErr := ethabi.JSON(bytes.NewReader(evm.ERC20ApproveABI))
	if parseErr != nil {
		return ErrErc20InvalidCalldata
	}

	args, unpackErr := parsedABI.Methods["approve"].Inputs.Unpack(txData[4:])
	if unpackErr != nil || len(args) < 2 {
		return ErrErc20InvalidCalldata
	}

	spenderAddr, ok := args[0].(common.Address)
	if !ok || !strings.EqualFold(spenderAddr.Hex(), evm.PERMIT2Address) {
		return ErrErc20SpenderNotPermit2
	}

	return ""
}

// extractCalldataFromSignedTx decodes an RLP-encoded signed transaction and
// returns its calldata (input data field).
func extractCalldataFromSignedTx(signedTxHex string) ([]byte, error) {
	txBytes, err := hex.DecodeString(strings.TrimPrefix(signedTxHex, "0x"))
	if err != nil {
		return nil, fmt.Errorf("invalid hex: %w", err)
	}

	tx := new(ethTypes.Transaction)
	if err := tx.UnmarshalBinary(txBytes); err != nil {
		return nil, fmt.Errorf("failed to decode transaction: %w", err)
	}

	return tx.Data(), nil
}

// encodeSettleCalldata ABI-encodes the settle(permit, owner, witness, signature)
// call for use in a batch transaction.
func encodeSettleCalldata(
	tokenAddress common.Address,
	amount *big.Int,
	nonce *big.Int,
	deadline *big.Int,
	owner common.Address,
	to common.Address,
	validAfter *big.Int,
	extra []byte,
	signature []byte,
) ([]byte, error) {
	parsedABI, err := ethabi.JSON(bytes.NewReader(evm.X402ExactPermit2ProxySettleABI))
	if err != nil {
		return nil, fmt.Errorf("failed to parse settle ABI: %w", err)
	}

	permitArg := struct {
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
		}{Token: tokenAddress, Amount: amount},
		Nonce:    nonce,
		Deadline: deadline,
	}

	witnessArg := struct {
		To         common.Address
		ValidAfter *big.Int
		Extra      []byte
	}{
		To:         to,
		ValidAfter: validAfter,
		Extra:      extra,
	}

	return parsedABI.Pack(evm.FunctionSettle, permitArg, owner, witnessArg, signature)
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
