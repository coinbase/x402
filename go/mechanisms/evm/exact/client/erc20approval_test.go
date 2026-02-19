package client

import (
	"bytes"
	"context"
	"crypto/ecdsa"
	"encoding/hex"
	"math/big"
	"strings"
	"testing"

	ethabi "github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"

	"github.com/coinbase/x402/go/mechanisms/evm"
)

// mockErc20ApprovalSigner implements Erc20ApprovalClientSigner for tests.
type mockErc20ApprovalSigner struct {
	privateKey *ecdsa.PrivateKey
	address    string
	calldata   []byte // stored calldata from the last SignRawTransaction call
}

func newMockErc20ApprovalSigner(t *testing.T) *mockErc20ApprovalSigner {
	t.Helper()
	pk, err := crypto.GenerateKey()
	if err != nil {
		t.Fatalf("failed to generate key: %v", err)
	}
	addr := crypto.PubkeyToAddress(pk.PublicKey).Hex()
	return &mockErc20ApprovalSigner{privateKey: pk, address: addr}
}

func (m *mockErc20ApprovalSigner) Address() string { return m.address }

func (m *mockErc20ApprovalSigner) PendingNonceAt(_ context.Context, _ string) (uint64, error) {
	return 0, nil
}

func (m *mockErc20ApprovalSigner) SuggestGasTipCap(_ context.Context) (*big.Int, error) {
	return big.NewInt(1e9), nil // 1 gwei
}

func (m *mockErc20ApprovalSigner) SuggestGasPrice(_ context.Context) (*big.Int, error) {
	return big.NewInt(10e9), nil // 10 gwei
}

func (m *mockErc20ApprovalSigner) SignRawTransaction(
	_ context.Context,
	chainID *big.Int,
	to string,
	data []byte,
	nonce uint64,
	gasLimit uint64,
	gasFeeCap *big.Int,
	gasTipCap *big.Int,
) ([]byte, error) {
	// Store calldata for assertion in tests
	m.calldata = make([]byte, len(data))
	copy(m.calldata, data)

	tx := types.NewTx(&types.DynamicFeeTx{
		ChainID:   chainID,
		Nonce:     nonce,
		GasTipCap: gasTipCap,
		GasFeeCap: gasFeeCap,
		Gas:       gasLimit,
		To:        func() *common.Address { a := common.HexToAddress(to); return &a }(),
		Data:      data,
	})

	signer := types.LatestSignerForChainID(chainID)
	signed, err := types.SignTx(tx, signer, m.privateKey)
	if err != nil {
		return nil, err
	}

	return signed.MarshalBinary()
}

// decodeApproveCalldata decodes approve(address,uint256) calldata and returns spender, amount.
func decodeApproveCalldata(t *testing.T, calldata []byte) (string, *big.Int) {
	t.Helper()
	if len(calldata) < 4 {
		t.Fatal("calldata too short")
	}

	parsedABI, err := ethabi.JSON(bytes.NewReader(evm.ERC20ApproveABI))
	if err != nil {
		t.Fatalf("failed to parse ABI: %v", err)
	}

	args, err := parsedABI.Methods["approve"].Inputs.Unpack(calldata[4:])
	if err != nil {
		t.Fatalf("failed to unpack calldata: %v", err)
	}

	spender := args[0].(common.Address).Hex()
	amount := args[1].(*big.Int)
	return spender, amount
}

func TestSignErc20ApprovalTransaction_Infinite(t *testing.T) {
	signer := newMockErc20ApprovalSigner(t)
	ctx := context.Background()
	chainID := big.NewInt(84532) // Base Sepolia
	tokenAddress := "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
	amount := big.NewInt(1000000) // 1 USDC

	info, err := SignErc20ApprovalTransaction(ctx, signer, tokenAddress, chainID, amount, &Erc20ApprovalClientConfig{
		ApprovalMode: "infinite",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if info == nil {
		t.Fatal("expected non-nil info")
	}

	// Verify fields
	if !strings.EqualFold(info.From, signer.Address()) {
		t.Errorf("from mismatch: %s vs %s", info.From, signer.Address())
	}
	if !strings.EqualFold(info.Asset, tokenAddress) {
		t.Errorf("asset mismatch: %s vs %s", info.Asset, tokenAddress)
	}
	if !strings.EqualFold(info.Spender, evm.PERMIT2Address) {
		t.Errorf("spender mismatch: %s vs %s", info.Spender, evm.PERMIT2Address)
	}
	if info.Amount != evm.MaxUint256().String() {
		t.Errorf("expected MaxUint256 amount, got: %s", info.Amount)
	}
	if !strings.HasPrefix(info.SignedTransaction, "0x") {
		t.Errorf("signedTransaction missing 0x prefix: %s", info.SignedTransaction)
	}

	// Verify the calldata encodes approve(Permit2, MaxUint256)
	spender, approvedAmount := decodeApproveCalldata(t, signer.calldata)
	if !strings.EqualFold(spender, evm.PERMIT2Address) {
		t.Errorf("calldata spender mismatch: %s", spender)
	}
	if approvedAmount.Cmp(evm.MaxUint256()) != 0 {
		t.Errorf("calldata amount not MaxUint256: %s", approvedAmount)
	}

	// Verify function selector
	selectorHex := hex.EncodeToString(signer.calldata[:4])
	if selectorHex != "095ea7b3" {
		t.Errorf("unexpected function selector: %s", selectorHex)
	}
}

func TestSignErc20ApprovalTransaction_Exact(t *testing.T) {
	signer := newMockErc20ApprovalSigner(t)
	ctx := context.Background()
	chainID := big.NewInt(84532)
	tokenAddress := "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
	exactAmount := big.NewInt(5000000) // 5 USDC

	info, err := SignErc20ApprovalTransaction(ctx, signer, tokenAddress, chainID, exactAmount, &Erc20ApprovalClientConfig{
		ApprovalMode: "exact",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if info.Amount != exactAmount.String() {
		t.Errorf("expected exact amount %s, got: %s", exactAmount.String(), info.Amount)
	}

	// Verify the calldata encodes approve(Permit2, exactAmount)
	spender, approvedAmount := decodeApproveCalldata(t, signer.calldata)
	if !strings.EqualFold(spender, evm.PERMIT2Address) {
		t.Errorf("calldata spender mismatch: %s", spender)
	}
	if approvedAmount.Cmp(exactAmount) != 0 {
		t.Errorf("calldata amount mismatch: expected %s, got %s", exactAmount, approvedAmount)
	}
}

func TestSignErc20ApprovalTransaction_DefaultsToInfinite(t *testing.T) {
	signer := newMockErc20ApprovalSigner(t)
	ctx := context.Background()
	chainID := big.NewInt(84532)
	tokenAddress := "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
	amount := big.NewInt(1000000)

	// nil config should default to "infinite"
	info, err := SignErc20ApprovalTransaction(ctx, signer, tokenAddress, chainID, amount, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if info.Amount != evm.MaxUint256().String() {
		t.Errorf("nil config should default to infinite approval, got amount: %s", info.Amount)
	}

	_, approvedAmount := decodeApproveCalldata(t, signer.calldata)
	if approvedAmount.Cmp(evm.MaxUint256()) != 0 {
		t.Errorf("nil config should use MaxUint256 in calldata, got: %s", approvedAmount)
	}
}
