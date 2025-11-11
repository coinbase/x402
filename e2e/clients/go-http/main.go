package main

import (
	"context"
	"crypto/ecdsa"
	"encoding/json"
	"fmt"
	"log"
	"math/big"
	"net/http"
	"os"
	"strings"

	x402 "github.com/coinbase/x402/go"
	x402http "github.com/coinbase/x402/go/http"
	"github.com/coinbase/x402/go/mechanisms/evm"
	evmv1 "github.com/coinbase/x402/go/mechanisms/evm/v1"
	"github.com/coinbase/x402/go/mechanisms/svm"
	svmv1 "github.com/coinbase/x402/go/mechanisms/svm/v1"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/common/math"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/signer/core/apitypes"
	solana "github.com/gagliardetto/solana-go"
)

// Result structure for e2e test output
type Result struct {
	Success         bool        `json:"success"`
	Data            interface{} `json:"data,omitempty"`
	StatusCode      int         `json:"status_code,omitempty"`
	PaymentResponse interface{} `json:"payment_response,omitempty"`
	Error           string      `json:"error,omitempty"`
}

// Real EVM signer for client using EIP-712
type clientEvmSigner struct {
	privateKey *ecdsa.PrivateKey
	address    common.Address
}

func newClientEvmSigner(privateKeyHex string) (*clientEvmSigner, error) {
	// Remove 0x prefix if present
	privateKeyHex = strings.TrimPrefix(privateKeyHex, "0x")

	privateKey, err := crypto.HexToECDSA(privateKeyHex)
	if err != nil {
		return nil, fmt.Errorf("failed to parse private key: %w", err)
	}

	address := crypto.PubkeyToAddress(privateKey.PublicKey)

	return &clientEvmSigner{
		privateKey: privateKey,
		address:    address,
	}, nil
}

func (s *clientEvmSigner) Address() string {
	return s.address.Hex()
}

func (s *clientEvmSigner) SignTypedData(
	domain evm.TypedDataDomain,
	types map[string][]evm.TypedDataField,
	primaryType string,
	message map[string]interface{},
) ([]byte, error) {
	// Convert our types to go-ethereum's EIP-712 types
	typedData := apitypes.TypedData{
		Types:       make(apitypes.Types),
		PrimaryType: primaryType,
		Domain: apitypes.TypedDataDomain{
			Name:              getStringFromInterface(domain.Name),
			Version:           getStringFromInterface(domain.Version),
			ChainId:           getBigIntFromInterface(domain.ChainID),
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

	// Add EIP712Domain type if not present
	if _, exists := typedData.Types["EIP712Domain"]; !exists {
		typedData.Types["EIP712Domain"] = []apitypes.Type{
			{Name: "name", Type: "string"},
			{Name: "version", Type: "string"},
			{Name: "chainId", Type: "uint256"},
			{Name: "verifyingContract", Type: "address"},
		}
	}

	// Sign the typed data
	dataHash, err := typedData.HashStruct(typedData.PrimaryType, typedData.Message)
	if err != nil {
		return nil, fmt.Errorf("failed to hash struct: %w", err)
	}

	domainSeparator, err := typedData.HashStruct("EIP712Domain", typedData.Domain.Map())
	if err != nil {
		return nil, fmt.Errorf("failed to hash domain: %w", err)
	}

	// Create the digest to sign
	rawData := []byte{0x19, 0x01}
	rawData = append(rawData, domainSeparator...)
	rawData = append(rawData, dataHash...)
	digest := crypto.Keccak256(rawData)

	// Sign the digest
	signature, err := crypto.Sign(digest, s.privateKey)
	if err != nil {
		return nil, fmt.Errorf("failed to sign: %w", err)
	}

	// Adjust v value for Ethereum (27 or 28)
	signature[64] += 27

	return signature, nil
}

// Helper functions to convert interface{} to specific types
func getStringFromInterface(v interface{}) string {
	if v == nil {
		return ""
	}
	if s, ok := v.(string); ok {
		return s
	}
	return fmt.Sprintf("%v", v)
}

func getBigIntFromInterface(v interface{}) *math.HexOrDecimal256 {
	if v == nil {
		return nil
	}
	switch val := v.(type) {
	case *big.Int:
		return (*math.HexOrDecimal256)(val)
	case string:
		n, _ := new(big.Int).SetString(val, 10)
		return (*math.HexOrDecimal256)(n)
	case int64:
		return (*math.HexOrDecimal256)(big.NewInt(val))
	case float64:
		return (*math.HexOrDecimal256)(big.NewInt(int64(val)))
	default:
		return nil
	}
}

// Real SVM signer for client
type clientSvmSigner struct {
	privateKey solana.PrivateKey
}

func newClientSvmSigner(privateKeyBase58 string) (*clientSvmSigner, error) {
	privateKey, err := solana.PrivateKeyFromBase58(privateKeyBase58)
	if err != nil {
		return nil, fmt.Errorf("failed to parse Solana private key: %w", err)
	}

	return &clientSvmSigner{
		privateKey: privateKey,
	}, nil
}

func (s *clientSvmSigner) Address() solana.PublicKey {
	return s.privateKey.PublicKey()
}

func (s *clientSvmSigner) SignTransaction(tx *solana.Transaction) error {
	// Partially sign - only sign for our own key
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

func main() {
	// Get configuration from environment
	serverURL := os.Getenv("RESOURCE_SERVER_URL")
	if serverURL == "" {
		log.Fatal("RESOURCE_SERVER_URL is required")
	}

	endpointPath := os.Getenv("ENDPOINT_PATH")
	if endpointPath == "" {
		endpointPath = "/protected"
	}

	evmPrivateKey := os.Getenv("EVM_PRIVATE_KEY")
	if evmPrivateKey == "" {
		log.Fatal("❌ EVM_PRIVATE_KEY environment variable is required")
	}

	svmPrivateKey := os.Getenv("SVM_PRIVATE_KEY")
	if svmPrivateKey == "" {
		log.Fatal("❌ SVM_PRIVATE_KEY environment variable is required")
	}

	// Create EVM signer
	evmSigner, err := newClientEvmSigner(evmPrivateKey)
	if err != nil {
		outputError(fmt.Sprintf("Failed to create EVM signer: %v", err))
		return
	}

	// Create SVM signer
	svmSigner, err := newClientSvmSigner(svmPrivateKey)
	if err != nil {
		outputError(fmt.Sprintf("Failed to create SVM signer: %v", err))
		return
	}

	// Create x402 client with both EVM and SVM support
	x402Client := x402.Newx402Client()

	// Register EVM v2 client for all EIP155 networks
	evmClient := evm.NewExactEvmClient(evmSigner)
	x402Client.RegisterScheme("eip155:*", evmClient)

	// Register EVM v1 client for base-sepolia and base (v1 network names)
	evmClientV1 := evmv1.NewExactEvmClientV1(evmSigner)
	x402Client.RegisterSchemeV1("base-sepolia", evmClientV1)
	x402Client.RegisterSchemeV1("base", evmClientV1)

	// Register SVM v2 client for Solana networks
	svmClient := svm.NewExactSvmClient(svmSigner)
	x402Client.RegisterScheme("solana:*", svmClient)

	// Register SVM v1 client for solana networks (v1 network names)
	svmClientV1 := svmv1.NewExactSvmClientV1(svmSigner)
	x402Client.RegisterSchemeV1("solana-devnet", svmClientV1)
	x402Client.RegisterSchemeV1("solana", svmClientV1)

	// Create HTTP client wrapper
	httpClient := x402http.Newx402HTTPClient(x402Client)

	// Wrap standard HTTP client with payment handling
	client := x402http.WrapHTTPClientWithPayment(http.DefaultClient, httpClient)

	// Make the request
	url := serverURL + endpointPath
	ctx := context.Background()

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		outputError(fmt.Sprintf("Failed to create request: %v", err))
		return
	}

	// Perform the request (payment will be handled automatically if needed)
	resp, err := client.Do(req)
	if err != nil {
		outputError(fmt.Sprintf("Request failed: %v", err))
		return
	}
	defer resp.Body.Close()

	// Read response body
	var responseData interface{}
	if err := json.NewDecoder(resp.Body).Decode(&responseData); err != nil {
		outputError(fmt.Sprintf("Failed to decode response: %v", err))
		return
	}

	// Extract payment response from headers if present
	var paymentResponse interface{}
	if paymentHeader := resp.Header.Get("PAYMENT-RESPONSE"); paymentHeader != "" {
		settleResp, err := httpClient.GetPaymentSettleResponse(map[string]string{
			"PAYMENT-RESPONSE": paymentHeader,
		})
		if err == nil {
			paymentResponse = settleResp
		}
	} else if paymentHeader := resp.Header.Get("X-PAYMENT-RESPONSE"); paymentHeader != "" {
		settleResp, err := httpClient.GetPaymentSettleResponse(map[string]string{
			"X-PAYMENT-RESPONSE": paymentHeader,
		})
		if err == nil {
			paymentResponse = settleResp
		}
	}

	// Check if payment was successful (if a payment was required)
	success := true
	if resp.StatusCode == 402 {
		// Payment was required but we got a 402, so payment failed
		success = false
	} else if settleResp, ok := paymentResponse.(*x402.SettleResponse); ok && paymentResponse != nil {
		// Payment was attempted, check if it succeeded
		success = settleResp.Success
	}

	// Output result
	result := Result{
		Success:         success,
		Data:            responseData,
		StatusCode:      resp.StatusCode,
		PaymentResponse: paymentResponse,
	}

	outputResult(result)
}

func outputResult(result Result) {
	data, err := json.Marshal(result)
	if err != nil {
		log.Fatalf("Failed to marshal result: %v", err)
	}
	fmt.Println(string(data))
	os.Exit(0)
}

func outputError(errorMsg string) {
	result := Result{
		Success: false,
		Error:   errorMsg,
	}
	data, _ := json.Marshal(result)
	fmt.Println(string(data))
	os.Exit(1)
}
