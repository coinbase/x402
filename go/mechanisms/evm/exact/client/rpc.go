package client

import (
	"context"
	"fmt"
	"math/big"
	"strings"
	"sync"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	goethtypes "github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/ethclient"

	"github.com/coinbase/x402/go/mechanisms/evm"
)

// ExactEvmChainConfig configures extension RPC behavior for one chain.
type ExactEvmChainConfig struct {
	RPCURL string
}

// ExactEvmSchemeConfig configures extension RPC behavior for Exact EVM clients.
// If both RPCByChainID and RPCURL are set, chain-specific entries take precedence.
type ExactEvmSchemeConfig struct {
	RPCURL       string
	RPCByChainID map[int64]ExactEvmChainConfig
}

type rpcCapabilities struct {
	client *ethclient.Client
}

var rpcClientCache sync.Map // map[string]*ethclient.Client

func getOrCreateRPCClient(ctx context.Context, rpcURL string) (*ethclient.Client, error) {
	if existing, ok := rpcClientCache.Load(rpcURL); ok {
		if cachedClient, ok := existing.(*ethclient.Client); ok {
			return cachedClient, nil
		}
	}

	client, err := ethclient.DialContext(ctx, rpcURL)
	if err != nil {
		return nil, err
	}
	rpcClientCache.Store(rpcURL, client)
	return client, nil
}

func newRPCCapabilities(ctx context.Context, rpcURL string) (*rpcCapabilities, error) {
	client, err := getOrCreateRPCClient(ctx, rpcURL)
	if err != nil {
		return nil, err
	}
	return &rpcCapabilities{client: client}, nil
}

func (r *rpcCapabilities) ReadContract(
	ctx context.Context,
	contractAddress string,
	abiBytes []byte,
	functionName string,
	args ...interface{},
) (interface{}, error) {
	contractABI, err := abi.JSON(strings.NewReader(string(abiBytes)))
	if err != nil {
		return nil, fmt.Errorf("failed to parse ABI: %w", err)
	}

	data, err := contractABI.Pack(functionName, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to pack method call: %w", err)
	}

	addr := common.HexToAddress(contractAddress)
	msg := ethereum.CallMsg{
		To:   &addr,
		Data: data,
	}

	result, err := r.client.CallContract(ctx, msg, nil)
	if err != nil {
		return nil, fmt.Errorf("contract call failed: %w", err)
	}

	outputs, err := contractABI.Unpack(functionName, result)
	if err != nil {
		return nil, fmt.Errorf("failed to unpack result: %w", err)
	}
	if len(outputs) == 0 {
		return nil, nil
	}
	if len(outputs) == 1 {
		return outputs[0], nil
	}
	return outputs, nil
}

func (r *rpcCapabilities) GetTransactionCount(ctx context.Context, address string) (uint64, error) {
	nonce, err := r.client.PendingNonceAt(ctx, common.HexToAddress(address))
	if err != nil {
		return 0, fmt.Errorf("failed to get pending nonce: %w", err)
	}
	return nonce, nil
}

func (r *rpcCapabilities) EstimateFeesPerGas(ctx context.Context) (*big.Int, *big.Int, error) {
	gwei := big.NewInt(1_000_000_000)
	fallbackMax := new(big.Int).Mul(big.NewInt(1), gwei)  // 1 gwei
	fallbackTip := new(big.Int).Div(gwei, big.NewInt(10)) // 0.1 gwei

	tip, err := r.client.SuggestGasTipCap(ctx)
	if err != nil {
		return fallbackMax, fallbackTip, err
	}

	header, err := r.client.HeaderByNumber(ctx, nil)
	if err != nil {
		maxFee := new(big.Int).Add(tip, gwei)
		return maxFee, tip, err
	}

	baseFee := header.BaseFee
	if baseFee == nil {
		baseFee = gwei
	}
	maxFee := new(big.Int).Add(new(big.Int).Mul(big.NewInt(2), baseFee), tip)
	return maxFee, tip, nil
}

func (c *ExactEvmScheme) resolveRPCURL(network string) string {
	if c.config == nil {
		return ""
	}

	if len(c.config.RPCByChainID) > 0 {
		chainID, err := evm.GetEvmChainId(string(network))
		if err == nil {
			if chainConfig, ok := c.config.RPCByChainID[chainID.Int64()]; ok && chainConfig.RPCURL != "" {
				return chainConfig.RPCURL
			}
		}
	}

	return c.config.RPCURL
}

type resolvedReadSigner struct {
	base   evm.ClientEvmSigner
	reader func(ctx context.Context, address string, abi []byte, functionName string, args ...interface{}) (interface{}, error)
}

func (s *resolvedReadSigner) Address() string {
	return s.base.Address()
}

func (s *resolvedReadSigner) SignTypedData(
	ctx context.Context,
	domain evm.TypedDataDomain,
	types map[string][]evm.TypedDataField,
	primaryType string,
	message map[string]interface{},
) ([]byte, error) {
	return s.base.SignTypedData(ctx, domain, types, primaryType, message)
}

func (s *resolvedReadSigner) ReadContract(
	ctx context.Context,
	address string,
	abi []byte,
	functionName string,
	args ...interface{},
) (interface{}, error) {
	return s.reader(ctx, address, abi, functionName, args...)
}

type resolvedTxSigner struct {
	base         evm.ClientEvmSigner
	signTx       func(ctx context.Context, tx *goethtypes.Transaction) ([]byte, error)
	getNonce     func(ctx context.Context, address string) (uint64, error)
	estimateFees func(ctx context.Context) (maxFeePerGas, maxPriorityFeePerGas *big.Int, err error)
}

func (s *resolvedTxSigner) Address() string {
	return s.base.Address()
}

func (s *resolvedTxSigner) SignTypedData(
	ctx context.Context,
	domain evm.TypedDataDomain,
	types map[string][]evm.TypedDataField,
	primaryType string,
	message map[string]interface{},
) ([]byte, error) {
	return s.base.SignTypedData(ctx, domain, types, primaryType, message)
}

func (s *resolvedTxSigner) SignTransaction(ctx context.Context, tx *goethtypes.Transaction) ([]byte, error) {
	return s.signTx(ctx, tx)
}

func (s *resolvedTxSigner) GetTransactionCount(ctx context.Context, address string) (uint64, error) {
	return s.getNonce(ctx, address)
}

func (s *resolvedTxSigner) EstimateFeesPerGas(ctx context.Context) (*big.Int, *big.Int, error) {
	return s.estimateFees(ctx)
}

func (c *ExactEvmScheme) resolveReadSigner(
	ctx context.Context,
	network string,
) (evm.ClientEvmSignerWithReadContract, error) {
	if signerWithRead, ok := c.signer.(evm.ClientEvmSignerWithReadContract); ok {
		return signerWithRead, nil
	}

	rpcURL := c.resolveRPCURL(network)
	if rpcURL == "" {
		return nil, nil
	}

	rpcCaps, err := newRPCCapabilities(ctx, rpcURL)
	if err != nil {
		return nil, err
	}

	return &resolvedReadSigner{
		base:   c.signer,
		reader: rpcCaps.ReadContract,
	}, nil
}

func (c *ExactEvmScheme) resolveTxSigner(
	ctx context.Context,
	network string,
) (evm.ClientEvmSignerWithTxSigning, error) {
	signSigner, ok := c.signer.(evm.ClientEvmSignerWithSignTransaction)
	if !ok {
		return nil, nil
	}

	var getNonceFn func(ctx context.Context, address string) (uint64, error)
	if nonceSigner, hasNonce := c.signer.(evm.ClientEvmSignerWithGetTransactionCount); hasNonce {
		getNonceFn = nonceSigner.GetTransactionCount
	}

	var estimateFeesFn func(ctx context.Context) (maxFeePerGas, maxPriorityFeePerGas *big.Int, err error)
	if feeSigner, hasFees := c.signer.(evm.ClientEvmSignerWithEstimateFeesPerGas); hasFees {
		estimateFeesFn = feeSigner.EstimateFeesPerGas
	}

	if getNonceFn == nil || estimateFeesFn == nil {
		rpcURL := c.resolveRPCURL(network)
		if rpcURL == "" {
			return nil, nil
		}

		rpcCaps, err := newRPCCapabilities(ctx, rpcURL)
		if err != nil {
			return nil, err
		}

		if getNonceFn == nil {
			getNonceFn = rpcCaps.GetTransactionCount
		}
		if estimateFeesFn == nil {
			estimateFeesFn = rpcCaps.EstimateFeesPerGas
		}
	}

	return &resolvedTxSigner{
		base:         c.signer,
		signTx:       signSigner.SignTransaction,
		getNonce:     getNonceFn,
		estimateFees: estimateFeesFn,
	}, nil
}
