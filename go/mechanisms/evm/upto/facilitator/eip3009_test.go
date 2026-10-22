package facilitator

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/ethereum/go-ethereum/accounts/abi"

	x402 "github.com/x402-foundation/x402/go/v2"
	"github.com/x402-foundation/x402/go/v2/mechanisms/evm"
	"github.com/x402-foundation/x402/go/v2/types"
)

const (
	testEIP3009Salt = "0x3333333333333333333333333333333333333333333333333333333333333333"
)

func buildValidUptoEIP3009Payload(t *testing.T) *evm.UptoEIP3009Payload {
	t.Helper()
	nonce, err := evm.CreateUptoEIP3009Nonce(testPayToAddr, testFacilitatorAddr, testEIP3009Salt)
	if err != nil {
		t.Fatal(err)
	}
	return &evm.UptoEIP3009Payload{
		Signature: dummySig,
		Authorization: evm.UptoEIP3009Authorization{
			From:        testPayerAddr,
			To:          evm.X402UptoEIP3009ProxyAddress,
			Value:       testAmount,
			ValidAfter:  "0",
			ValidBefore: big.NewInt(time.Now().Unix() + 300).String(),
			Nonce:       nonce,
		},
		PaymentInfo: evm.UptoEIP3009PaymentInfo{
			PayTo: testPayToAddr, Settler: testFacilitatorAddr, Salt: testEIP3009Salt,
		},
	}
}

func buildUptoEIP3009Requirements(amount string) types.PaymentRequirements {
	return types.PaymentRequirements{
		Scheme:  evm.SchemeUpto,
		Network: testNetwork,
		Amount:  amount,
		Asset:   testTokenAddr,
		PayTo:   testPayToAddr,
		Extra: map[string]interface{}{
			"assetTransferMethod": string(evm.AssetTransferMethodEIP3009),
			"name":                "USDC",
			"version":             "2",
			"settlerAddress":      testFacilitatorAddr,
		},
	}
}

func buildUptoEIP3009PaymentPayload(t *testing.T, payload *evm.UptoEIP3009Payload) types.PaymentPayload {
	t.Helper()
	return types.PaymentPayload{
		X402Version: 2,
		Accepted: types.PaymentRequirements{
			Scheme: evm.SchemeUpto, Network: testNetwork,
		},
		Payload: payload.ToMap(),
	}
}

func newEIP3009MockSigner() *mockFacilitatorSigner {
	signer := newMockSigner()
	signer.verifyResult = true
	configureEIP3009Reads(signer, [4]byte{0x16, 0x26, 0xba, 0x7e}, big.NewInt(10_000_000), false)
	return signer
}

func configureEIP3009Reads(
	signer *mockFacilitatorSigner,
	signatureResult [4]byte,
	balance *big.Int,
	authorizationUsed bool,
) {
	signer.readContractFunc = func(_ string, functionName string, _ ...interface{}) (interface{}, error) {
		switch functionName {
		case "isValidSignature":
			return signatureResult[:], nil
		case "balanceOf":
			return balance, nil
		case evm.FunctionAuthorizationState:
			return authorizationUsed, nil
		case evm.FunctionSettle:
			return nil, nil
		default:
			return nil, errors.New("unexpected read")
		}
	}
}

func TestVerifyUptoEIP3009CanonicalChecksAndMaximumSimulation(t *testing.T) {
	evm.ResetAssetContractCache()
	signer := newEIP3009MockSigner()
	payload := buildValidUptoEIP3009Payload(t)

	response, err := VerifyUptoEIP3009(
		context.Background(),
		signer,
		buildUptoEIP3009PaymentPayload(t, payload),
		buildUptoEIP3009Requirements(testAmount),
		payload,
		true,
	)
	if err != nil {
		t.Fatalf("VerifyUptoEIP3009 failed: %v", err)
	}
	if !response.IsValid || response.Payer != testPayerAddr {
		t.Fatalf("unexpected verify response: %#v", response)
	}
	if signer.lastReadFrom != testFacilitatorAddr {
		t.Fatalf("simulation from mismatch: %s", signer.lastReadFrom)
	}
}

func TestBuildUptoEIP3009SettleArgsPacksCanonicalABI(t *testing.T) {
	payload := buildValidUptoEIP3009Payload(t)
	args, err := BuildUptoEIP3009SettleArgs(buildUptoEIP3009Requirements("400"), payload)
	if err != nil {
		t.Fatalf("BuildUptoEIP3009SettleArgs failed: %v", err)
	}
	proxyABI, err := abi.JSON(strings.NewReader(string(evm.X402UptoEIP3009ProxySettleABI)))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := proxyABI.Pack(
		evm.FunctionSettle,
		args.Token,
		args.Amount,
		args.Authorization,
		args.PaymentInfo,
		args.Signature,
	); err != nil {
		t.Fatalf("canonical settle arguments do not ABI-pack: %v", err)
	}
}

func TestUptoEIP3009ExportedHelpersRejectNilInputs(t *testing.T) {
	if _, err := BuildUptoEIP3009SettleArgs(buildUptoEIP3009Requirements("400"), nil); err == nil {
		t.Fatal("BuildUptoEIP3009SettleArgs should reject a nil payload")
	}

	paymentPayload := types.PaymentPayload{
		Accepted: types.PaymentRequirements{Scheme: evm.SchemeUpto, Network: testNetwork},
	}
	_, err := VerifyUptoEIP3009(
		context.Background(), newEIP3009MockSigner(), paymentPayload,
		buildUptoEIP3009Requirements(testAmount), nil, false,
	)
	assertVerifyError(t, err, ErrUptoInvalidPayload)

	_, err = SettleUptoEIP3009(
		context.Background(), newEIP3009MockSigner(), paymentPayload,
		buildUptoEIP3009Requirements("400"), nil, nil,
		x402.NewInMemoryPendingSettlementStore(),
	)
	assertSettleError(t, err, ErrUptoInvalidPayload)

	validPayload := buildValidUptoEIP3009Payload(t)
	paymentPayload = buildUptoEIP3009PaymentPayload(t, validPayload)
	_, err = VerifyUptoEIP3009(
		context.Background(), nil, paymentPayload,
		buildUptoEIP3009Requirements(testAmount), validPayload, false,
	)
	assertVerifyError(t, err, ErrUptoInvalidPayload)

	_, err = SettleUptoEIP3009(
		context.Background(), nil, paymentPayload,
		buildUptoEIP3009Requirements("400"), validPayload, nil,
		x402.NewInMemoryPendingSettlementStore(),
	)
	assertSettleError(t, err, ErrUptoInvalidPayload)
}

func TestVerifyUptoEIP3009StrictDelegateRejectsOwnerSignature(t *testing.T) {
	signer := newEIP3009MockSigner()
	signer.verifyResult = true // The removed signer.VerifyTypedData path would accept.
	signer.getCodeResult = append([]byte{0xef, 0x01, 0x00}, make([]byte, 20)...)
	configureEIP3009Reads(
		signer,
		[4]byte{0xff, 0xff, 0xff, 0xff},
		big.NewInt(10_000_000),
		false,
	)
	payload := buildValidUptoEIP3009Payload(t)

	_, err := VerifyUptoEIP3009(
		context.Background(), signer,
		buildUptoEIP3009PaymentPayload(t, payload),
		buildUptoEIP3009Requirements(testAmount),
		payload,
		false,
	)
	assertVerifyError(t, err, ErrUptoEIP3009InvalidSignature)
}

func TestVerifyUptoEIP3009RequiresExplicitAssetTransferMethod(t *testing.T) {
	for _, method := range []interface{}{nil, "permit2", 3009} {
		t.Run(fmt.Sprint(method), func(t *testing.T) {
			signer := newEIP3009MockSigner()
			payload := buildValidUptoEIP3009Payload(t)
			requirements := buildUptoEIP3009Requirements(testAmount)
			if method == nil {
				delete(requirements.Extra, "assetTransferMethod")
			} else {
				requirements.Extra["assetTransferMethod"] = method
			}

			_, err := VerifyUptoEIP3009(
				context.Background(), signer,
				buildUptoEIP3009PaymentPayload(t, payload), requirements, payload, false,
			)
			assertVerifyError(t, err, ErrUptoInvalidPayload)
		})
	}
}

func TestVerifyUptoEIP3009RejectsCanonicalMismatches(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*evm.UptoEIP3009Payload, *types.PaymentRequirements)
		reason string
	}{
		{
			name: "proxy",
			mutate: func(payload *evm.UptoEIP3009Payload, _ *types.PaymentRequirements) {
				payload.Authorization.To = testPayToAddr
			},
			reason: ErrUptoEIP3009ReceiverMismatch,
		},
		{
			name: "maximum",
			mutate: func(payload *evm.UptoEIP3009Payload, _ *types.PaymentRequirements) {
				payload.Authorization.Value = "999"
			},
			reason: ErrUptoEIP3009AmountMismatch,
		},
		{
			name: "malformed maximum",
			mutate: func(payload *evm.UptoEIP3009Payload, _ *types.PaymentRequirements) {
				payload.Authorization.Value = "not-a-number"
			},
			reason: ErrUptoInvalidPayload,
		},
		{
			name: "malformed payer address",
			mutate: func(payload *evm.UptoEIP3009Payload, _ *types.PaymentRequirements) {
				payload.Authorization.From = "not-an-address"
			},
			reason: ErrUptoInvalidPayload,
		},
		{
			name: "payTo",
			mutate: func(payload *evm.UptoEIP3009Payload, _ *types.PaymentRequirements) {
				payload.PaymentInfo.PayTo = testPayerAddr
			},
			reason: ErrUptoEIP3009RecipientMismatch,
		},
		{
			name: "required settler",
			mutate: func(_ *evm.UptoEIP3009Payload, requirements *types.PaymentRequirements) {
				requirements.Extra["settlerAddress"] = testPayerAddr
			},
			reason: ErrUptoEIP3009SettlerMismatch,
		},
		{
			name: "settler signer membership",
			mutate: func(payload *evm.UptoEIP3009Payload, requirements *types.PaymentRequirements) {
				payload.PaymentInfo.Settler = testPayerAddr
				requirements.Extra["settlerAddress"] = testPayerAddr
			},
			reason: ErrUptoEIP3009SettlerMismatch,
		},
		{
			name: "nonce",
			mutate: func(payload *evm.UptoEIP3009Payload, _ *types.PaymentRequirements) {
				payload.Authorization.Nonce = "0x0000000000000000000000000000000000000000000000000000000000000000"
			},
			reason: ErrUptoEIP3009NonceMismatch,
		},
		{
			name: "validBefore",
			mutate: func(payload *evm.UptoEIP3009Payload, _ *types.PaymentRequirements) {
				payload.Authorization.ValidBefore = big.NewInt(time.Now().Unix()).String()
			},
			reason: ErrUptoEIP3009ValidBefore,
		},
		{
			name: "validAfter",
			mutate: func(payload *evm.UptoEIP3009Payload, _ *types.PaymentRequirements) {
				payload.Authorization.ValidAfter = big.NewInt(time.Now().Unix() + 60).String()
			},
			reason: ErrUptoEIP3009ValidAfter,
		},
		{
			name: "domain",
			mutate: func(_ *evm.UptoEIP3009Payload, requirements *types.PaymentRequirements) {
				delete(requirements.Extra, "name")
			},
			reason: ErrUptoEIP3009MissingDomain,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			signer := newEIP3009MockSigner()
			payload := buildValidUptoEIP3009Payload(t)
			requirements := buildUptoEIP3009Requirements(testAmount)
			test.mutate(payload, &requirements)
			_, err := VerifyUptoEIP3009(
				context.Background(), signer,
				buildUptoEIP3009PaymentPayload(t, payload), requirements, payload, false,
			)
			assertVerifyError(t, err, test.reason)
		})
	}
}

func TestVerifyUptoEIP3009RejectsSignatureBalanceAndUsedAuthorization(t *testing.T) {
	tests := []struct {
		name   string
		setup  func(*mockFacilitatorSigner)
		reason string
	}{
		{
			name: "signature",
			setup: func(signer *mockFacilitatorSigner) {
				configureEIP3009Reads(
					signer, [4]byte{0xff, 0xff, 0xff, 0xff}, big.NewInt(10_000_000), false,
				)
			},
			reason: ErrUptoEIP3009InvalidSignature,
		},
		{
			name: "balance",
			setup: func(signer *mockFacilitatorSigner) {
				configureEIP3009Reads(
					signer, [4]byte{0x16, 0x26, 0xba, 0x7e}, big.NewInt(999), false,
				)
			},
			reason: ErrUptoEIP3009InsufficientBalance,
		},
		{
			name: "used authorization",
			setup: func(signer *mockFacilitatorSigner) {
				configureEIP3009Reads(
					signer, [4]byte{0x16, 0x26, 0xba, 0x7e}, big.NewInt(10_000), true,
				)
			},
			reason: ErrUptoEIP3009NonceAlreadyUsed,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			evm.ResetAssetContractCache()
			signer := newEIP3009MockSigner()
			test.setup(signer)
			payload := buildValidUptoEIP3009Payload(t)
			_, err := VerifyUptoEIP3009(
				context.Background(), signer,
				buildUptoEIP3009PaymentPayload(t, payload),
				buildUptoEIP3009Requirements(testAmount),
				payload,
				false,
			)
			assertVerifyError(t, err, test.reason)
		})
	}
}

type fixedDataSuffixExtension struct {
	suffix []byte
}

func (f fixedDataSuffixExtension) Key() string { return evm.BuilderCodeKey }
func (f fixedDataSuffixExtension) BuildDataSuffix(evm.DataSuffixContext) ([]byte, error) {
	return f.suffix, nil
}

type failingPendingStore struct {
	*x402.InMemoryPendingSettlementStore
	getErr error
	setErr error
}

func (s *failingPendingStore) Get(ctx context.Context, key string) (string, bool, error) {
	if s.getErr != nil {
		return "", false, s.getErr
	}
	return s.InMemoryPendingSettlementStore.Get(ctx, key)
}

func (s *failingPendingStore) Set(ctx context.Context, key, value string) error {
	if s.setErr != nil {
		return s.setErr
	}
	return s.InMemoryPendingSettlementStore.Set(ctx, key, value)
}

func TestSettleUptoEIP3009UsesActualAmountSuffixAndSelectedSettler(t *testing.T) {
	evm.ResetAssetContractCache()
	signer := newEIP3009MockSigner()
	payload := buildValidUptoEIP3009Payload(t)
	fctx := x402.NewFacilitatorContext(map[string]x402.FacilitatorExtension{
		evm.BuilderCodeKey: fixedDataSuffixExtension{suffix: []byte{0xde, 0xad}},
	})
	store := x402.NewInMemoryPendingSettlementStore()

	response, err := SettleUptoEIP3009(
		context.Background(),
		signer,
		buildUptoEIP3009PaymentPayload(t, payload),
		buildUptoEIP3009Requirements("400"),
		payload,
		fctx,
		store,
	)
	if err != nil {
		t.Fatalf("SettleUptoEIP3009 failed: %v", err)
	}
	if !response.Success || response.Amount != "400" {
		t.Fatalf("unexpected response: %#v", response)
	}
	if signer.lastWriteFrom != testFacilitatorAddr ||
		signer.lastWriteAddress != evm.X402UptoEIP3009ProxyAddress ||
		signer.lastWriteFunction != evm.FunctionSettle {
		t.Fatalf("unexpected write: from=%s address=%s function=%s",
			signer.lastWriteFrom, signer.lastWriteAddress, signer.lastWriteFunction)
	}
	if !bytes.Equal(signer.lastWriteDataSuffix, []byte{0xde, 0xad}) {
		t.Fatalf("data suffix mismatch: %x", signer.lastWriteDataSuffix)
	}
	if amount, ok := signer.lastWriteArgs[1].(*big.Int); !ok || amount.String() != "400" {
		t.Fatalf("actual settlement amount mismatch: %#v", signer.lastWriteArgs[1])
	}
	if signer.lastReadFrom != testFacilitatorAddr ||
		signer.lastReadAddress != evm.X402UptoEIP3009ProxyAddress ||
		signer.lastReadFunction != evm.FunctionSettle {
		t.Fatalf("unexpected simulation: from=%s address=%s function=%s",
			signer.lastReadFrom, signer.lastReadAddress, signer.lastReadFunction)
	}
	if amount, ok := signer.lastReadArgs[1].(*big.Int); !ok || amount.String() != "400" {
		t.Fatalf("actual simulation amount mismatch: %#v", signer.lastReadArgs[1])
	}
	if entries := store.Entries(); len(entries) != 0 {
		t.Fatalf("terminal success must clean pending metadata, got %v", entries)
	}
}

func TestSettleUptoEIP3009RejectsActualAmountSimulationFailure(t *testing.T) {
	evm.ResetAssetContractCache()
	signer := newEIP3009MockSigner()
	payload := buildValidUptoEIP3009Payload(t)
	baseRead := signer.readContractFunc
	signer.readContractFunc = func(address string, functionName string, args ...interface{}) (interface{}, error) {
		if functionName == evm.FunctionSettle {
			return nil, errors.New("refund blocked")
		}
		return baseRead(address, functionName, args...)
	}

	_, err := SettleUptoEIP3009(
		context.Background(),
		signer,
		buildUptoEIP3009PaymentPayload(t, payload),
		buildUptoEIP3009Requirements("400"),
		payload,
		nil,
		x402.NewInMemoryPendingSettlementStore(),
	)

	assertSettleError(t, err, ErrUptoEIP3009SimulationFailed)
	if signer.writeContractCalls != 0 {
		t.Fatal("must not broadcast after actual-amount simulation failure")
	}
}

func TestSettleUptoEIP3009ZeroExcessAndPendingReconciliation(t *testing.T) {
	t.Run("zero skips write", func(t *testing.T) {
		signer := newEIP3009MockSigner()
		payload := buildValidUptoEIP3009Payload(t)
		response, err := SettleUptoEIP3009(
			context.Background(), signer, buildUptoEIP3009PaymentPayload(t, payload),
			buildUptoEIP3009Requirements("0"), payload, nil,
			x402.NewInMemoryPendingSettlementStore(),
		)
		if err != nil || !response.Success || response.Amount != "0" || signer.writeContractCalls != 0 {
			t.Fatalf("unexpected zero settlement: response=%#v writes=%d err=%v", response, signer.writeContractCalls, err)
		}
	})

	t.Run("actual above maximum rejected", func(t *testing.T) {
		signer := newEIP3009MockSigner()
		payload := buildValidUptoEIP3009Payload(t)
		_, err := SettleUptoEIP3009(
			context.Background(), signer, buildUptoEIP3009PaymentPayload(t, payload),
			buildUptoEIP3009Requirements("1001"), payload, nil,
			x402.NewInMemoryPendingSettlementStore(),
		)
		assertSettleError(t, err, ErrUptoSettlementExceedsAmount)
		if signer.writeContractCalls != 0 {
			t.Fatal("must not write above the maximum")
		}
	})

	t.Run("terminal receipt failure cleans metadata", func(t *testing.T) {
		signer := newEIP3009MockSigner()
		signer.receiptResult = &evm.TransactionReceipt{
			Status: evm.TxStatusFailed,
			TxHash: signer.writeContractTx,
		}
		payload := buildValidUptoEIP3009Payload(t)
		store := x402.NewInMemoryPendingSettlementStore()
		_, err := SettleUptoEIP3009(
			context.Background(), signer, buildUptoEIP3009PaymentPayload(t, payload),
			buildUptoEIP3009Requirements("400"), payload, nil, store,
		)
		assertSettleError(t, err, ErrUptoTransactionFailed)
		if entries := store.Entries(); len(entries) != 0 {
			t.Fatalf("terminal receipt failure must clean pending state, got %v", entries)
		}
	})

	t.Run("pending signature key reconciles without write", func(t *testing.T) {
		signer := newEIP3009MockSigner()
		payload := buildValidUptoEIP3009Payload(t)
		store := x402.NewInMemoryPendingSettlementStore()
		signer.receiptError = errors.New("receipt timeout")
		_, err := SettleUptoEIP3009(
			context.Background(), signer, buildUptoEIP3009PaymentPayload(t, payload),
			buildUptoEIP3009Requirements("400"), payload, nil, store,
		)
		assertSettleError(t, err, ErrSettlementPending)
		entries := store.Entries()
		if len(entries) != 1 {
			t.Fatalf("settlement_pending must retain one atomic record, got %v", entries)
		}
		var record uptoEIP3009PendingRecord
		if err := json.Unmarshal([]byte(entries[payload.Signature]), &record); err != nil {
			t.Fatalf("pending value must be JSON: %v", err)
		}
		if record.TxHash != signer.writeContractTx ||
			record.Amount != "400" ||
			record.Network != testNetwork ||
			record.Payer != testPayerAddr ||
			record.Asset != testTokenAddr ||
			record.PayTo != testPayToAddr ||
			record.Nonce != payload.Authorization.Nonce {
			t.Fatalf("unexpected pending fingerprint: %#v", record)
		}

		signer.receiptError = nil
		response, err := SettleUptoEIP3009(
			context.Background(), signer, buildUptoEIP3009PaymentPayload(t, payload),
			buildUptoEIP3009Requirements("400"), payload, nil, store,
		)
		if err != nil || !response.Success || response.Transaction != signer.writeContractTx {
			t.Fatalf("unexpected reconciliation: response=%#v err=%v", response, err)
		}
		if signer.writeContractCalls != 1 {
			t.Fatal("pending reconciliation must not rebroadcast")
		}
		if entries := store.Entries(); len(entries) != 0 {
			t.Fatalf("reconciled success must clean pending state, got %v", entries)
		}
	})

	t.Run("record persistence failure requires manual reconciliation", func(t *testing.T) {
		signer := newEIP3009MockSigner()
		signer.receiptError = errors.New("receipt timeout")
		payload := buildValidUptoEIP3009Payload(t)
		store := &failingPendingStore{
			InMemoryPendingSettlementStore: x402.NewInMemoryPendingSettlementStore(),
			setErr:                         errors.New("record storage unavailable"),
		}

		_, err := SettleUptoEIP3009(
			context.Background(), signer, buildUptoEIP3009PaymentPayload(t, payload),
			buildUptoEIP3009Requirements("400"), payload, nil, store,
		)
		assertSettleError(t, err, ErrUptoTransactionFailed)
		var settleErr *x402.SettleError
		if !errors.As(err, &settleErr) || settleErr.Transaction != signer.writeContractTx {
			t.Fatalf("manual reconciliation error must preserve tx hash %s, got %v", signer.writeContractTx, err)
		}
		if !strings.Contains(err.Error(), "settlement_pending") ||
			!strings.Contains(err.Error(), "manual reconciliation required") {
			t.Fatalf("expected explicit settlement_pending manual reconciliation message, got %v", err)
		}
		if entries := store.Entries(); len(entries) != 0 {
			t.Fatalf("failed atomic record write must leave no retryable state, got %v", entries)
		}
	})

	t.Run("record read failure returns before verification or broadcast", func(t *testing.T) {
		signer := newEIP3009MockSigner()
		signer.getCodeError = errors.New("verification should not run")
		payload := buildValidUptoEIP3009Payload(t)
		store := &failingPendingStore{
			InMemoryPendingSettlementStore: x402.NewInMemoryPendingSettlementStore(),
			getErr:                         errors.New("record read unavailable"),
		}

		_, err := SettleUptoEIP3009(
			context.Background(), signer, buildUptoEIP3009PaymentPayload(t, payload),
			buildUptoEIP3009Requirements("400"), payload, nil, store,
		)
		assertSettleError(t, err, ErrUptoTransactionFailed)
		if !strings.Contains(err.Error(), "record read unavailable") {
			t.Fatalf("expected pending store read error, got %v", err)
		}
		if signer.writeContractCalls != 0 {
			t.Fatalf("store.Get failure must return before broadcast, writes=%d", signer.writeContractCalls)
		}
	})
}

func TestSettleUptoEIP3009PendingFingerprintMismatchPreservesState(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*types.PaymentPayload, *types.PaymentRequirements, *evm.UptoEIP3009Payload)
	}{
		{
			name: "amount",
			mutate: func(_ *types.PaymentPayload, requirements *types.PaymentRequirements, _ *evm.UptoEIP3009Payload) {
				requirements.Amount = "401"
			},
		},
		{
			name: "network",
			mutate: func(paymentPayload *types.PaymentPayload, requirements *types.PaymentRequirements, _ *evm.UptoEIP3009Payload) {
				paymentPayload.Accepted.Network = "eip155:1"
				requirements.Network = "eip155:1"
			},
		},
		{
			name: "accepted network",
			mutate: func(paymentPayload *types.PaymentPayload, _ *types.PaymentRequirements, _ *evm.UptoEIP3009Payload) {
				paymentPayload.Accepted.Network = "eip155:1"
			},
		},
		{
			name: "payer",
			mutate: func(_ *types.PaymentPayload, _ *types.PaymentRequirements, eip3009Payload *evm.UptoEIP3009Payload) {
				eip3009Payload.Authorization.From = testPayToAddr
			},
		},
		{
			name: "asset",
			mutate: func(_ *types.PaymentPayload, requirements *types.PaymentRequirements, _ *evm.UptoEIP3009Payload) {
				requirements.Asset = testPayerAddr
			},
		},
		{
			name: "payTo",
			mutate: func(_ *types.PaymentPayload, requirements *types.PaymentRequirements, eip3009Payload *evm.UptoEIP3009Payload) {
				requirements.PayTo = testPayerAddr
				eip3009Payload.PaymentInfo.PayTo = testPayerAddr
			},
		},
		{
			name: "required payTo",
			mutate: func(_ *types.PaymentPayload, requirements *types.PaymentRequirements, _ *evm.UptoEIP3009Payload) {
				requirements.PayTo = testPayerAddr
			},
		},
		{
			name: "payload payTo",
			mutate: func(_ *types.PaymentPayload, _ *types.PaymentRequirements, eip3009Payload *evm.UptoEIP3009Payload) {
				eip3009Payload.PaymentInfo.PayTo = testPayerAddr
			},
		},
		{
			name: "nonce",
			mutate: func(_ *types.PaymentPayload, _ *types.PaymentRequirements, eip3009Payload *evm.UptoEIP3009Payload) {
				eip3009Payload.Authorization.Nonce = "0x" + strings.Repeat("00", 32)
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			signer := newEIP3009MockSigner()
			eip3009Payload := buildValidUptoEIP3009Payload(t)
			paymentPayload := buildUptoEIP3009PaymentPayload(t, eip3009Payload)
			requirements := buildUptoEIP3009Requirements("400")
			store := x402.NewInMemoryPendingSettlementStore()
			signer.receiptError = errors.New("receipt timeout")

			_, err := SettleUptoEIP3009(
				context.Background(), signer, paymentPayload, requirements,
				eip3009Payload, nil, store,
			)
			assertSettleError(t, err, ErrSettlementPending)
			before := store.Entries()
			if len(before) != 1 {
				t.Fatalf("expected one atomic pending record, got %v", before)
			}

			signer.receiptError = nil
			test.mutate(&paymentPayload, &requirements, eip3009Payload)
			_, err = SettleUptoEIP3009(
				context.Background(), signer, paymentPayload, requirements,
				eip3009Payload, nil, store,
			)
			assertSettleError(t, err, ErrUptoPendingMismatch)
			after := store.Entries()
			if !reflect.DeepEqual(after, before) {
				t.Fatalf("pending mismatch must preserve pending state: before=%v after=%v", before, after)
			}
			if signer.writeContractCalls != 1 {
				t.Fatalf("pending mismatch must not rebroadcast, writes=%d", signer.writeContractCalls)
			}
		})
	}
}
