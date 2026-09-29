package facilitator

import (
	"context"
	"fmt"
	"math/big"
	"strings"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"

	"github.com/x402-foundation/x402/go/v2/mechanisms/evm"
	authcapture "github.com/x402-foundation/x402/go/v2/mechanisms/evm/auth-capture"
)

// asBigInt normalizes a go-ethereum ABI-decoded numeric result to *big.Int.
func asBigInt(value interface{}) *big.Int {
	switch v := value.(type) {
	case *big.Int:
		return v
	case big.Int:
		return &v
	default:
		return nil
	}
}

// packEscrowCalldata ABI-encodes a call against the AuthCaptureEscrow ABI matching deployment.
func packEscrowCalldata(deployment *authcapture.AuthCaptureDeployment, functionName string, args ...interface{}) ([]byte, error) {
	contractABI, err := abi.JSON(strings.NewReader(string(authcapture.EscrowABIForDeployment(deployment))))
	if err != nil {
		return nil, err
	}
	return contractABI.Pack(functionName, args...)
}

// simulateEscrowCall runs an AuthCaptureEscrow call via eth_call, transparently handling
// counterfactual (undeployed) smart-wallet payers by combining the factory deployment and
// the target call into a single Multicall3 aggregate so the deploy's state is visible to
// the target call within the same eth_call.
func simulateEscrowCall(
	ctx context.Context,
	signer evm.FacilitatorEvmSigner,
	deployment *authcapture.AuthCaptureDeployment,
	sigData *evm.ERC6492SignatureData,
	functionName string,
	args ...interface{},
) (bool, error) {
	if evm.HasEIP6492Deployment(sigData) {
		callData, err := packEscrowCalldata(deployment, functionName, args...)
		if err != nil {
			return false, err
		}
		results, err := evm.Multicall(ctx, signer, []evm.MulticallCall{
			{Address: common.BytesToAddress(sigData.Factory[:]).Hex(), CallData: sigData.FactoryCalldata},
			{Address: deployment.Escrow, CallData: callData},
		})
		if err != nil {
			return false, err
		}
		if len(results) < 2 {
			return false, nil
		}
		return results[1].Success(), nil
	}

	_, err := signer.ReadContract(ctx, deployment.Escrow, authcapture.EscrowABIForDeployment(deployment), functionName, args...)
	if err != nil {
		return false, err
	}
	return true, nil
}

// readPaymentState reads the escrow's paymentState(paymentInfoHash) for the single-use
// balance check that MUST run before relaying capture/void/refund. This is the
// security-critical anti-double-spend check for the "delegated" operator type: the
// facilitator has no other atomic guarantee that the payment's on-chain balance still
// matches what the client and operator agreed to when they signed.
func readPaymentState(
	ctx context.Context,
	signer evm.FacilitatorEvmSigner,
	deployment *authcapture.AuthCaptureDeployment,
	paymentInfoHashHex string,
) (hasCollectedPayment bool, capturableAmount *big.Int, refundableAmount *big.Int, err error) {
	hashBytes, err := evm.HexToBytes(paymentInfoHashHex)
	if err != nil {
		return false, nil, nil, fmt.Errorf("invalid paymentInfoHash: %w", err)
	}
	var hash32 [32]byte
	copy(hash32[:], hashBytes)

	result, err := signer.ReadContract(ctx, deployment.Escrow, authcapture.EscrowABIForDeployment(deployment), "paymentState", hash32)
	if err != nil {
		return false, nil, nil, err
	}
	outputs, ok := result.([]interface{})
	if !ok || len(outputs) != 3 {
		return false, nil, nil, fmt.Errorf("unexpected paymentState result shape")
	}
	hasCollectedPayment, _ = outputs[0].(bool)
	capturableAmount = asBigInt(outputs[1])
	refundableAmount = asBigInt(outputs[2])
	if capturableAmount == nil || refundableAmount == nil {
		return false, nil, nil, fmt.Errorf("unexpected paymentState amount types")
	}
	return hasCollectedPayment, capturableAmount, refundableAmount, nil
}

// parseAuthCaptureRevert maps AuthCaptureEscrow contract revert reasons to specific error codes.
func parseAuthCaptureRevert(err error) string {
	msg := err.Error()
	switch {
	case strings.Contains(msg, "PaymentAlreadyCollected"):
		return ErrPaymentAlreadyCollected
	case strings.Contains(msg, "TokenCollectionFailed"):
		return ErrTokenCollectionFailed
	case strings.Contains(msg, "InvalidCollector") || strings.Contains(msg, "InvalidSender"):
		return ErrCollector
	case strings.Contains(msg, "AmountOverflow"):
		return ErrAmountOverflow
	case strings.Contains(msg, "FeeBpsOverflow"):
		return ErrFeeBps
	case strings.Contains(msg, "InvalidFeeBps"):
		return ErrFeeBpsRange
	case strings.Contains(msg, "FeeBpsOutOfRange"):
		return ErrFeeBpsOutOfRange
	case strings.Contains(msg, "ZeroFeeReceiver"):
		return ErrZeroFeeReceiver
	case strings.Contains(msg, "InvalidFeeReceiver"):
		return ErrFeeReceiver
	case strings.Contains(msg, "InsufficientAuthorization"):
		return ErrInsufficientAuthorization
	case strings.Contains(msg, "ZeroAuthorization"):
		return ErrZeroAuthorization
	case strings.Contains(msg, "RefundExceedsCapture") || strings.Contains(msg, "RefundExceedsRefundableAmount"):
		return ErrRefundExceedsCapture
	case strings.Contains(msg, "AfterAuthorizationExpiry") || strings.Contains(msg, "AuthorizationExpired"):
		return ErrAuthorizationExpired
	case strings.Contains(msg, "BeforePreApprovalExpiry") || strings.Contains(msg, "AuthorizationNotYetValid"):
		return ErrAuthorizationNotYetValid
	case strings.Contains(msg, "insufficient balance") || strings.Contains(msg, "ERC20InsufficientBalance"):
		return ErrInsufficientBalance
	default:
		return ErrSimulationFailed
	}
}
