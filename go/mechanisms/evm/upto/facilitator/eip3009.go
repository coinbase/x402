package facilitator

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum/common"

	x402 "github.com/x402-foundation/x402/go/v2"
	"github.com/x402-foundation/x402/go/v2/mechanisms/evm"
	"github.com/x402-foundation/x402/go/v2/types"
)

type uptoEIP3009PendingRecord struct {
	TxHash  string `json:"txHash"`
	Network string `json:"network"`
	Amount  string `json:"amount"`
	Payer   string `json:"payer"`
	Asset   string `json:"asset"`
	PayTo   string `json:"payTo"`
	Nonce   string `json:"nonce"`
}

// UptoEIP3009SettleArgs contains the typed proxy settlement arguments.
type UptoEIP3009SettleArgs struct {
	Token         common.Address
	Amount        *big.Int
	Authorization struct {
		From        common.Address
		To          common.Address
		Value       *big.Int
		ValidAfter  *big.Int
		ValidBefore *big.Int
		Nonce       [32]byte
	}
	PaymentInfo struct {
		PayTo   common.Address
		Settler common.Address
		Salt    [32]byte
	}
	Signature []byte
}

// BuildUptoEIP3009SettleArgs builds the canonical proxy settle arguments.
func BuildUptoEIP3009SettleArgs(
	requirements types.PaymentRequirements,
	payload *evm.UptoEIP3009Payload,
) (*UptoEIP3009SettleArgs, error) {
	if payload == nil {
		return nil, fmt.Errorf("missing upto EIP-3009 payload")
	}
	if !common.IsHexAddress(requirements.Asset) ||
		!common.IsHexAddress(payload.Authorization.From) ||
		!common.IsHexAddress(payload.Authorization.To) ||
		!common.IsHexAddress(payload.PaymentInfo.PayTo) ||
		!common.IsHexAddress(payload.PaymentInfo.Settler) {
		return nil, fmt.Errorf("invalid address in upto EIP-3009 payload")
	}
	amount, ok := parseNonNegativeInteger(requirements.Amount)
	if !ok {
		return nil, fmt.Errorf("invalid settlement amount: %s", requirements.Amount)
	}
	value, ok := parseNonNegativeInteger(payload.Authorization.Value)
	if !ok {
		return nil, fmt.Errorf("invalid authorization value: %s", payload.Authorization.Value)
	}
	validAfter, ok := parseNonNegativeInteger(payload.Authorization.ValidAfter)
	if !ok {
		return nil, fmt.Errorf("invalid validAfter: %s", payload.Authorization.ValidAfter)
	}
	validBefore, ok := parseNonNegativeInteger(payload.Authorization.ValidBefore)
	if !ok {
		return nil, fmt.Errorf("invalid validBefore: %s", payload.Authorization.ValidBefore)
	}
	nonce, err := bytes32(payload.Authorization.Nonce, "nonce")
	if err != nil {
		return nil, err
	}
	salt, err := bytes32(payload.PaymentInfo.Salt, "salt")
	if err != nil {
		return nil, err
	}
	signature, err := evm.HexToBytes(payload.Signature)
	if err != nil || len(signature) == 0 {
		return nil, fmt.Errorf("invalid signature")
	}

	args := &UptoEIP3009SettleArgs{
		Token:     common.HexToAddress(requirements.Asset),
		Amount:    amount,
		Signature: signature,
	}
	args.Authorization.From = common.HexToAddress(payload.Authorization.From)
	args.Authorization.To = common.HexToAddress(payload.Authorization.To)
	args.Authorization.Value = value
	args.Authorization.ValidAfter = validAfter
	args.Authorization.ValidBefore = validBefore
	args.Authorization.Nonce = nonce
	args.PaymentInfo.PayTo = common.HexToAddress(payload.PaymentInfo.PayTo)
	args.PaymentInfo.Settler = common.HexToAddress(payload.PaymentInfo.Settler)
	args.PaymentInfo.Salt = salt
	return args, nil
}

// VerifyUptoEIP3009 verifies an upto ReceiveWithAuthorization payload.
func VerifyUptoEIP3009(
	ctx context.Context,
	signer evm.FacilitatorEvmSigner,
	payload types.PaymentPayload,
	requirements types.PaymentRequirements,
	eip3009Payload *evm.UptoEIP3009Payload,
	simulate bool,
) (*x402.VerifyResponse, error) {
	if eip3009Payload == nil {
		return nil, x402.NewVerifyError(ErrUptoInvalidPayload, "", "missing upto EIP-3009 payload")
	}
	payer := eip3009Payload.Authorization.From
	if signer == nil {
		return nil, x402.NewVerifyError(ErrUptoInvalidPayload, payer, "missing facilitator signer")
	}
	if payload.Accepted.Scheme != evm.SchemeUpto || requirements.Scheme != evm.SchemeUpto {
		return nil, x402.NewVerifyError(ErrUptoInvalidScheme, payer, "scheme mismatch")
	}
	if payload.Accepted.Network != requirements.Network {
		return nil, x402.NewVerifyError(ErrUptoNetworkMismatch, payer, "network mismatch")
	}
	assetTransferMethod, ok := requirements.Extra["assetTransferMethod"].(string)
	if !ok || assetTransferMethod != string(evm.AssetTransferMethodEIP3009) {
		return nil, x402.NewVerifyError(ErrUptoInvalidPayload, payer, "assetTransferMethod must be eip3009")
	}

	name, nameOK := requirements.Extra["name"].(string)
	version, versionOK := requirements.Extra["version"].(string)
	if !nameOK || name == "" || !versionOK || version == "" {
		return nil, x402.NewVerifyError(ErrUptoEIP3009MissingDomain, payer, "missing EIP-712 domain")
	}

	maximum, ok := parseNonNegativeInteger(eip3009Payload.Authorization.Value)
	if !ok {
		return nil, x402.NewVerifyError(ErrUptoInvalidPayload, payer, "invalid authorization value")
	}
	requiredMaximum, ok := parseNonNegativeInteger(requirements.Amount)
	if !ok {
		return nil, x402.NewVerifyError(ErrInvalidRequiredAmount, payer, "invalid required amount")
	}
	if !strings.EqualFold(eip3009Payload.Authorization.To, evm.X402UptoEIP3009ProxyAddress) {
		return nil, x402.NewVerifyError(ErrUptoEIP3009ReceiverMismatch, payer, "receiver mismatch")
	}
	if maximum.Cmp(requiredMaximum) != 0 {
		return nil, x402.NewVerifyError(ErrUptoEIP3009AmountMismatch, payer, "amount mismatch")
	}
	if !common.IsHexAddress(eip3009Payload.PaymentInfo.PayTo) ||
		!common.IsHexAddress(requirements.PayTo) ||
		!strings.EqualFold(eip3009Payload.PaymentInfo.PayTo, requirements.PayTo) {
		return nil, x402.NewVerifyError(ErrUptoEIP3009RecipientMismatch, payer, "recipient mismatch")
	}

	requiredSettler, settlerOK := requirements.Extra["settlerAddress"].(string)
	settler := eip3009Payload.PaymentInfo.Settler
	signerOwnsSettler := false
	for _, address := range signer.GetAddresses() {
		if common.IsHexAddress(address) && strings.EqualFold(address, settler) {
			signerOwnsSettler = true
			break
		}
	}
	if !settlerOK || !common.IsHexAddress(requiredSettler) || !common.IsHexAddress(settler) ||
		!strings.EqualFold(requiredSettler, settler) || !signerOwnsSettler {
		return nil, x402.NewVerifyError(ErrUptoEIP3009SettlerMismatch, payer, "settler mismatch")
	}

	expectedNonce, err := evm.CreateUptoEIP3009Nonce(
		eip3009Payload.PaymentInfo.PayTo,
		settler,
		eip3009Payload.PaymentInfo.Salt,
	)
	if err != nil {
		return nil, x402.NewVerifyError(ErrUptoInvalidPayload, payer, err.Error())
	}
	if !strings.EqualFold(eip3009Payload.Authorization.Nonce, expectedNonce) {
		return nil, x402.NewVerifyError(ErrUptoEIP3009NonceMismatch, payer, "nonce mismatch")
	}

	validAfter, ok := parseNonNegativeInteger(eip3009Payload.Authorization.ValidAfter)
	if !ok {
		return nil, x402.NewVerifyError(ErrUptoInvalidPayload, payer, "invalid validAfter")
	}
	validBefore, ok := parseNonNegativeInteger(eip3009Payload.Authorization.ValidBefore)
	if !ok {
		return nil, x402.NewVerifyError(ErrUptoInvalidPayload, payer, "invalid validBefore")
	}
	now := time.Now().Unix()
	if validBefore.Cmp(big.NewInt(now+evm.Permit2DeadlineBuffer)) < 0 {
		return nil, x402.NewVerifyError(ErrUptoEIP3009ValidBefore, payer, "validBefore expired")
	}
	if validAfter.Cmp(big.NewInt(now)) > 0 {
		return nil, x402.NewVerifyError(ErrUptoEIP3009ValidAfter, payer, "validAfter in future")
	}

	if !common.IsHexAddress(payer) || !common.IsHexAddress(requirements.Asset) {
		return nil, x402.NewVerifyError(ErrUptoInvalidPayload, payer, "invalid payer or asset address")
	}
	chainID, err := evm.GetEvmChainId(string(requirements.Network))
	if err != nil {
		return nil, x402.NewVerifyError(ErrUptoFailedToGetNetworkConfig, payer, err.Error())
	}
	message, err := evm.BuildReceiveAuthorizationMessage(eip3009Payload.Authorization)
	if err != nil {
		return nil, x402.NewVerifyError(ErrUptoInvalidPayload, payer, err.Error())
	}
	signature, err := evm.HexToBytes(eip3009Payload.Signature)
	if err != nil || len(signature) == 0 {
		return nil, x402.NewVerifyError(ErrInvalidSignatureFormat, payer, "invalid signature")
	}

	assetCheck := evm.StartAssetContractCheck(ctx, signer, string(requirements.Network), requirements.Asset)
	signatureValid, signatureErr := evm.VerifyTypedDataStrict(
		ctx,
		signer,
		common.HexToAddress(payer).Hex(),
		evm.TypedDataDomain{
			Name:              name,
			Version:           version,
			ChainID:           chainID,
			VerifyingContract: common.HexToAddress(requirements.Asset).Hex(),
		},
		evm.GetReceiveAuthorizationEIP712Types(),
		"ReceiveWithAuthorization",
		message,
		signature,
	)
	assetReason, assetErr := assetCheck.Await()
	if assetErr != nil {
		return nil, fmt.Errorf("asset contract check failed: %w", assetErr)
	}
	if assetReason != "" {
		return nil, x402.NewVerifyError(assetReason, payer, "asset is not a deployed contract")
	}
	if signatureErr != nil {
		return nil, x402.NewVerifyError(ErrUptoEIP3009SimulationFailed, payer, signatureErr.Error())
	}
	if !signatureValid {
		return nil, x402.NewVerifyError(ErrUptoEIP3009InvalidSignature, payer, "invalid signature")
	}

	token := common.HexToAddress(requirements.Asset).Hex()
	balanceResult, err := signer.ReadContract(
		ctx, token, evm.ERC20BalanceOfABI, "balanceOf", common.HexToAddress(payer),
	)
	if err != nil {
		return nil, x402.NewVerifyError(ErrUptoEIP3009SimulationFailed, payer, err.Error())
	}
	balance := bigIntResult(balanceResult)
	if balance == nil || balance.Cmp(maximum) < 0 {
		return nil, x402.NewVerifyError(ErrUptoEIP3009InsufficientBalance, payer, "insufficient balance")
	}
	nonce, err := bytes32(eip3009Payload.Authorization.Nonce, "nonce")
	if err != nil {
		return nil, x402.NewVerifyError(ErrUptoInvalidPayload, payer, err.Error())
	}
	authorizationState, err := signer.ReadContract(
		ctx, token, evm.AuthorizationStateABI, evm.FunctionAuthorizationState,
		common.HexToAddress(payer), nonce,
	)
	if err != nil {
		return nil, x402.NewVerifyError(ErrUptoEIP3009SimulationFailed, payer, err.Error())
	}
	used, ok := authorizationState.(bool)
	if !ok {
		return nil, x402.NewVerifyError(ErrUptoEIP3009SimulationFailed, payer, "invalid authorizationState result")
	}
	if used {
		return nil, x402.NewVerifyError(ErrUptoEIP3009NonceAlreadyUsed, payer, "authorization already used")
	}

	if simulate {
		simulationRequirements := requirements
		simulationRequirements.Amount = eip3009Payload.Authorization.Value
		args, err := BuildUptoEIP3009SettleArgs(simulationRequirements, eip3009Payload)
		if err != nil {
			return nil, x402.NewVerifyError(ErrUptoInvalidPayload, payer, err.Error())
		}
		if err := simulateUptoEIP3009Settle(ctx, signer, settler, args); err != nil {
			return nil, x402.NewVerifyError(ErrUptoEIP3009SimulationFailed, payer, err.Error())
		}
	}

	return &x402.VerifyResponse{IsValid: true, Payer: payer}, nil
}

// SettleUptoEIP3009 settles a nonzero actual amount through the canonical proxy.
func SettleUptoEIP3009(
	ctx context.Context,
	signer evm.FacilitatorEvmSigner,
	payload types.PaymentPayload,
	requirements types.PaymentRequirements,
	eip3009Payload *evm.UptoEIP3009Payload,
	facilCtx *x402.FacilitatorContext,
	store x402.PendingSettlementStore,
) (*x402.SettleResponse, error) {
	network := x402.Network(payload.Accepted.Network)
	if eip3009Payload == nil {
		return nil, x402.NewSettleError(ErrUptoInvalidPayload, "", network, "", "missing upto EIP-3009 payload")
	}
	payer := eip3009Payload.Authorization.From
	if signer == nil {
		return nil, x402.NewSettleError(ErrUptoInvalidPayload, payer, network, "", "missing facilitator signer")
	}
	actualAmount, ok := parseNonNegativeInteger(requirements.Amount)
	if !ok {
		return nil, x402.NewSettleError(ErrUptoInvalidPayload, payer, network, "", "invalid settlement amount")
	}

	pendingKey := eip3009Payload.Signature
	if store != nil && pendingKey != "" {
		rawRecord, found, getErr := store.Get(ctx, pendingKey)
		if getErr != nil {
			return nil, x402.NewSettleError(
				ErrUptoTransactionFailed, payer, network, "", getErr.Error(),
			)
		}
		if found {
			record, valid := parseUptoEIP3009PendingRecord(
				rawRecord, payload, requirements, eip3009Payload,
			)
			if !valid {
				return nil, x402.NewSettleError(
					ErrUptoPendingMismatch, payer, network, record.TxHash,
					"pending settlement fingerprint mismatch",
				)
			}
			return awaitUptoEIP3009Settlement(
				ctx, store, signer, pendingKey, record, false, payer, network, actualAmount.String(),
			)
		}
	}

	verifyRequirements := requirements
	verifyRequirements.Amount = eip3009Payload.Authorization.Value
	verifyResponse, err := VerifyUptoEIP3009(
		ctx, signer, payload, verifyRequirements, eip3009Payload, false,
	)
	if err != nil {
		var verifyErr *x402.VerifyError
		if errors.As(err, &verifyErr) {
			return nil, x402.NewSettleError(
				verifyErr.InvalidReason, verifyErr.Payer, network, "", verifyErr.InvalidMessage,
			)
		}
		return nil, x402.NewSettleError(ErrUptoVerificationFailed, payer, network, "", err.Error())
	}

	maximum, ok := parseNonNegativeInteger(eip3009Payload.Authorization.Value)
	if !ok {
		return nil, x402.NewSettleError(ErrUptoInvalidPayload, payer, network, "", "invalid authorization value")
	}
	if actualAmount.Cmp(maximum) > 0 {
		return nil, x402.NewSettleError(
			ErrUptoSettlementExceedsAmount, payer, network, "", "settlement exceeds authorized amount",
		)
	}
	if actualAmount.Sign() == 0 {
		return &x402.SettleResponse{
			Success: true, Transaction: "", Network: network, Payer: verifyResponse.Payer, Amount: "0",
		}, nil
	}

	args, err := BuildUptoEIP3009SettleArgs(requirements, eip3009Payload)
	if err != nil {
		return nil, x402.NewSettleError(ErrUptoInvalidPayload, payer, network, "", err.Error())
	}
	if err := simulateUptoEIP3009Settle(ctx, signer, eip3009Payload.PaymentInfo.Settler, args); err != nil {
		return nil, x402.NewSettleError(ErrUptoEIP3009SimulationFailed, payer, network, "", err.Error())
	}
	dataSuffix, err := evm.ResolveDataSuffix(
		facilCtx, evm.DataSuffixContext{Payload: payload, Requirements: requirements},
	)
	if err != nil {
		return nil, x402.NewSettleError(ErrUptoInvalidPayload, payer, network, "", err.Error())
	}

	txHash, err := writeUptoEIP3009Settle(
		ctx, signer, eip3009Payload.PaymentInfo.Settler, dataSuffix, args,
	)
	if err != nil {
		return nil, x402.NewSettleError(ErrUptoTransactionFailed, payer, network, "", err.Error())
	}
	record := newUptoEIP3009PendingRecord(txHash, payload, requirements, eip3009Payload)
	return awaitUptoEIP3009Settlement(
		ctx, store, signer, pendingKey, record, true, verifyResponse.Payer, network, actualAmount.String(),
	)
}

func simulateUptoEIP3009Settle(
	ctx context.Context,
	signer evm.FacilitatorEvmSigner,
	settler string,
	args *UptoEIP3009SettleArgs,
) error {
	callArgs := []interface{}{
		args.Token, args.Amount, args.Authorization, args.PaymentInfo, args.Signature,
	}
	if signerWithFrom, ok := signer.(evm.FacilitatorEvmSignerWithFrom); ok {
		_, err := signerWithFrom.ReadContractFrom(
			ctx, settler, evm.X402UptoEIP3009ProxyAddress,
			evm.X402UptoEIP3009ProxySettleABI, evm.FunctionSettle, callArgs...,
		)
		return err
	}
	addresses := signer.GetAddresses()
	if len(addresses) != 1 || !strings.EqualFold(addresses[0], settler) {
		return fmt.Errorf("signer cannot simulate from selected settler")
	}
	_, err := signer.ReadContract(
		ctx, evm.X402UptoEIP3009ProxyAddress,
		evm.X402UptoEIP3009ProxySettleABI, evm.FunctionSettle, callArgs...,
	)
	return err
}

func writeUptoEIP3009Settle(
	ctx context.Context,
	signer evm.FacilitatorEvmSigner,
	settler string,
	dataSuffix []byte,
	args *UptoEIP3009SettleArgs,
) (string, error) {
	callArgs := []interface{}{
		args.Token, args.Amount, args.Authorization, args.PaymentInfo, args.Signature,
	}
	if signerWithFrom, ok := signer.(evm.FacilitatorEvmSignerWithFrom); ok {
		return signerWithFrom.WriteContractFrom(
			ctx, settler, evm.X402UptoEIP3009ProxyAddress,
			evm.X402UptoEIP3009ProxySettleABI, evm.FunctionSettle, dataSuffix, callArgs...,
		)
	}
	addresses := signer.GetAddresses()
	if len(addresses) != 1 || !strings.EqualFold(addresses[0], settler) {
		return "", fmt.Errorf("signer cannot write from selected settler")
	}
	return signer.WriteContract(
		ctx, evm.X402UptoEIP3009ProxyAddress,
		evm.X402UptoEIP3009ProxySettleABI, evm.FunctionSettle, dataSuffix, callArgs...,
	)
}

func awaitUptoEIP3009Settlement(
	ctx context.Context,
	store x402.PendingSettlementStore,
	signer evm.FacilitatorEvmSigner,
	pendingKey string,
	record uptoEIP3009PendingRecord,
	persist bool,
	payer string,
	network x402.Network,
	amount string,
) (*x402.SettleResponse, error) {
	var persistErr error
	if persist {
		persistErr = storeUptoEIP3009PendingRecord(ctx, store, pendingKey, record)
	}
	if _, err := evm.WaitForSettleReceipt(
		ctx, signer, record.TxHash, payer, network,
		ErrUptoTransactionFailed, ErrUptoTransactionFailed,
	); err != nil {
		var settleErr *x402.SettleError
		if errors.As(err, &settleErr) && settleErr.ErrorReason == ErrSettlementPending {
			if persistErr != nil {
				return nil, x402.NewSettleError(
					ErrUptoTransactionFailed, payer, network, record.TxHash,
					fmt.Sprintf(
						"settlement_pending, but failed to persist for retry; manual reconciliation required: %s",
						persistErr,
					),
				)
			}
			return nil, err
		}
		deleteUptoEIP3009PendingRecord(ctx, store, pendingKey)
		return nil, err
	}
	deleteUptoEIP3009PendingRecord(ctx, store, pendingKey)
	return &x402.SettleResponse{
		Success: true, Transaction: record.TxHash, Network: network, Payer: payer, Amount: amount,
	}, nil
}

func newUptoEIP3009PendingRecord(
	txHash string,
	payload types.PaymentPayload,
	requirements types.PaymentRequirements,
	eip3009Payload *evm.UptoEIP3009Payload,
) uptoEIP3009PendingRecord {
	return uptoEIP3009PendingRecord{
		TxHash:  txHash,
		Network: string(payload.Accepted.Network),
		Amount:  requirements.Amount,
		Payer:   eip3009Payload.Authorization.From,
		Asset:   requirements.Asset,
		PayTo:   requirements.PayTo,
		Nonce:   eip3009Payload.Authorization.Nonce,
	}
}

func parseUptoEIP3009PendingRecord(
	raw string,
	payload types.PaymentPayload,
	requirements types.PaymentRequirements,
	eip3009Payload *evm.UptoEIP3009Payload,
) (uptoEIP3009PendingRecord, bool) {
	var stored uptoEIP3009PendingRecord
	if json.Unmarshal([]byte(raw), &stored) != nil {
		return stored, false
	}
	expected := newUptoEIP3009PendingRecord(stored.TxHash, payload, requirements, eip3009Payload)
	if !evm.IsValidTxHash(stored.TxHash) ||
		stored != expected ||
		string(requirements.Network) != stored.Network ||
		eip3009Payload.PaymentInfo.PayTo != stored.PayTo {
		return stored, false
	}
	return stored, true
}

func storeUptoEIP3009PendingRecord(
	ctx context.Context,
	store x402.PendingSettlementStore,
	pendingKey string,
	record uptoEIP3009PendingRecord,
) error {
	if store == nil || pendingKey == "" {
		return fmt.Errorf("pending settlement store unavailable")
	}
	encoded, err := json.Marshal(record)
	if err != nil {
		return err
	}
	return store.Set(ctx, pendingKey, string(encoded))
}

func deleteUptoEIP3009PendingRecord(
	ctx context.Context,
	store x402.PendingSettlementStore,
	pendingKey string,
) {
	if store != nil && pendingKey != "" {
		_ = store.Delete(ctx, pendingKey)
	}
}

func parseNonNegativeInteger(value string) (*big.Int, bool) {
	parsed, ok := new(big.Int).SetString(value, 10)
	return parsed, ok && parsed.Sign() >= 0
}

func bytes32(value, field string) ([32]byte, error) {
	var result [32]byte
	decoded, err := evm.HexToBytes(value)
	if err != nil {
		return result, fmt.Errorf("invalid %s: %w", field, err)
	}
	if len(decoded) != len(result) {
		return result, fmt.Errorf("invalid %s length: got %d bytes, want 32", field, len(decoded))
	}
	copy(result[:], decoded)
	return result, nil
}

func bigIntResult(value interface{}) *big.Int {
	switch typed := value.(type) {
	case *big.Int:
		return typed
	case big.Int:
		return &typed
	default:
		return nil
	}
}
