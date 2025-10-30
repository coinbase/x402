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
	"github.com/coinbase/x402/go/extensions/bazaar"
	exttypes "github.com/coinbase/x402/go/extensions/types"
	v1 "github.com/coinbase/x402/go/extensions/v1"
	"github.com/coinbase/x402/go/mechanisms/evm"
	evmv1 "github.com/coinbase/x402/go/mechanisms/evm/v1"
	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/common/math"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"
	"github.com/ethereum/go-ethereum/signer/core/apitypes"
	"github.com/gin-gonic/gin"
)

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
	domain evm.TypedDataDomain,
	types map[string][]evm.TypedDataField,
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

func (s *realFacilitatorEvmSigner) WaitForTransactionReceipt(txHash string) (*evm.TransactionReceipt, error) {
	ctx := context.Background()
	hash := common.HexToHash(txHash)

	// Poll for receipt
	for i := 0; i < 30; i++ { // 30 seconds timeout
		receipt, err := s.client.TransactionReceipt(ctx, hash)
		if err == nil && receipt != nil {
			return &evm.TransactionReceipt{
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

// ============================================================================
// Discovery Resources Storage
// ============================================================================

// DiscoveredResource represents a discovered x402-enabled resource
type DiscoveredResource struct {
	Resource      string                     `json:"resource"`
	Type          string                     `json:"type"`
	X402Version   int                        `json:"x402Version"`
	Accepts       []x402.PaymentRequirements `json:"accepts"`
	DiscoveryInfo *exttypes.DiscoveryInfo    `json:"discoveryInfo,omitempty"`
	LastUpdated   string                     `json:"lastUpdated"`
	Metadata      map[string]interface{}     `json:"metadata,omitempty"`
}

var (
	discoveredResources = make(map[string]DiscoveredResource)
	discoveryMutex      = &sync.RWMutex{}
	verifiedPayments    = make(map[string]int64)
	verificationMutex   = &sync.RWMutex{}
)

// createPaymentHash creates a hash for tracking payments
func createPaymentHash(paymentPayload x402.PaymentPayload) string {
	data, _ := json.Marshal(paymentPayload)
	hash := sha256.Sum256(data)
	return hex.EncodeToString(hash[:])
}

// addDiscoveredResource stores a discovered resource
func addDiscoveredResource(resource string, version int, accepts []x402.PaymentRequirements, info *exttypes.DiscoveryInfo) {
	discoveryMutex.Lock()
	defer discoveryMutex.Unlock()

	discoveredResources[resource] = DiscoveredResource{
		Resource:      resource,
		Type:          "http",
		X402Version:   version,
		Accepts:       accepts,
		DiscoveryInfo: info,
		LastUpdated:   time.Now().Format(time.RFC3339),
		Metadata:      make(map[string]interface{}),
	}
}

// getDiscoveredResources returns all discovered resources with pagination
func getDiscoveredResources(limit, offset int) ([]DiscoveredResource, int) {
	discoveryMutex.RLock()
	defer discoveryMutex.RUnlock()

	all := make([]DiscoveredResource, 0, len(discoveredResources))
	for _, r := range discoveredResources {
		all = append(all, r)
	}

	total := len(all)
	if offset >= total {
		return []DiscoveredResource{}, total
	}

	end := offset + limit
	if end > total {
		end = total
	}

	return all[offset:end], total
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

	// Get RPC URL from environment, default to Base Sepolia public RPC
	rpcURL := os.Getenv("EVM_RPC_URL")
	if rpcURL == "" {
		rpcURL = "https://sepolia.base.org"
		log.Printf("⚠️  Using default RPC URL: %s", rpcURL)
	} else {
		log.Printf("✅ Using RPC URL from EVM_RPC_URL: %s", rpcURL)
	}

	// Initialize the real blockchain signer
	signer, err := newRealFacilitatorEvmSigner(evmPrivateKey, rpcURL)
	if err != nil {
		log.Fatalf("Failed to create signer: %v", err)
	}

	chainID, _ := signer.GetChainID()
	log.Printf("Facilitator account: %s", signer.GetAddress())
	log.Printf("Connected to chain ID: %s (expected: 84532 for Base Sepolia)", chainID.String())

	// Initialize the x402 Facilitator with EVM support
	facilitator := x402.Newx402Facilitator()

	// Register the EVM scheme handler for v2
	evmFacilitator := evm.NewExactEvmFacilitator(signer)
	facilitator.RegisterScheme(Network, evmFacilitator)

	// Register the EVM v1 scheme handler for base-sepolia
	evmFacilitatorV1 := evmv1.NewExactEvmFacilitatorV1(signer)
	facilitator.RegisterSchemeV1("base-sepolia", evmFacilitatorV1)

	// Register the Bazaar discovery extension
	facilitator.RegisterExtension(exttypes.BAZAAR)

	// Set up Gin router
	gin.SetMode(gin.ReleaseMode)
	router := gin.New()
	router.Use(gin.Recovery())

	// POST /verify - Verify a payment against requirements
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

		// No transformation needed - v1 mechanisms will read MaxAmountRequired field directly

		response, err := facilitator.Verify(
			context.Background(),
			req.PaymentPayload,
			req.PaymentRequirements,
		)
		if err != nil {
			log.Printf("Verify error: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": err.Error(),
			})
			return
		}

		// Track verified payment and extract discovery info if valid
		if response.IsValid {
			paymentHash := createPaymentHash(req.PaymentPayload)
			verificationMutex.Lock()
			verifiedPayments[paymentHash] = time.Now().Unix()
			verificationMutex.Unlock()

			// Extract and store discovery info if present
			// For v2: extensions are in paymentPayload.Extensions (client copied from PaymentRequired)
			// For v1: discovery info is in paymentRequirements.OutputSchema
			discoveryInfo, err := bazaar.ExtractDiscoveryInfo(req.PaymentPayload, req.PaymentRequirements, true)
			if err != nil {
				log.Printf("Warning: Failed to extract discovery info: %v", err)
			}

			if discoveryInfo != nil {
				// Try to get resource URL from various sources
				resourceURL := "http://unknown"
				if req.PaymentRequirements.Extra != nil {
					if url, ok := req.PaymentRequirements.Extra["resourceUrl"].(string); ok {
						resourceURL = url
					}
				}

				// For v1, try to extract from the requirements structure
				if resourceURL == "http://unknown" && req.PaymentPayload.X402Version == 1 {
					metadata := v1.ExtractResourceMetadataV1(req.PaymentRequirements)
					if url, ok := metadata["url"]; ok && url != "" {
						resourceURL = url
					}
				}

				// Determine method for logging
				method := "UNKNOWN"
				switch input := discoveryInfo.Input.(type) {
				case exttypes.QueryInput:
					method = string(input.Method)
				case exttypes.BodyInput:
					method = string(input.Method)
				}

				log.Printf("📝 Discovered resource: %s", resourceURL)
				log.Printf("   Method: %s", method)
				log.Printf("   x402 Version: %d", req.PaymentPayload.X402Version)

				addDiscoveredResource(resourceURL, req.PaymentPayload.X402Version, []x402.PaymentRequirements{req.PaymentRequirements}, discoveryInfo)
			}
		}

		c.JSON(http.StatusOK, response)
	})

	// POST /settle - Settle a payment on-chain
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

		// Validate that payment was previously verified
		paymentHash := createPaymentHash(req.PaymentPayload)
		verificationMutex.RLock()
		verificationTimestamp, verified := verifiedPayments[paymentHash]
		verificationMutex.RUnlock()

		if !verified {
			c.JSON(http.StatusOK, x402.SettleResponse{
				Success:     false,
				ErrorReason: "Payment must be verified before settlement",
				Network:     req.PaymentPayload.Network,
			})
			return
		}

		// Check verification isn't too old (5 minute timeout)
		age := time.Now().Unix() - verificationTimestamp
		if age > 5*60 {
			verificationMutex.Lock()
			delete(verifiedPayments, paymentHash)
			verificationMutex.Unlock()

			c.JSON(http.StatusOK, x402.SettleResponse{
				Success:     false,
				ErrorReason: "Payment verification expired (must settle within 5 minutes)",
				Network:     req.PaymentPayload.Network,
			})
			return
		}

		// No transformation needed - v1 mechanisms will read MaxAmountRequired field directly

		response, err := facilitator.Settle(
			context.Background(),
			req.PaymentPayload,
			req.PaymentRequirements,
		)

		// Clean up verified payment after settlement (successful or not)
		verificationMutex.Lock()
		delete(verifiedPayments, paymentHash)
		verificationMutex.Unlock()

		// Debug: Log response
		log.Printf("🔍 [FACILITATOR SETTLE] Response: %+v", response)
		log.Printf("🔍 [FACILITATOR SETTLE] Error: %v", err)
		if err != nil {
			log.Printf("Settle error: %v", err)
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
				{
					X402Version: 2,
					Scheme:      Scheme,
					Network:     Network,
					Extra:       map[string]interface{}{},
				},
				{
					X402Version: 1,
					Scheme:      Scheme,
					Network:     "base-sepolia",
					Extra:       map[string]interface{}{},
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

		items, total := getDiscoveredResources(limit, offset)

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

	// GET /health - Health check endpoint
	router.GET("/health", func(c *gin.Context) {
		discoveryMutex.RLock()
		resourceCount := len(discoveredResources)
		discoveryMutex.RUnlock()

		c.JSON(http.StatusOK, gin.H{
			"status":              "ok",
			"network":             Network,
			"facilitator":         "go",
			"version":             "2.0.0",
			"extensions":          []string{exttypes.BAZAAR},
			"discoveredResources": resourceCount,
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
`, port, Network, signer.GetAddress())

	// Log that facilitator is ready (needed for e2e test discovery)
	log.Println("Facilitator listening")

	// Start server
	if err := router.Run(":" + port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
