package gin

import (
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/coinbase/x402/go/pkg/facilitatorclient"
	"github.com/coinbase/x402/go/pkg/shared"
	"github.com/coinbase/x402/go/pkg/types"
)

const x402Version = 1

// PaymentMiddlewareOptions is the options for the PaymentMiddleware.
type PaymentMiddlewareOptions struct {
	Description       string
	MimeType          string
	MaxTimeoutSeconds int
	OutputSchema      *json.RawMessage
	FacilitatorURL    string
	Testnet           bool
	CustomPaywallHTML string
	Resource          string
	ResourceRootURL   string
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

// WithFacilitatorURL is an option for the PaymentMiddleware to set the facilitator URL.
func WithFacilitatorURL(facilitatorURL string) Options {
	return func(options *PaymentMiddlewareOptions) {
		options.FacilitatorURL = facilitatorURL
	}
}

// WithTestnet is an option for the PaymentMiddleware to set the testnet flag.
func WithTestnet(testnet bool) Options {
	return func(options *PaymentMiddlewareOptions) {
		options.Testnet = testnet
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

// PaymentMiddleware is the Gin middleware for the resource server using the x402payment protocol.
// Amount: the decimal denominated amount to charge (ex: 0.01 for 1 cent)
func PaymentMiddleware(amount *big.Float, address string, opts ...Options) gin.HandlerFunc {
	options := &PaymentMiddlewareOptions{
		FacilitatorURL:    facilitatorclient.DefaultFacilitatorURL,
		MaxTimeoutSeconds: 60,
		Testnet:           true,
	}

	for _, opt := range opts {
		opt(options)
	}

	return func(c *gin.Context) {
		var (
			network              = "base"
			usdcAddress          = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
			facilitatorClient    = facilitatorclient.NewFacilitatorClient(options.FacilitatorURL)
			maxAmountRequired, _ = new(big.Float).Mul(amount, big.NewFloat(1e6)).Int(nil)
		)

		if options.Testnet {
			network = "base-sepolia"
			usdcAddress = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
		}

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

		if err := paymentRequirements.SetUSDCInfo(options.Testnet); err != nil {
			fmt.Println("failed to set USDC info:", err)
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{
				"error":       err.Error(),
				"x402Version": x402Version,
			})
		}

		payment := c.GetHeader("X-PAYMENT")
		paymentPayload, err := types.DecodePaymentPayloadFromBase64(payment)
		if err != nil {
			if isWebBrowser {
				html := options.CustomPaywallHTML
				if html == "" {
					paywallHtml, err := shared.GetPaywallHTML(shared.PaywallOptions{
						Amount:              maxAmountRequired,
						PaymentRequirements: paymentRequirements,
						CurrentURL:          paymentRequirements.Resource,
						Testnet:             true,
					})
					if err != nil {
						fmt.Println("failed to get paywall html", err)
						// Don't abort. Simply use default paywall
						html = getPaywallHtml(options)
					} else {
						html = paywallHtml
					}
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
		c.Next()

		// Settle payment
		settleResponse, err := facilitatorClient.Settle(paymentPayload, paymentRequirements)
		if err != nil {
			fmt.Println("Settlement failed:", err)
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
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{
				"error":       err.Error(),
				"x402Version": x402Version,
			})
		}

		c.Header("X-PAYMENT-RESPONSE", settleResponseHeader)
	}
}

// getPaywallHtml is the default paywall HTML for the PaymentMiddleware.
func getPaywallHtml(_ *PaymentMiddlewareOptions) string {
	return "<html><body>Payment Required</body></html>"
}
