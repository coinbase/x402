package client

import (
	"context"
	"fmt"
	"time"

	"github.com/ethereum/go-ethereum/common"

	"github.com/x402-foundation/x402/go/v2/mechanisms/evm"
	"github.com/x402-foundation/x402/go/v2/types"
)

// CreateUptoEIP3009Payload creates an explicit ReceiveWithAuthorization
// payload for the canonical upto ERC-3009 proxy.
func CreateUptoEIP3009Payload(
	ctx context.Context,
	signer evm.ClientEvmSigner,
	requirements types.PaymentRequirements,
) (types.PaymentPayload, error) {
	name, nameOK := requirements.Extra["name"].(string)
	version, versionOK := requirements.Extra["version"].(string)
	if !nameOK || name == "" || !versionOK || version == "" {
		return types.PaymentPayload{}, fmt.Errorf(
			"EIP-712 domain parameters (name, version) are required in payment requirements for asset %s",
			requirements.Asset,
		)
	}
	settlerAddress, ok := requirements.Extra["settlerAddress"].(string)
	if !ok || settlerAddress == "" {
		return types.PaymentPayload{}, fmt.Errorf(
			"upto eip3009 requires settlerAddress in paymentRequirements.extra; " +
				"ensure the server is configured with an upto facilitator that provides getExtra()",
		)
	}
	if !common.IsHexAddress(signer.Address()) ||
		!common.IsHexAddress(requirements.Asset) ||
		!common.IsHexAddress(requirements.PayTo) ||
		!common.IsHexAddress(settlerAddress) {
		return types.PaymentPayload{}, fmt.Errorf("invalid address in upto eip3009 payment requirements")
	}

	chainID, err := evm.GetEvmChainId(string(requirements.Network))
	if err != nil {
		return types.PaymentPayload{}, err
	}
	salt, err := evm.CreateNonce()
	if err != nil {
		return types.PaymentPayload{}, err
	}
	payTo := common.HexToAddress(requirements.PayTo).Hex()
	settler := common.HexToAddress(settlerAddress).Hex()
	nonce, err := evm.CreateUptoEIP3009Nonce(payTo, settler, salt)
	if err != nil {
		return types.PaymentPayload{}, err
	}

	validAfter := "0"
	validBeforeUnix := time.Now().Unix() + int64(requirements.MaxTimeoutSeconds)
	if validBeforeUnix <= 0 {
		return types.PaymentPayload{}, fmt.Errorf("invalid time window: validBefore must be after validAfter")
	}
	validBefore := fmt.Sprintf("%d", validBeforeUnix)
	authorization := evm.UptoEIP3009Authorization{
		From:        common.HexToAddress(signer.Address()).Hex(),
		To:          evm.X402UptoEIP3009ProxyAddress,
		Value:       requirements.Amount,
		ValidAfter:  validAfter,
		ValidBefore: validBefore,
		Nonce:       nonce,
	}
	message, err := evm.BuildReceiveAuthorizationMessage(authorization)
	if err != nil {
		return types.PaymentPayload{}, err
	}

	signature, err := signer.SignTypedData(
		ctx,
		evm.TypedDataDomain{
			Name:              name,
			Version:           version,
			ChainID:           chainID,
			VerifyingContract: common.HexToAddress(requirements.Asset).Hex(),
		},
		evm.GetReceiveAuthorizationEIP712Types(),
		"ReceiveWithAuthorization",
		message,
	)
	if err != nil {
		return types.PaymentPayload{}, fmt.Errorf("failed to sign upto eip3009 authorization: %w", err)
	}

	result := &evm.UptoEIP3009Payload{
		Signature:     evm.BytesToHex(signature),
		Authorization: authorization,
		PaymentInfo: evm.UptoEIP3009PaymentInfo{
			PayTo: payTo, Settler: settler, Salt: salt,
		},
	}
	return types.PaymentPayload{X402Version: 2, Payload: result.ToMap()}, nil
}
