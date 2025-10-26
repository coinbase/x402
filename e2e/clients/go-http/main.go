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

	x402 "github.com/coinbase/x402-go/v2"
	x402http "github.com/coinbase/x402-go/v2/http"
	"github.com/coinbase/x402-go/v2/mechanisms/evm"
	evmv1 "github.com/coinbase/x402-go/v2/mechanisms/evm/v1"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/common/math"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/signer/core/apitypes"
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
		log.Fatal("EVM_PRIVATE_KEY is required")
	}

	// Create the signer
	signer, err := newClientEvmSigner(evmPrivateKey)
	if err != nil {
		outputError(fmt.Sprintf("Failed to create signer: %v", err))
		return
	}

	// Create x402 HTTP client
	httpClient := x402http.Newx402HTTPClient()

	// Register EVM v2 client for all EIP155 networks
	evmClient := evm.NewExactEvmClient(signer)
	httpClient.RegisterScheme("eip155:*", evmClient)

	// Register EVM v1 client for all EIP155 networks
	evmClientV1 := evmv1.NewExactEvmClientV1(signer)
	httpClient.RegisterSchemeV1("eip155:*", evmClientV1)

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
