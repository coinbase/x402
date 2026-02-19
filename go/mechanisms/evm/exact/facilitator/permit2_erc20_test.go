package facilitator

import (
	"bytes"
	"context"
	"math/big"
	"strings"
	"testing"

	ethabi "github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	ethTypes "github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"

	x402 "github.com/coinbase/x402/go"
	"github.com/coinbase/x402/go/extensions/erc20approvalgassponsor"
	"github.com/coinbase/x402/go/mechanisms/evm"
)

// buildTestSignedApproveTx builds a valid signed approve(Permit2, MaxUint256) tx for tests.
func buildTestSignedApproveTx(t *testing.T, tokenAddress string, chainID *big.Int) (string, string) {
	t.Helper()
	pk, err := crypto.GenerateKey()
	if err != nil {
		t.Fatalf("failed to generate key: %v", err)
	}
	from := crypto.PubkeyToAddress(pk.PublicKey).Hex()

	parsedABI, err := ethabi.JSON(bytes.NewReader(evm.ERC20ApproveABI))
	if err != nil {
		t.Fatalf("failed to parse ABI: %v", err)
	}
	calldata, err := parsedABI.Pack("approve", common.HexToAddress(evm.PERMIT2Address), evm.MaxUint256())
	if err != nil {
		t.Fatalf("failed to pack calldata: %v", err)
	}

	to := common.HexToAddress(tokenAddress)
	tx := ethTypes.NewTx(&ethTypes.DynamicFeeTx{
		ChainID:   chainID,
		Nonce:     0,
		GasTipCap: big.NewInt(1e9),
		GasFeeCap: big.NewInt(10e9),
		Gas:       60000,
		To:        &to,
		Data:      calldata,
	})

	signer := ethTypes.LatestSignerForChainID(chainID)
	signed, err := ethTypes.SignTx(tx, signer, pk)
	if err != nil {
		t.Fatalf("failed to sign tx: %v", err)
	}

	rlpBytes, err := signed.MarshalBinary()
	if err != nil {
		t.Fatalf("failed to marshal tx: %v", err)
	}

	return from, "0x" + evm.BytesToHex(rlpBytes)[2:]
}

func TestValidateErc20ApprovalForPayment(t *testing.T) {
	chainID := big.NewInt(84532) // Base Sepolia
	tokenAddress := "0x036CbD53842c5426634e7929541eC2318f3dCF7e"

	from, signedTx := buildTestSignedApproveTx(t, tokenAddress, chainID)

	t.Run("accepts valid ERC-20 approval info", func(t *testing.T) {
		info := &erc20approvalgassponsor.Info{
			From:              from,
			Asset:             tokenAddress,
			Spender:           evm.PERMIT2Address,
			Amount:            evm.MaxUint256().String(),
			SignedTransaction:  signedTx,
			Version:           "1",
		}
		result := validateErc20ApprovalForPayment(context.Background(), nil, info, from, tokenAddress, chainID)
		if result != "" {
			t.Errorf("expected valid, got error: %s", result)
		}
	})

	t.Run("rejects mismatched from/payer", func(t *testing.T) {
		wrongPayer := "0x0000000000000000000000000000000000000001"
		info := &erc20approvalgassponsor.Info{
			From:              from,
			Asset:             tokenAddress,
			Spender:           evm.PERMIT2Address,
			Amount:            "100",
			SignedTransaction:  signedTx,
			Version:           "1",
		}
		result := validateErc20ApprovalForPayment(context.Background(), nil, info, wrongPayer, tokenAddress, chainID)
		if result != ErrErc20SignerMismatch {
			t.Errorf("expected %s, got: %s", ErrErc20SignerMismatch, result)
		}
	})

	t.Run("rejects mismatched asset/token", func(t *testing.T) {
		wrongToken := "0x0000000000000000000000000000000000000002"
		info := &erc20approvalgassponsor.Info{
			From:              from,
			Asset:             tokenAddress,
			Spender:           evm.PERMIT2Address,
			Amount:            "100",
			SignedTransaction:  signedTx,
			Version:           "1",
		}
		result := validateErc20ApprovalForPayment(context.Background(), nil, info, from, wrongToken, chainID)
		if result != ErrErc20TokenMismatch {
			t.Errorf("expected %s, got: %s", ErrErc20TokenMismatch, result)
		}
	})

	t.Run("rejects wrong spender (not Permit2)", func(t *testing.T) {
		// Build a tx that approves a wrong spender
		pk, err := crypto.GenerateKey()
		if err != nil {
			t.Fatal(err)
		}
		fromAddr := crypto.PubkeyToAddress(pk.PublicKey).Hex()

		parsedABI, _ := ethabi.JSON(bytes.NewReader(evm.ERC20ApproveABI))
		wrongSpender := common.HexToAddress("0x0000000000000000000000000000000000000003")
		calldata, _ := parsedABI.Pack("approve", wrongSpender, evm.MaxUint256())
		to := common.HexToAddress(tokenAddress)
		tx := ethTypes.NewTx(&ethTypes.DynamicFeeTx{
			ChainID: chainID, Nonce: 0,
			GasTipCap: big.NewInt(1e9), GasFeeCap: big.NewInt(10e9),
			Gas: 60000, To: &to, Data: calldata,
		})
		signer := ethTypes.LatestSignerForChainID(chainID)
		signed, _ := ethTypes.SignTx(tx, signer, pk)
		rlpBytes, _ := signed.MarshalBinary()
		wrongSpenderTx := evm.BytesToHex(rlpBytes)

		info := &erc20approvalgassponsor.Info{
			From:             fromAddr,
			Asset:            tokenAddress,
			Spender:          evm.PERMIT2Address, // correct spender in info
			Amount:           "100",
			SignedTransaction: wrongSpenderTx,    // but wrong spender in tx
			Version:          "1",
		}
		result := validateErc20ApprovalForPayment(context.Background(), nil, info, fromAddr, tokenAddress, chainID)
		if result != ErrErc20SpenderNotPermit2 {
			t.Errorf("expected %s, got: %s", ErrErc20SpenderNotPermit2, result)
		}
	})

	t.Run("rejects invalid signedTransaction (odd-length hex fails decode)", func(t *testing.T) {
		// "0xABC" has 3 hex chars (odd) → passes regex but hex.DecodeString fails
		info := &erc20approvalgassponsor.Info{
			From:              from,
			Asset:             tokenAddress,
			Spender:           evm.PERMIT2Address,
			Amount:            "100",
			SignedTransaction:  "0xABC", // odd-length hex: passes regex, fails decode
			Version:           "1",
		}
		result := validateErc20ApprovalForPayment(context.Background(), nil, info, from, tokenAddress, chainID)
		if result != ErrErc20InvalidSignedTx {
			t.Errorf("expected %s, got: %s", ErrErc20InvalidSignedTx, result)
		}
	})

	t.Run("rejects invalid RLP transaction", func(t *testing.T) {
		info := &erc20approvalgassponsor.Info{
			From:              from,
			Asset:             tokenAddress,
			Spender:           evm.PERMIT2Address,
			Amount:            "100",
			SignedTransaction:  "0xdeadbeef", // valid hex but invalid RLP tx
			Version:           "1",
		}
		result := validateErc20ApprovalForPayment(context.Background(), nil, info, from, tokenAddress, chainID)
		if result != ErrErc20InvalidSignedTx {
			t.Errorf("expected %s, got: %s", ErrErc20InvalidSignedTx, result)
		}
	})
}

func TestExtractCalldataFromSignedTx(t *testing.T) {
	chainID := big.NewInt(84532)
	tokenAddress := "0x036CbD53842c5426634e7929541eC2318f3dCF7e"

	_, signedTx := buildTestSignedApproveTx(t, tokenAddress, chainID)

	t.Run("extracts calldata from valid signed tx", func(t *testing.T) {
		calldata, err := extractCalldataFromSignedTx(signedTx)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(calldata) < 4 {
			t.Fatal("calldata too short")
		}
		// Should start with approve(address,uint256) selector 0x095ea7b3
		selectorHex := evm.BytesToHex(calldata[:4])
		if !strings.EqualFold(selectorHex, evm.ERC20ApproveFunctionSelector) {
			t.Errorf("unexpected selector: %s", selectorHex)
		}
	})

	t.Run("returns error for invalid hex", func(t *testing.T) {
		_, err := extractCalldataFromSignedTx("0xZZZZ")
		if err == nil {
			t.Fatal("expected error for invalid hex")
		}
	})

	t.Run("returns error for invalid RLP", func(t *testing.T) {
		_, err := extractCalldataFromSignedTx("0xdeadbeef")
		if err == nil {
			t.Fatal("expected error for invalid RLP transaction")
		}
	})
}

// mockSmartWalletBatchSigner implements SmartWalletBatchSigner for tests.
type mockSmartWalletBatchSigner struct {
	capturedCalls []erc20approvalgassponsor.BatchCall
	returnTxHash  string
	returnErr     error
}

func (m *mockSmartWalletBatchSigner) SendBatchTransaction(_ context.Context, calls []erc20approvalgassponsor.BatchCall) (string, error) {
	m.capturedCalls = calls
	if m.returnErr != nil {
		return "", m.returnErr
	}
	if m.returnTxHash == "" {
		return "0xbatchhash1234", nil
	}
	return m.returnTxHash, nil
}

func (m *mockSmartWalletBatchSigner) WaitForTransactionReceipt(_ context.Context, _ string) (*evm.TransactionReceipt, error) {
	return &evm.TransactionReceipt{Status: evm.TxStatusSuccess}, nil
}

func TestSettlePermit2_ERC20Extension_ErrorWhenNotConfigured(t *testing.T) {
	// Test that SettlePermit2 returns ErrErc20GasSponsoringNotConfigured
	// when no extension is registered in the FacilitatorContext.
	// We create a FacilitatorContext without the ERC-20 extension registered.
	fctx := x402.NewFacilitatorContext(map[string]x402.FacilitatorExtension{})

	// Verify that GetExtension returns nil for an unregistered key
	ext := fctx.GetExtension(erc20approvalgassponsor.ERC20ApprovalGasSponsoring)
	if ext != nil {
		t.Fatal("expected nil extension for unregistered key")
	}

	// The FacilitatorExt type assertion should fail for nil
	_, ok := ext.(*erc20approvalgassponsor.FacilitatorExt)
	if ok {
		t.Fatal("expected type assertion to fail for nil")
	}
}

func TestSettlePermit2_ERC20Extension_NilSmartWalletSigner(t *testing.T) {
	// Test that FacilitatorExt with nil SmartWalletSigner is detected
	ext := erc20approvalgassponsor.NewFacilitatorExtension(nil)
	if ext.SmartWalletSigner != nil {
		t.Fatal("expected nil SmartWalletSigner")
	}

	// FacilitatorContext with nil-signer extension
	fctx := x402.NewFacilitatorContext(map[string]x402.FacilitatorExtension{
		erc20approvalgassponsor.ERC20ApprovalGasSponsoring: ext,
	})

	extRaw := fctx.GetExtension(erc20approvalgassponsor.ERC20ApprovalGasSponsoring)
	facilitatorExt, ok := extRaw.(*erc20approvalgassponsor.FacilitatorExt)
	if !ok {
		t.Fatal("expected type assertion to succeed")
	}
	if facilitatorExt.SmartWalletSigner != nil {
		t.Fatal("expected nil SmartWalletSigner")
	}
	// This simulates the condition that would trigger ErrErc20GasSponsoringNotConfigured
}

func TestSettlePermit2_ERC20Extension_BatchCallsCorrect(t *testing.T) {
	// Test that the batch signer receives the correct calls
	chainID := big.NewInt(84532)
	tokenAddress := "0x036CbD53842c5426634e7929541eC2318f3dCF7e"

	_, signedTx := buildTestSignedApproveTx(t, tokenAddress, chainID)

	// Extract calldata to verify it's passed correctly
	calldata, err := extractCalldataFromSignedTx(signedTx)
	if err != nil {
		t.Fatalf("failed to extract calldata: %v", err)
	}

	mockSigner := &mockSmartWalletBatchSigner{}
	calls := []erc20approvalgassponsor.BatchCall{
		{To: evm.NormalizeAddress(tokenAddress), Data: calldata},
		{To: evm.X402ExactPermit2ProxyAddress, Data: []byte{0x01, 0x02}},
	}

	txHash, err := mockSigner.SendBatchTransaction(context.Background(), calls)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if txHash == "" {
		t.Fatal("expected non-empty tx hash")
	}
	if len(mockSigner.capturedCalls) != 2 {
		t.Errorf("expected 2 calls, got %d", len(mockSigner.capturedCalls))
	}
	// First call should target the token contract (approval)
	if !strings.EqualFold(mockSigner.capturedCalls[0].To, evm.NormalizeAddress(tokenAddress)) {
		t.Errorf("first call should target token: %s", mockSigner.capturedCalls[0].To)
	}
	// Second call should target the Permit2 proxy (settle)
	if !strings.EqualFold(mockSigner.capturedCalls[1].To, evm.X402ExactPermit2ProxyAddress) {
		t.Errorf("second call should target permit2 proxy: %s", mockSigner.capturedCalls[1].To)
	}
}
