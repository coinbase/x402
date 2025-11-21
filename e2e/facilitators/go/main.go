package main

import (
	"bytes"
	"context"
	"crypto/ecdsa"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"math/big"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	x402 "github.com/coinbase/x402/go"
	exttypes "github.com/coinbase/x402/go/extensions/types"
	evmmech "github.com/coinbase/x402/go/mechanisms/evm"
	evm "github.com/coinbase/x402/go/mechanisms/evm/exact/facilitator"
	evmv1 "github.com/coinbase/x402/go/mechanisms/evm/exact/v1/facilitator"
	svmmech "github.com/coinbase/x402/go/mechanisms/svm"
	svm "github.com/coinbase/x402/go/mechanisms/svm/exact/facilitator"
	svmv1 "github.com/coinbase/x402/go/mechanisms/svm/exact/v1/facilitator"
	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/common/math"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"
	"github.com/ethereum/go-ethereum/signer/core/apitypes"
	solana "github.com/gagliardetto/solana-go"
	"github.com/gagliardetto/solana-go/rpc"
	"github.com/gin-gonic/gin"
)

// NOTE: Facilitator signer helpers (go/signers/evm and go/signers/svm) are not yet implemented.
// When available, this will reduce 300+ lines of facilitator signer code to just a few lines.
// For now, facilitator signers still require manual implementation.
// See PROPOSAL_SIGNER_HELPERS.md for the planned facilitator signer helpers.

const (
	DefaultPort = "4022"
	Network     = "eip155:84532"
	Scheme      = "exact"
)

// Request/Response types
type VerifyRequest struct {
	X402Version         int                      `json:"x402Version"`
	PaymentPayload      x402.PaymentPayload      `json:"paymentPayload"`
	PaymentRequirements x402.PaymentRequirements `json:"paymentRequirements"`
}

type SettleRequest struct {
	X402Version         int                      `json:"x402Version"`
	PaymentPayload      x402.PaymentPayload      `json:"paymentPayload"`
	PaymentRequirements x402.PaymentRequirements `json:"paymentRequirements"`
}

// Real EVM signer for facilitator using ethclient
type realFacilitatorEvmSigner struct {
	privateKey *ecdsa.PrivateKey
	address    common.Address
	client     *ethclient.Client
	chainID    *big.Int
}

func newRealFacilitatorEvmSigner(privateKeyHex string, rpcURL string) (*realFacilitatorEvmSigner, error) {
	// Remove 0x prefix if present
	privateKeyHex = strings.TrimPrefix(privateKeyHex, "0x")

	privateKey, err := crypto.HexToECDSA(privateKeyHex)
	if err != nil {
		return nil, fmt.Errorf("failed to parse private key: %w", err)
	}

	address := crypto.PubkeyToAddress(privateKey.PublicKey)

	// Connect to blockchain
	client, err := ethclient.Dial(rpcURL)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to RPC: %w", err)
	}

	// Get chain ID
	ctx := context.Background()
	chainID, err := client.ChainID(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get chain ID: %w", err)
	}

	return &realFacilitatorEvmSigner{
		privateKey: privateKey,
		address:    address,
		client:     client,
		chainID:    chainID,
	}, nil
}

func (s *realFacilitatorEvmSigner) GetAddress() string {
	return s.address.Hex()
}

func (s *realFacilitatorEvmSigner) GetChainID() (*big.Int, error) {
	return s.chainID, nil
}

func (s *realFacilitatorEvmSigner) VerifyTypedData(
	address string,
	domain evmmech.TypedDataDomain,
	types map[string][]evmmech.TypedDataField,
	primaryType string,
	message map[string]interface{},
	signature []byte,
) (bool, error) {
	// Convert to apitypes for EIP-712 verification
	chainId := getBigIntFromInterface(domain.ChainID)
	typedData := apitypes.TypedData{
		Types:       make(apitypes.Types),
		PrimaryType: primaryType,
		Domain: apitypes.TypedDataDomain{
			Name:              getStringFromInterface(domain.Name),
			Version:           getStringFromInterface(domain.Version),
			ChainId:           (*math.HexOrDecimal256)(chainId),
			VerifyingContract: getStringFromInterface(domain.VerifyingContract),
		},
		Message: message,
	}

	// Convert types
	for typeName, fields := range types {
		typedFields := make([]apitypes.Type, len(fields))
		for i, field := range fields {
			typedFields[i] = apitypes.Type{
				Name: field.Name,
				Type: field.Type,
			}
		}
		typedData.Types[typeName] = typedFields
	}

	// Add EIP712Domain if not present
	if _, exists := typedData.Types["EIP712Domain"]; !exists {
		typedData.Types["EIP712Domain"] = []apitypes.Type{
			{Name: "name", Type: "string"},
			{Name: "version", Type: "string"},
			{Name: "chainId", Type: "uint256"},
			{Name: "verifyingContract", Type: "address"},
		}
	}

	// Hash the data
	dataHash, err := typedData.HashStruct(typedData.PrimaryType, typedData.Message)
	if err != nil {
		return false, fmt.Errorf("failed to hash struct: %w", err)
	}

	domainSeparator, err := typedData.HashStruct("EIP712Domain", typedData.Domain.Map())
	if err != nil {
		return false, fmt.Errorf("failed to hash domain: %w", err)
	}

	rawData := []byte{0x19, 0x01}
	rawData = append(rawData, domainSeparator...)
	rawData = append(rawData, dataHash...)
	digest := crypto.Keccak256(rawData)

	// Recover the address from signature
	if len(signature) != 65 {
		return false, fmt.Errorf("invalid signature length: %d", len(signature))
	}

	// Adjust v value
	v := signature[64]
	if v >= 27 {
		v -= 27
	}

	sigCopy := make([]byte, 65)
	copy(sigCopy, signature)
	sigCopy[64] = v

	pubKey, err := crypto.SigToPub(digest, sigCopy)
	if err != nil {
		return false, fmt.Errorf("failed to recover public key: %w", err)
	}

	recoveredAddr := crypto.PubkeyToAddress(*pubKey)
	expectedAddr := common.HexToAddress(address)

	return bytes.Equal(recoveredAddr.Bytes(), expectedAddr.Bytes()), nil
}

func (s *realFacilitatorEvmSigner) ReadContract(
	contractAddress string,
	abiJSON []byte,
	method string,
	args ...interface{},
) (interface{}, error) {
	// Parse ABI
	contractABI, err := abi.JSON(strings.NewReader(string(abiJSON)))
	if err != nil {
		return nil, fmt.Errorf("failed to parse ABI: %w", err)
	}

	// Special handling for methods that expect specific types
	processedArgs := make([]interface{}, len(args))
	copy(processedArgs, args)

	switch method {
	case "authorizationState":
		// authorizationState(address authorizer, bytes32 nonce) returns (bool)
		// First argument is the address
		if len(processedArgs) > 0 {
			if addrStr, ok := processedArgs[0].(string); ok {
				processedArgs[0] = common.HexToAddress(addrStr)
			}
		}
		// Second argument is the nonce which needs to be bytes32
		if len(processedArgs) > 1 {
			// Check if it's already a [32]byte
			if _, ok := processedArgs[1].([32]byte); !ok {
				if nonceStr, ok := processedArgs[1].(string); ok {
					nonceStr = strings.TrimPrefix(nonceStr, "0x")
					nonceBytes, err := hex.DecodeString(nonceStr)
					if err != nil {
						return nil, fmt.Errorf("failed to decode nonce hex: %w", err)
					}
					if len(nonceBytes) != 32 {
						return nil, fmt.Errorf("nonce must be 32 bytes, got %d", len(nonceBytes))
					}
					var nonce32 [32]byte
					copy(nonce32[:], nonceBytes)
					processedArgs[1] = nonce32
				}
			}
		}
	case "balanceOf", "allowance":
		// These methods expect addresses, ensure they're in the right format
		for i, arg := range processedArgs {
			// Only convert if it's a string (not already a common.Address)
			if addrStr, ok := arg.(string); ok {
				processedArgs[i] = common.HexToAddress(addrStr)
			}
			// If it's already a common.Address, leave it as is
		}
	}

	// Pack the method call
	data, err := contractABI.Pack(method, processedArgs...)
	if err != nil {
		return nil, fmt.Errorf("failed to pack method call: %w", err)
	}

	// Make the call
	ctx := context.Background()
	to := common.HexToAddress(contractAddress)

	// Check if contract exists at this address
	code, err := s.client.CodeAt(ctx, to, nil)
	if err != nil {
		log.Printf("Failed to check contract code: contract=%s, error=%v", contractAddress, err)
	} else if len(code) == 0 {
		log.Printf("WARNING: No contract code at address %s", contractAddress)
	}

	msg := ethereum.CallMsg{
		To:   &to,
		Data: data,
	}

	result, err := s.client.CallContract(ctx, msg, nil)
	if err != nil {
		log.Printf("Contract call failed: method=%s, contract=%s, error=%v", method, contractAddress, err)
		return nil, fmt.Errorf("failed to call contract: %w", err)
	}

	log.Printf("Contract call: method=%s, contract=%s, dataLen=%d, resultLen=%d, result=%x", method, contractAddress, len(data), len(result), result)

	// Handle empty result (some contract calls return nothing or revert)
	if len(result) == 0 {
		// For authorizationState, empty means false (nonce not used)
		if method == "authorizationState" {
			return false, nil
		}
		// For balanceOf or allowance, empty might mean 0
		if method == "balanceOf" || method == "allowance" {
			return big.NewInt(0), nil
		}
		return nil, fmt.Errorf("empty result from contract call")
	}

	// Unpack the result based on method
	method_obj, exists := contractABI.Methods[method]
	if !exists {
		return nil, fmt.Errorf("method %s not found in ABI", method)
	}

	output, err := method_obj.Outputs.Unpack(result)
	if err != nil {
		return nil, fmt.Errorf("failed to unpack result: %w", err)
	}

	// Return the first output (most contract reads return a single value)
	if len(output) > 0 {
		return output[0], nil
	}

	return nil, nil
}

func (s *realFacilitatorEvmSigner) WriteContract(
	contractAddress string,
	abiJSON []byte,
	method string,
	args ...interface{},
) (string, error) {
	// Parse ABI
	contractABI, err := abi.JSON(strings.NewReader(string(abiJSON)))
	if err != nil {
		return "", fmt.Errorf("failed to parse ABI: %w", err)
	}

	// Process arguments for special cases
	processedArgs := make([]interface{}, len(args))
	copy(processedArgs, args)

	if method == "transferWithAuthorization" {
		// transferWithAuthorization expects:
		// v1: (address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)
		// Convert string addresses to common.Address
		if len(processedArgs) > 0 {
			if addrStr, ok := processedArgs[0].(string); ok {
				processedArgs[0] = common.HexToAddress(addrStr)
			}
		}
		if len(processedArgs) > 1 {
			if addrStr, ok := processedArgs[1].(string); ok {
				processedArgs[1] = common.HexToAddress(addrStr)
			}
		}

		// Ensure nonce is [32]byte (position 5)
		if len(processedArgs) > 5 {
			if _, ok := processedArgs[5].([32]byte); !ok {
				if nonceStr, ok := processedArgs[5].(string); ok {
					nonceStr = strings.TrimPrefix(nonceStr, "0x")
					nonceBytes, err := hex.DecodeString(nonceStr)
					if err != nil {
						return "", fmt.Errorf("failed to decode nonce hex: %w", err)
					}
					if len(nonceBytes) != 32 {
						return "", fmt.Errorf("nonce must be 32 bytes, got %d", len(nonceBytes))
					}
					var nonce32 [32]byte
					copy(nonce32[:], nonceBytes)
					processedArgs[5] = nonce32
				}
			}
		}
		// Keep v, r, s as separate arguments (positions 6, 7, 8) for v1 ABI
	}

	// Pack the method call
	data, err := contractABI.Pack(method, processedArgs...)
	if err != nil {
		return "", fmt.Errorf("failed to pack method call: %w", err)
	}

	// Get nonce
	ctx := context.Background()
	nonce, err := s.client.PendingNonceAt(ctx, s.address)
	if err != nil {
		return "", fmt.Errorf("failed to get nonce: %w", err)
	}

	// Get gas price
	gasPrice, err := s.client.SuggestGasPrice(ctx)
	if err != nil {
		return "", fmt.Errorf("failed to get gas price: %w", err)
	}

	// Create transaction
	to := common.HexToAddress(contractAddress)
	tx := types.NewTransaction(
		nonce,
		to,
		big.NewInt(0), // value
		300000,        // gas limit
		gasPrice,
		data,
	)

	// Sign transaction
	signedTx, err := types.SignTx(tx, types.LatestSignerForChainID(s.chainID), s.privateKey)
	if err != nil {
		return "", fmt.Errorf("failed to sign transaction: %w", err)
	}

	// Send transaction
	err = s.client.SendTransaction(ctx, signedTx)
	if err != nil {
		return "", fmt.Errorf("failed to send transaction: %w", err)
	}

	return signedTx.Hash().Hex(), nil
}

func (s *realFacilitatorEvmSigner) WaitForTransactionReceipt(txHash string) (*evmmech.TransactionReceipt, error) {
	ctx := context.Background()
	hash := common.HexToHash(txHash)

	// Poll for receipt
	for i := 0; i < 30; i++ { // 30 seconds timeout
		receipt, err := s.client.TransactionReceipt(ctx, hash)
		if err == nil && receipt != nil {
			return &evmmech.TransactionReceipt{
				Status:      uint64(receipt.Status),
				BlockNumber: receipt.BlockNumber.Uint64(),
				TxHash:      receipt.TxHash.Hex(),
			}, nil
		}
		time.Sleep(1 * time.Second)
	}

	return nil, fmt.Errorf("transaction receipt not found after 30 seconds")
}

func (s *realFacilitatorEvmSigner) GetBalance(address string, tokenAddress string) (*big.Int, error) {
	if tokenAddress == "" || tokenAddress == "0x0000000000000000000000000000000000000000" {
		// Native balance
		ctx := context.Background()
		balance, err := s.client.BalanceAt(ctx, common.HexToAddress(address), nil)
		if err != nil {
			return nil, fmt.Errorf("failed to get balance: %w", err)
		}
		return balance, nil
	}

	// ERC20 balance - need to call balanceOf
	// Minimal ERC20 ABI for balanceOf
	const erc20ABI = `[{"constant":true,"inputs":[{"name":"account","type":"address"}],"name":"balanceOf","outputs":[{"name":"","type":"uint256"}],"type":"function"}]`

	// Pass address as string, let ReadContract handle the conversion
	result, err := s.ReadContract(tokenAddress, []byte(erc20ABI), "balanceOf", address)
	if err != nil {
		return nil, err
	}

	if balance, ok := result.(*big.Int); ok {
		return balance, nil
	}

	return nil, fmt.Errorf("unexpected balance type: %T", result)
}

// Helper functions for type conversion
func getStringFromInterface(v interface{}) string {
	if v == nil {
		return ""
	}
	switch val := v.(type) {
	case string:
		return val
	case *string:
		if val != nil {
			return *val
		}
	}
	return ""
}

func getBigIntFromInterface(v interface{}) *big.Int {
	if v == nil {
		return big.NewInt(0)
	}
	switch val := v.(type) {
	case *big.Int:
		return val
	case int64:
		return big.NewInt(val)
	case string:
		n, _ := new(big.Int).SetString(val, 10)
		return n
	}
	return big.NewInt(0)
}

var (
	bazaarCatalog     = NewBazaarCatalog()
	verifiedPayments  = make(map[string]int64)
	verificationMutex = &sync.RWMutex{}
)

func createPaymentHash(paymentPayload x402.PaymentPayload) string {
	data, _ := json.Marshal(paymentPayload)
	hash := sha256.Sum256(data)
	return hex.EncodeToString(hash[:])
}

// Real SVM facilitator signer
type realFacilitatorSvmSigner struct {
	privateKey solana.PrivateKey
	rpcClients map[string]*rpc.Client
	rpcURL     string
}

func newRealFacilitatorSvmSigner(privateKeyBase58 string, rpcURL string) (*realFacilitatorSvmSigner, error) {
	privateKey, err := solana.PrivateKeyFromBase58(privateKeyBase58)
	if err != nil {
		return nil, fmt.Errorf("failed to parse Solana private key: %w", err)
	}

	return &realFacilitatorSvmSigner{
		privateKey: privateKey,
		rpcClients: make(map[string]*rpc.Client),
		rpcURL:     rpcURL,
	}, nil
}

func (s *realFacilitatorSvmSigner) GetRPC(network string) (*rpc.Client, error) {
	if client, ok := s.rpcClients[network]; ok {
		return client, nil
	}

	rpcURL := s.rpcURL
	if rpcURL == "" {
		config, err := svmmech.GetNetworkConfig(network)
		if err != nil {
			return nil, err
		}
		rpcURL = config.RPCURL
	}

	client := rpc.New(rpcURL)
	s.rpcClients[network] = client
	return client, nil
}

func (s *realFacilitatorSvmSigner) SignTransaction(tx *solana.Transaction, network string) error {
	messageBytes, err := tx.Message.MarshalBinary()
	if err != nil {
		return fmt.Errorf("failed to marshal message: %w", err)
	}

	signature, err := s.privateKey.Sign(messageBytes)
	if err != nil {
		return fmt.Errorf("failed to sign: %w", err)
	}

	accountIndex, err := tx.GetAccountIndex(s.privateKey.PublicKey())
	if err != nil {
		return fmt.Errorf("failed to get account index: %w", err)
	}

	if len(tx.Signatures) <= int(accountIndex) {
		newSignatures := make([]solana.Signature, accountIndex+1)
		copy(newSignatures, tx.Signatures)
		tx.Signatures = newSignatures
	}

	tx.Signatures[accountIndex] = signature
	return nil
}

func (s *realFacilitatorSvmSigner) SendTransaction(ctx context.Context, tx *solana.Transaction, network string) (solana.Signature, error) {
	rpcClient, err := s.GetRPC(network)
	if err != nil {
		return solana.Signature{}, err
	}

	sig, err := rpcClient.SendTransactionWithOpts(ctx, tx, rpc.TransactionOpts{
		SkipPreflight:       true,
		PreflightCommitment: svmmech.DefaultCommitment,
	})
	if err != nil {
		return solana.Signature{}, fmt.Errorf("failed to send transaction: %w", err)
	}

	return sig, nil
}

func (s *realFacilitatorSvmSigner) ConfirmTransaction(ctx context.Context, signature solana.Signature, network string) error {
	rpcClient, err := s.GetRPC(network)
	if err != nil {
		return err
	}

	for attempt := 0; attempt < svmmech.MaxConfirmAttempts; attempt++ {
		// Check for context cancellation
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		// Try getSignatureStatuses first (faster)
		statuses, err := rpcClient.GetSignatureStatuses(ctx, true, signature)
		if err == nil && statuses != nil && statuses.Value != nil && len(statuses.Value) > 0 {
			status := statuses.Value[0]
			if status != nil {
				if status.Err != nil {
					return fmt.Errorf("transaction failed on-chain")
				}
				if status.ConfirmationStatus == rpc.ConfirmationStatusConfirmed ||
					status.ConfirmationStatus == rpc.ConfirmationStatusFinalized {
					return nil
				}
			}
		}

		// Fallback to getTransaction
		if err != nil {
			txResult, txErr := rpcClient.GetTransaction(ctx, signature, &rpc.GetTransactionOpts{
				Encoding:   solana.EncodingBase58,
				Commitment: svmmech.DefaultCommitment,
			})

			if txErr == nil && txResult != nil && txResult.Meta != nil {
				if txResult.Meta.Err != nil {
					return fmt.Errorf("transaction failed on-chain")
				}
				return nil
			}
		}

		// Wait before retrying
		time.Sleep(svmmech.ConfirmRetryDelay)
	}

	return fmt.Errorf("transaction confirmation timed out after %d attempts", svmmech.MaxConfirmAttempts)
}

func (s *realFacilitatorSvmSigner) GetAddress(network string) solana.PublicKey {
	return s.privateKey.PublicKey()
}

func main() {
	// Get configuration from environment
	port := os.Getenv("PORT")
	if port == "" {
		port = DefaultPort
	}

	evmPrivateKey := os.Getenv("EVM_PRIVATE_KEY")
	if evmPrivateKey == "" {
		log.Fatal("❌ EVM_PRIVATE_KEY environment variable is required")
	}

	svmPrivateKey := os.Getenv("SVM_PRIVATE_KEY")
	if svmPrivateKey == "" {
		log.Fatal("❌ SVM_PRIVATE_KEY environment variable is required")
	}

	// Initialize the real EVM blockchain signer (uses default Base Sepolia RPC)
	evmSigner, err := newRealFacilitatorEvmSigner(evmPrivateKey, "https://sepolia.base.org")
	if err != nil {
		log.Fatalf("Failed to create EVM signer: %v", err)
	}

	chainID, _ := evmSigner.GetChainID()
	log.Printf("EVM Facilitator account: %s", evmSigner.GetAddress())
	log.Printf("Connected to chain ID: %s (expected: 84532 for Base Sepolia)", chainID.String())

	// Initialize the real SVM blockchain signer (uses default Solana Devnet RPC)
	svmSigner, err := newRealFacilitatorSvmSigner(svmPrivateKey, "https://api.devnet.solana.com")
	if err != nil {
		log.Fatalf("Failed to create SVM signer: %v", err)
	}

	log.Printf("SVM Facilitator account: %s", svmSigner.GetAddress("solana-devnet").String())

	// Initialize the x402 Facilitator with EVM and SVM support
	facilitator := x402.Newx402Facilitator()

	// Register EVM schemes
	evmFacilitatorScheme := evm.NewExactEvmScheme(evmSigner)
	facilitator.Register("eip155:84532", evmFacilitatorScheme)

	evmFacilitatorV1Scheme := evmv1.NewExactEvmSchemeV1(evmSigner)
	facilitator.RegisterV1("base-sepolia", evmFacilitatorV1Scheme)

	// Register SVM schemes
	svmFacilitatorScheme := svm.NewExactSvmScheme(svmSigner)
	facilitator.Register("solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1", svmFacilitatorScheme) // Devnet

	svmFacilitatorV1Scheme := svmv1.NewExactSvmSchemeV1(svmSigner)
	facilitator.RegisterV1("solana-devnet", svmFacilitatorV1Scheme)

	// Register the Bazaar discovery extension
	facilitator.RegisterExtension(exttypes.BAZAAR)
	
	// Lifecycle hooks for payment tracking and discovery
	facilitator.
		OnAfterVerify(func(ctx x402.FacilitatorVerifyResultContext) error {
			// Hook 1: Track verified payment for verify→settle flow validation
			if ctx.Result.IsValid {
				// Hooks now use view interfaces - create hash from payload view
				paymentHash := fmt.Sprintf("v%d-%s-%s", 
					ctx.Payload.GetVersion(),
					ctx.Payload.GetScheme(), 
					ctx.Payload.GetNetwork())
				verificationMutex.Lock()
				verifiedPayments[paymentHash] = time.Now().Unix()
				verificationMutex.Unlock()
				
				log.Printf("✅ Payment verified: %s", paymentHash)
				
				// Hook 2: Extract and catalog Bazaar discovery info (uses raw bytes escape hatch)
				version := ctx.Payload.GetVersion()
				var resourceURL string
				var discoveryExt map[string]interface{}
				
				if version == 2 {
					// V2: Unmarshal payload to get Extensions and Resource
					var payloadV2 x402.PaymentPayload
					if err := json.Unmarshal(ctx.PayloadBytes, &payloadV2); err == nil {
						if payloadV2.Resource != nil {
							resourceURL = payloadV2.Resource.URL
						}
						if payloadV2.Extensions != nil {
							if bazaar, ok := payloadV2.Extensions[exttypes.BAZAAR]; ok {
								if bazaarMap, ok := bazaar.(map[string]interface{}); ok {
									discoveryExt = bazaarMap
								}
							}
						}
					}
				} else if version == 1 {
					// V1: Unmarshal requirements to get Resource and OutputSchema
					var reqsV1 x402.PaymentRequirements
					if err := json.Unmarshal(ctx.RequirementsBytes, &reqsV1); err == nil {
						// V1 uses requirements for resource URL
						if reqsV1.Extra != nil {
							if resource, ok := reqsV1.Extra["resource"].(string); ok {
								resourceURL = resource
							}
						}
						// V1 uses outputSchema for discovery info
						if reqsV1.Extra != nil {
							if outputSchema, ok := reqsV1.Extra["outputSchema"]; ok {
								if schemaMap, ok := outputSchema.(map[string]interface{}); ok {
									discoveryExt = schemaMap
								}
							}
						}
					}
				}
				
				// Catalog if we found discovery info
				if resourceURL != "" && discoveryExt != nil {
					// Extract method from discovery extension
					method := "GET" // Default
					if input, ok := discoveryExt["input"].(map[string]interface{}); ok {
						if m, ok := input["method"].(string); ok {
							method = m
						}
					}
					
					// Unmarshal requirements to generic PaymentRequirements type
					// NOTE: This is a simplified e2e test implementation. It does not properly
					// handle V1 vs V2 type differences (V1 uses maxAmountRequired, V2 uses amount).
					// For production Bazaar cataloging, use proper V1/V2 type handling.
					// This is sufficient for testing that the extension mechanism works.
					var requirements x402.PaymentRequirements
					if err := json.Unmarshal(ctx.RequirementsBytes, &requirements); err == nil {
						// Convert discoveryExt to DiscoveryInfo (simplified)
						// In production, would use bazaar.ExtractDiscoveryInfo() with proper types
						discoveryInfoJSON, _ := json.Marshal(discoveryExt)
						var discoveryInfo exttypes.DiscoveryInfo
						json.Unmarshal(discoveryInfoJSON, &discoveryInfo)
						
						log.Printf("📝 Cataloging discovered resource: %s %s", method, resourceURL)
						bazaarCatalog.CatalogResource(
							resourceURL,
							method,
							version,
							&discoveryInfo,
							requirements,
						)
					}
				}
			}
			return nil
		}).
		OnBeforeSettle(func(ctx x402.FacilitatorSettleContext) (*x402.FacilitatorBeforeHookResult, error) {
			// Hook 3: Validate payment was previously verified
			paymentHash := fmt.Sprintf("v%d-%s-%s",
				ctx.Payload.GetVersion(),
				ctx.Payload.GetScheme(),
				ctx.Payload.GetNetwork())
			verificationMutex.RLock()
			verificationTimestamp, verified := verifiedPayments[paymentHash]
			verificationMutex.RUnlock()
			
			if !verified {
				return &x402.FacilitatorBeforeHookResult{
					Abort:  true,
					Reason: "Payment must be verified before settlement",
				}, nil
			}
			
			// Check verification isn't too old (5 minute timeout)
			age := time.Now().Unix() - verificationTimestamp
			if age > 5*60 {
				verificationMutex.Lock()
				delete(verifiedPayments, paymentHash)
				verificationMutex.Unlock()
				
				return &x402.FacilitatorBeforeHookResult{
					Abort:  true,
					Reason: "Payment verification expired (must settle within 5 minutes)",
				}, nil
			}
			
			return nil, nil
		}).
		OnAfterSettle(func(ctx x402.FacilitatorSettleResultContext) error {
			// Hook 4: Clean up verified payment tracking after successful settlement
			paymentHash := fmt.Sprintf("v%d-%s-%s",
				ctx.Payload.GetVersion(),
				ctx.Payload.GetScheme(),
				ctx.Payload.GetNetwork())
			verificationMutex.Lock()
			delete(verifiedPayments, paymentHash)
			verificationMutex.Unlock()
			
			if ctx.Result.Success {
				log.Printf("✅ Settlement completed: %s", ctx.Result.Transaction)
			}
			return nil
		}).
		OnSettleFailure(func(ctx x402.FacilitatorSettleFailureContext) (*x402.FacilitatorSettleFailureHookResult, error) {
			// Hook 5: Clean up verified payment tracking on failure too
			paymentHash := fmt.Sprintf("v%d-%s-%s",
				ctx.Payload.GetVersion(),
				ctx.Payload.GetScheme(),
				ctx.Payload.GetNetwork())
			verificationMutex.Lock()
			delete(verifiedPayments, paymentHash)
			verificationMutex.Unlock()
			
			log.Printf("❌ Settlement failed: %v", ctx.Error)
			return nil, nil
		})

	// Set up Gin router
	gin.SetMode(gin.ReleaseMode)
	router := gin.New()
	router.Use(gin.Recovery())

	// POST /verify - Verify a payment against requirements
	// Note: Payment tracking and bazaar discovery are handled by lifecycle hooks
	router.POST("/verify", func(c *gin.Context) {
		// First, peek at the version to determine which struct to use
		var versionCheck struct {
			X402Version int `json:"x402Version"`
		}

		// Read body into buffer so we can parse it twice
		bodyBytes, err := c.GetRawData()
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": fmt.Sprintf("Failed to read request body: %v", err),
			})
			return
		}

		// Parse version
		if err := json.Unmarshal(bodyBytes, &versionCheck); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": fmt.Sprintf("Failed to parse version: %v", err),
			})
			return
		}

		var req VerifyRequest
		if err := json.Unmarshal(bodyBytes, &req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": fmt.Sprintf("Invalid request: %v", err),
			})
			return
		}

		// Hooks will automatically:
		// - Track verified payment (OnAfterVerify)
		// - Extract and catalog discovery info (OnAfterVerify)
		
		// Marshal to bytes for facilitator API (network boundary)
		payloadBytes, err := json.Marshal(req.PaymentPayload)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
			return
		}
		
		requirementsBytes, err := json.Marshal(req.PaymentRequirements)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid requirements"})
			return
		}
		
		response, err := facilitator.Verify(
			context.Background(),
			payloadBytes,
			requirementsBytes,
		)
		if err != nil {
			log.Printf("Verify error: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": err.Error(),
			})
			return
		}

		c.JSON(http.StatusOK, response)
	})

	// POST /settle - Settle a payment on-chain
	// Note: Verification validation and cleanup are handled by lifecycle hooks
	router.POST("/settle", func(c *gin.Context) {
		// First, peek at the version to determine which struct to use
		var versionCheck struct {
			X402Version int `json:"x402Version"`
		}

		// Read body into buffer so we can parse it twice
		bodyBytes, err := c.GetRawData()
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": fmt.Sprintf("Failed to read request body: %v", err),
			})
			return
		}

		// Debug: Log raw request body
		log.Printf("🔍 [FACILITATOR SETTLE] Received raw body: %s", string(bodyBytes))

		// Parse version
		if err := json.Unmarshal(bodyBytes, &versionCheck); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": fmt.Sprintf("Failed to parse version: %v", err),
			})
			return
		}

		var req SettleRequest
		if err := json.Unmarshal(bodyBytes, &req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": fmt.Sprintf("Invalid request: %v", err),
			})
			return
		}

		// Debug: Log parsed request
		log.Printf("🔍 [FACILITATOR SETTLE] Parsed request:")
		log.Printf("   X402Version: %d", req.X402Version)
		log.Printf("   PaymentPayload: %+v", req.PaymentPayload)
		log.Printf("   PaymentRequirements: %+v", req.PaymentRequirements)

		// Marshal to bytes for facilitator API (network boundary)
		payloadBytes, err := json.Marshal(req.PaymentPayload)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
			return
		}
		
		requirementsBytes, err := json.Marshal(req.PaymentRequirements)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid requirements"})
			return
		}

		response, err := facilitator.Settle(
			context.Background(),
			payloadBytes,
			requirementsBytes,
		)

		// Debug: Log response
		log.Printf("🔍 [FACILITATOR SETTLE] Response: %+v", response)
		log.Printf("🔍 [FACILITATOR SETTLE] Error: %v", err)
		if err != nil {
			log.Printf("Settle error: %v", err)
			
			// Check if this was an abort from hook
			if strings.Contains(err.Error(), "settlement aborted:") {
				// Return a proper SettleResponse instead of 500 error
				c.JSON(http.StatusOK, x402.SettleResponse{
					Success:     false,
					ErrorReason: strings.TrimPrefix(err.Error(), "settlement aborted: "),
					Network:     x402.Network(req.PaymentPayload.Accepted.Network),
				})
				return
			}
			
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": err.Error(),
			})
			return
		}

		c.JSON(http.StatusOK, response)
	})

	// GET /supported - Get supported payment kinds and extensions
	router.GET("/supported", func(c *gin.Context) {
		response := x402.SupportedResponse{
			Kinds: []x402.SupportedKind{
				// EVM V2
				{
					X402Version: 2,
					Scheme:      Scheme,
					Network:     Network,
					Extra:       map[string]interface{}{},
				},
				// EVM V1
				{
					X402Version: 1,
					Scheme:      Scheme,
					Network:     "base-sepolia",
					Extra:       map[string]interface{}{},
				},
				// SVM V2 (Devnet)
				{
					X402Version: 2,
					Scheme:      Scheme,
					Network:     "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1", // Devnet CAIP-2
					Extra: map[string]interface{}{
						"feePayer": svmSigner.GetAddress("solana-devnet").String(),
					},
				},
				// SVM V1 (Devnet)
				{
					X402Version: 1,
					Scheme:      Scheme,
					Network:     "solana-devnet",
					Extra: map[string]interface{}{
						"feePayer": svmSigner.GetAddress("solana-devnet").String(),
					},
				},
			},
			Extensions: []string{exttypes.BAZAAR},
		}

		c.JSON(http.StatusOK, response)
	})

	// GET /discovery/resources - List all discovered resources from bazaar extensions
	router.GET("/discovery/resources", func(c *gin.Context) {
		limit := 100
		if limitParam := c.Query("limit"); limitParam != "" {
			fmt.Sscanf(limitParam, "%d", &limit)
		}

		offset := 0
		if offsetParam := c.Query("offset"); offsetParam != "" {
			fmt.Sscanf(offsetParam, "%d", &offset)
		}

		items, total := bazaarCatalog.GetResources(limit, offset)

		c.JSON(http.StatusOK, gin.H{
			"x402Version": 1,
			"items":       items,
			"pagination": gin.H{
				"limit":  limit,
				"offset": offset,
				"total":  total,
			},
		})
	})

	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":              "ok",
			"network":             Network,
			"facilitator":         "go",
			"version":             "2.0.0",
			"extensions":          []string{exttypes.BAZAAR},
			"discoveredResources": bazaarCatalog.GetCount(),
		})
	})

	// POST /close - Graceful shutdown endpoint
	router.POST("/close", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"message": "Facilitator shutting down gracefully",
		})
		log.Println("Received shutdown request")

		// Give time for response to be sent, then exit
		go func() {
			time.Sleep(100 * time.Millisecond)
			os.Exit(0)
		}()
	})

	// Start the server
	fmt.Printf(`
╔════════════════════════════════════════════════════════╗
║              x402 Go Facilitator                       ║
╠════════════════════════════════════════════════════════╣
║  Server:     http://localhost:%s                      ║
║  Network:    %s                       ║
║  Address:    %s     ║
║  Extensions: bazaar                                    ║
║                                                        ║
║  Endpoints:                                            ║
║  • POST /verify              (verify payment)         ║
║  • POST /settle              (settle payment)         ║
║  • GET  /supported           (get supported kinds)    ║
║  • GET  /discovery/resources (list discovered)        ║
║  • GET  /health              (health check)           ║
║  • POST /close               (shutdown server)        ║
╚════════════════════════════════════════════════════════╝
`, port, Network, evmSigner.GetAddress())

	// Log that facilitator is ready (needed for e2e test discovery)
	log.Println("Facilitator listening")

	// Start server
	if err := router.Run(":" + port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
