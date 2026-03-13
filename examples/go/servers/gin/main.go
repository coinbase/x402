package main

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	x402 "github.com/coinbase/x402/go"
	"github.com/coinbase/x402/go/extensions/eip2612gassponsor"
	"github.com/coinbase/x402/go/extensions/erc20approvalgassponsor"
	x402http "github.com/coinbase/x402/go/http"
	ginmw "github.com/coinbase/x402/go/http/gin"
	evm "github.com/coinbase/x402/go/mechanisms/evm/exact/server"
	"github.com/coinbase/cdp-sdk/go/auth"
	ginfw "github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

const (
	DefaultPort               = "4021"
	CDPFacilitatorBaseURL     = "https://api.cdp.coinbase.com"
	CDPFacilitatorV2Route     = "/platform/v2/x402"
	BaseMainnetNetwork        = "eip155:8453"
	BaseMainnetUSDC           = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
)

type cdpAuthProvider struct {
	apiKeyID     string
	apiKeySecret string
}

func (p *cdpAuthProvider) GetAuthHeaders(_ context.Context) (x402http.AuthHeaders, error) {
	id := p.apiKeyID
	secret := p.apiKeySecret
	if id == "" {
		id = os.Getenv("CDP_API_KEY_ID")
	}
	if secret == "" {
		secret = os.Getenv("CDP_API_KEY_SECRET")
	}
	if id == "" || secret == "" {
		return x402http.AuthHeaders{}, fmt.Errorf("CDP_API_KEY_ID and CDP_API_KEY_SECRET must be set")
	}

	host := strings.TrimPrefix(CDPFacilitatorBaseURL, "https://")
	verifyPath := CDPFacilitatorV2Route + "/verify"
	settlePath := CDPFacilitatorV2Route + "/settle"

	verifyJWT, err := auth.GenerateJWT(auth.JwtOptions{
		KeyID:         id,
		KeySecret:     secret,
		RequestMethod: "POST",
		RequestHost:   host,
		RequestPath:   verifyPath,
	})
	if err != nil {
		return x402http.AuthHeaders{}, fmt.Errorf("failed to generate verify JWT: %w", err)
	}

	settleJWT, err := auth.GenerateJWT(auth.JwtOptions{
		KeyID:         id,
		KeySecret:     secret,
		RequestMethod: "POST",
		RequestHost:   host,
		RequestPath:   settlePath,
	})
	if err != nil {
		return x402http.AuthHeaders{}, fmt.Errorf("failed to generate settle JWT: %w", err)
	}

	correlation := correlationHeader()

	return x402http.AuthHeaders{
		Verify: map[string]string{
			"Authorization":      fmt.Sprintf("Bearer %s", verifyJWT),
			"Correlation-Context": correlation,
		},
		Settle: map[string]string{
			"Authorization":      fmt.Sprintf("Bearer %s", settleJWT),
			"Correlation-Context": correlation,
		},
	}, nil
}

func correlationHeader() string {
	data := map[string]string{
		"sdk_language": "go",
		"source":       "x402",
	}
	var pairs []string
	for k, v := range data {
		pairs = append(pairs, fmt.Sprintf("%s=%s", k, url.QueryEscape(v)))
	}
	return strings.Join(pairs, ",")
}

func main() {
	godotenv.Load()

	evmAddress := os.Getenv("EVM_PAYEE_ADDRESS")
	if evmAddress == "" {
		fmt.Println("EVM_PAYEE_ADDRESS environment variable is required")
		os.Exit(1)
	}

	facilitatorURL := os.Getenv("FACILITATOR_URL")
	if facilitatorURL == "" {
		facilitatorURL = CDPFacilitatorBaseURL + CDPFacilitatorV2Route
	}

	evmNetwork := x402.Network(BaseMainnetNetwork)

	r := ginfw.Default()

	facilitatorClient := x402http.NewHTTPFacilitatorClient(&x402http.FacilitatorConfig{
		URL:          facilitatorURL,
		AuthProvider: &cdpAuthProvider{},
	})

	eip2612Ext := eip2612gassponsor.DeclareEip2612GasSponsoringExtension()
	erc20Ext := erc20approvalgassponsor.DeclareExtension()

	routes := x402http.RoutesConfig{
		"GET /protected-currency": {
			Accepts: x402http.PaymentOptions{
				{
					Scheme:  "exact",
					Price:   "$0.001",
					Network: evmNetwork,
					PayTo:   evmAddress,
				},
			},
			Description: "Currency shorthand pricing",
			MimeType:    "application/json",
		},
		"GET /protected-eip3009": {
			Accepts: x402http.PaymentOptions{
				{
					Scheme:  "exact",
					Network: evmNetwork,
					PayTo:   evmAddress,
					Price: map[string]interface{}{
						"amount": "1000",
						"asset":  BaseMainnetUSDC,
					},
				},
			},
			Description: "EIP-3009 long-form pricing (USDC transferWithAuthorization)",
			MimeType:    "application/json",
		},
		"GET /protected-eip2612": {
			Accepts: x402http.PaymentOptions{
				{
					Scheme:  "exact",
					Network: evmNetwork,
					PayTo:   evmAddress,
					Price: map[string]interface{}{
						"amount": "1000",
						"asset":  BaseMainnetUSDC,
						"extra": map[string]interface{}{
							"assetTransferMethod": "permit2",
						},
					},
				},
			},
			Extensions: eip2612Ext,
			Description: "Permit2 with EIP-2612 gas sponsorship",
			MimeType:    "application/json",
		},
		"GET /protected-erc20": {
			Accepts: x402http.PaymentOptions{
				{
					Scheme:  "exact",
					Network: evmNetwork,
					PayTo:   evmAddress,
					Price: map[string]interface{}{
						"amount": "1000",
						"asset":  BaseMainnetUSDC,
						"extra": map[string]interface{}{
							"assetTransferMethod": "permit2",
						},
					},
				},
			},
			Extensions: erc20Ext,
			Description: "Permit2 with generic ERC-20 approval gas sponsorship",
			MimeType:    "application/json",
		},
	}

	r.Use(ginmw.X402Payment(ginmw.Config{
		Routes:                 routes,
		Facilitator:            facilitatorClient,
		Schemes: []ginmw.SchemeConfig{
			{Network: evmNetwork, Server: evm.NewExactEvmScheme()},
		},
		SyncFacilitatorOnStart: true,
		Timeout:                30 * time.Second,
	}))

	r.GET("/protected-currency", func(c *ginfw.Context) {
		c.JSON(http.StatusOK, ginfw.H{
			"message":   "Currency shorthand endpoint",
			"timestamp": time.Now().Format(time.RFC3339),
		})
	})

	r.GET("/protected-eip3009", func(c *ginfw.Context) {
		c.JSON(http.StatusOK, ginfw.H{
			"message":   "EIP-3009 endpoint",
			"timestamp": time.Now().Format(time.RFC3339),
		})
	})

	r.GET("/protected-eip2612", func(c *ginfw.Context) {
		c.JSON(http.StatusOK, ginfw.H{
			"message":   "EIP-2612 gas-sponsored endpoint",
			"timestamp": time.Now().Format(time.RFC3339),
		})
	})

	r.GET("/protected-erc20", func(c *ginfw.Context) {
		c.JSON(http.StatusOK, ginfw.H{
			"message":   "ERC-20 approval gas-sponsored endpoint",
			"timestamp": time.Now().Format(time.RFC3339),
		})
	})

	r.GET("/health", func(c *ginfw.Context) {
		c.JSON(http.StatusOK, ginfw.H{
			"status":  "ok",
			"network": BaseMainnetNetwork,
		})
	})

	fmt.Printf("Server listening at http://localhost:%s\n", DefaultPort)
	if err := r.Run(":" + DefaultPort); err != nil {
		fmt.Printf("Error starting server: %v\n", err)
		os.Exit(1)
	}
}
