package main

import (
	"encoding/json"
	"fmt"
	"math/big"
	"net/http/httputil"
	"net/url"
	"os"

	x402gin "github.com/coinbase/x402/pkg/x402/gin"
	"github.com/gin-gonic/gin"
)

func main() {
	gin.SetMode(gin.ReleaseMode)
	argv := os.Args[1:]

	if len(argv) == 0 {
		fmt.Println("Please provide a config file path as an argument")
		os.Exit(1)
	}

	config, err := loadConfig(argv[0])
	if err != nil {
		fmt.Printf("Error loading config: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("Running with config: %+v\n", config)

	r := gin.Default()

	r.Any("/*path",
		x402gin.PaymentMiddleware(
			big.NewFloat(config.Amount),
			config.PayToAddress,
			x402gin.WithFacilitatorURL(config.FacilitatorURL),
			x402gin.WithResource(config.TargetURL),
			x402gin.WithTestnet(config.Testnet),
			x402gin.WithDescription(config.Description),
			x402gin.WithMimeType(config.MimeType),
			x402gin.WithMaxDeadlineSeconds(config.MaxDeadlineSeconds),
		),
		proxyHandler(config.TargetURL, config.Headers))

	err = r.Run(":4021")
	if err != nil {
		fmt.Printf("Error running server: %v\n", err)
		os.Exit(1)
	}
}

type ProxyConfig struct {
	TargetURL          string            `json:"targetURL"`
	Amount             float64           `json:"amount"`
	PayToAddress       string            `json:"payToAddress"`
	Description        string            `json:"description"`
	FacilitatorURL     string            `json:"facilitatorURL"`
	MimeType           string            `json:"mimeType"`
	MaxDeadlineSeconds int               `json:"maxDeadlineSeconds"`
	Testnet            bool              `json:"testnet"`
	Headers            map[string]string `json:"headers"`
}

func proxyHandler(targetURL string, headers map[string]string) gin.HandlerFunc {
	fmt.Println("Proxying to:", targetURL)

	target, err := url.Parse(targetURL)
	if err != nil {
		fmt.Println("Error parsing target URL:", err)
		panic(err)
	}

	proxy := httputil.NewSingleHostReverseProxy(target)

	return func(c *gin.Context) {
		for k, v := range headers {
			c.Request.Header.Set(k, v)
		}
		proxy.ServeHTTP(c.Writer, c.Request)
	}
}

func loadConfig(configPath string) (*ProxyConfig, error) {
	config := &ProxyConfig{
		// default values
		FacilitatorURL:     "https://x402.org/facilitator",
		Testnet:            true,
		MaxDeadlineSeconds: 60,
	}

	data, err := os.ReadFile(configPath)
	if err != nil {
		return nil, fmt.Errorf("error reading config file: %w", err)
	}

	if err := json.Unmarshal(data, &config); err != nil {
		return nil, fmt.Errorf("error parsing config file: %w", err)
	}

	if config.TargetURL == "" || config.Amount == 0 || config.PayToAddress == "" {
		return nil, fmt.Errorf("config is missing required fields")
	}

	return config, nil
}
