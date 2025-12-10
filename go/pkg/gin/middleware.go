package gin

import (
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/coinbase/x402/go/pkg/facilitatorclient"
	"github.com/coinbase/x402/go/pkg/types"
)

const x402Version = 1

// PaymentMiddlewareOptions is the options for the PaymentMiddleware.
type PaymentMiddlewareOptions struct {
	Description       string
	MimeType          string
	MaxTimeoutSeconds int
	OutputSchema      *json.RawMessage
	FacilitatorConfig *types.FacilitatorConfig
	CustomPaywallHTML string
	Resource          string
	ResourceRootURL   string
	Network           string
}

// Options is the type for the options for the PaymentMiddleware.
type Options func(*PaymentMiddlewareOptions)

// WithDescription is an option for the PaymentMiddleware to set the description.
func WithDescription(description string) Options {
	return func(options *PaymentMiddlewareOptions) {
		options.Description = description
	}
}

// WithMimeType is an option for the PaymentMiddleware to set the mime type.
func WithMimeType(mimeType string) Options {
	return func(options *PaymentMiddlewareOptions) {
		options.MimeType = mimeType
	}
}

// WithMaxDeadlineSeconds is an option for the PaymentMiddleware to set the max timeout seconds.
func WithMaxTimeoutSeconds(maxTimeoutSeconds int) Options {
	return func(options *PaymentMiddlewareOptions) {
		options.MaxTimeoutSeconds = maxTimeoutSeconds
	}
}

// WithOutputSchema is an option for the PaymentMiddleware to set the output schema.
func WithOutputSchema(outputSchema *json.RawMessage) Options {
	return func(options *PaymentMiddlewareOptions) {
		options.OutputSchema = outputSchema
	}
}

// WithFacilitatorConfig is an option for the PaymentMiddleware to set the facilitator config.
func WithFacilitatorConfig(config *types.FacilitatorConfig) Options {
	return func(options *PaymentMiddlewareOptions) {
		options.FacilitatorConfig = config
	}
}

// WithCustomPaywallHTML is an option for the PaymentMiddleware to set the custom paywall HTML.
func WithCustomPaywallHTML(customPaywallHTML string) Options {
	return func(options *PaymentMiddlewareOptions) {
		options.CustomPaywallHTML = customPaywallHTML
	}
}

// WithResource is an option for the PaymentMiddleware to set the resource.
func WithResource(resource string) Options {
	return func(options *PaymentMiddlewareOptions) {
		options.Resource = resource
	}
}

func WithResourceRootURL(resourceRootURL string) Options {
	return func(options *PaymentMiddlewareOptions) {
		options.ResourceRootURL = resourceRootURL
	}
}

// WithNetwork is an option for the PaymentMiddleware to set the network explicitly.
func WithNetwork(network string) Options {
	return func(options *PaymentMiddlewareOptions) {
		options.Network = network
	}
}

type networkConfig struct {
	assetAddress string
	decimals     int
	tokenName    string
}

var supportedNetworks = map[string]networkConfig{
	"base": {
		assetAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
		decimals:     6,
		tokenName:    "USD Coin",
	},
	"base-sepolia": {
		assetAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
		decimals:     6,
		tokenName:    "USDC",
	},
	"bsc": {
		assetAddress: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",
		decimals:     18,
		tokenName:    "USD Coin",
	},
	"bsc-testnet": {
		assetAddress: "0x64544969ed7ebf5f083679233325356ebe738930",
		decimals:     18,
		tokenName:    "USDC",
	},
}

// PaymentMiddleware is the Gin middleware for the resource server using the x402payment protocol.
// Amount: the decimal denominated amount to charge (ex: 0.01 for 1 cent)
func PaymentMiddleware(amount *big.Float, address string, opts ...Options) gin.HandlerFunc {
	options := &PaymentMiddlewareOptions{
		FacilitatorConfig: &types.FacilitatorConfig{
			URL: facilitatorclient.DefaultFacilitatorURL,
		},
		MaxTimeoutSeconds: 60,
	}

	for _, opt := range opts {
		opt(options)
	}

	return func(c *gin.Context) {
		var (
			network           string
			usdcAddress       string
			facilitatorClient = facilitatorclient.NewFacilitatorClient(options.FacilitatorConfig)
			maxAmountRequired *big.Int
			netCfg            networkConfig
		)

		network = options.Network
		if network == "" {
			network = "base-sepolia" // default network
		}

		netCfg, exists := supportedNetworks[network]
		if !exists {
			errMsg := fmt.Sprintf("unsupported network: %s", network)
			fmt.Println(errMsg)
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{
				"error":       errMsg,
				"x402Version": x402Version,
			})
			return
		}

		usdcAddress = netCfg.assetAddress
		maxAmountRequired = AmountToAssetUnits(amount, netCfg.decimals)

		fmt.Println("Payment middleware checking request:", c.Request.URL)

		userAgent := c.GetHeader("User-Agent")
		acceptHeader := c.GetHeader("Accept")
		isWebBrowser := strings.Contains(acceptHeader, "text/html") && strings.Contains(userAgent, "Mozilla")
		var resource string
		if options.Resource == "" {
			resource = options.ResourceRootURL + c.Request.URL.Path
		} else {
			resource = options.Resource
		}

		paymentRequirements := &types.PaymentRequirements{
			Scheme:            "exact",
			Network:           network,
			MaxAmountRequired: maxAmountRequired.String(),
			Resource:          resource,
			Description:       options.Description,
			MimeType:          options.MimeType,
			PayTo:             address,
			MaxTimeoutSeconds: options.MaxTimeoutSeconds,
			Asset:             usdcAddress,
			OutputSchema:      options.OutputSchema,
			Extra:             nil,
		}

		if err := paymentRequirements.SetUSDCInfo(netCfg.tokenName); err != nil {
			fmt.Println("failed to set USDC info:", err)
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{
				"error":       err.Error(),
				"x402Version": x402Version,
			})
			return
		}

		payment := c.GetHeader("X-PAYMENT")
		paymentPayload, err := types.DecodePaymentPayloadFromBase64(payment)
		if err != nil {
			if isWebBrowser {
				html := options.CustomPaywallHTML
				if html == "" {
					html = getPaywallHtml(options)
				}
				c.Abort()
				c.Data(http.StatusPaymentRequired, "text/html", []byte(html))
				return
			}

			c.AbortWithStatusJSON(http.StatusPaymentRequired, gin.H{
				"error":       "X-PAYMENT header is required",
				"accepts":     []*types.PaymentRequirements{paymentRequirements},
				"x402Version": x402Version,
			})
			return
		}
		paymentPayload.X402Version = x402Version

		// Verify payment
		response, err := facilitatorClient.Verify(paymentPayload, paymentRequirements)
		if err != nil {
			fmt.Println("failed to verify", err)
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{
				"error":       err.Error(),
				"x402Version": x402Version,
			})
			return
		}

		if !response.IsValid {
			fmt.Println("Invalid payment: ", response.InvalidReason)
			c.AbortWithStatusJSON(http.StatusPaymentRequired, gin.H{
				"error":       response.InvalidReason,
				"accepts":     []*types.PaymentRequirements{paymentRequirements},
				"x402Version": x402Version,
			})
			return
		}

		fmt.Println("Payment verified, proceeding")

		// Create a custom response writer to intercept the response
		writer := &responseWriter{
			ResponseWriter: c.Writer,
			body:           &strings.Builder{},
			statusCode:     http.StatusOK,
		}
		c.Writer = writer

		// Execute the handler
		c.Next()

		// Check if the handler was aborted
		if c.IsAborted() {
			return
		}

		// Settle payment
		settleResponse, err := facilitatorClient.Settle(paymentPayload, paymentRequirements)
		if err != nil {
			fmt.Println("Settlement failed:", err)
			// Reset the response writer
			c.Writer = writer.ResponseWriter
			c.AbortWithStatusJSON(http.StatusPaymentRequired, gin.H{
				"error":       err.Error(),
				"accepts":     []*types.PaymentRequirements{paymentRequirements},
				"x402Version": x402Version,
			})
			return
		}

		settleResponseHeader, err := settleResponse.EncodeToBase64String()
		if err != nil {
			fmt.Println("Settle Header Encoding failed:", err)
			// Reset the response writer
			c.Writer = writer.ResponseWriter
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{
				"error":       err.Error(),
				"x402Version": x402Version,
			})
			return
		}

		// Write the original response with the settlement header
		c.Header("X-PAYMENT-RESPONSE", settleResponseHeader)
		// Reset the response writer to the original
		c.Writer = writer.ResponseWriter
		c.Writer.WriteHeader(writer.statusCode)
		c.Writer.Write([]byte(writer.body.String()))
	}
}

// responseWriter is a custom response writer that captures the response
type responseWriter struct {
	gin.ResponseWriter
	body       *strings.Builder
	statusCode int
	written    bool
}

func (w *responseWriter) WriteHeader(code int) {
	if !w.written {
		w.statusCode = code
		w.written = true
	}
}

func (w *responseWriter) Write(b []byte) (int, error) {
	if !w.written {
		w.WriteHeader(http.StatusOK)
	}
	w.body.Write(b)
	return len(b), nil
}

func (w *responseWriter) WriteString(s string) (int, error) {
	if !w.written {
		w.WriteHeader(http.StatusOK)
	}
	return w.body.WriteString(s)
}

// getPaywallHtml is the default paywall HTML for the PaymentMiddleware.
func getPaywallHtml(_ *PaymentMiddlewareOptions) string {
	return "<html><body>Payment Required</body></html>"
}

// AmountToAssetUnits converts a human-readable amount into base units using the token's decimals.
func AmountToAssetUnits(amount *big.Float, decimals int) *big.Int {
	scale := new(big.Int).Exp(big.NewInt(10), big.NewInt(int64(decimals)), nil)
	scaleFloat := new(big.Float).SetPrec(256).SetInt(scale)
	amountFloat := new(big.Float).SetPrec(256).Set(amount)
	res, _ := new(big.Float).Mul(amountFloat, scaleFloat).Int(nil)
	return res
}
