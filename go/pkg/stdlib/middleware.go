package stdlib

import (
	"encoding/json"
	"math/big"
	"net/http"
	"strings"

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

// WithResourceRootURL is an option for the PaymentMiddleware to set the resource root URL.
func WithResourceRootURL(resourceRootURL string) Options {
	return func(options *PaymentMiddlewareOptions) {
		options.ResourceRootURL = resourceRootURL
	}
}

// PaymentMiddleware is the Gorilla Mux middleware for the resource server using the x402payment protocol.
// Amount: the decimal denominated amount to charge (ex: 0.01 for 1 cent)
func PaymentMiddleware(amount *big.Float, address string, opts ...Options) func(http.Handler) http.Handler {
	options := &PaymentMiddlewareOptions{
		FacilitatorURL:    facilitatorclient.DefaultFacilitatorURL,
		MaxTimeoutSeconds: 60,
		Testnet:           true,
	}

	for _, opt := range opts {
		opt(options)
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
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

			userAgent := r.Header.Get("User-Agent")
			acceptHeader := r.Header.Get("Accept")
			isWebBrowser := strings.Contains(acceptHeader, "text/html") && strings.Contains(userAgent, "Mozilla")
			var resource string
			if options.Resource == "" {
				resource = options.ResourceRootURL + r.URL.Path
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
				writeErrorResponse(w, http.StatusInternalServerError, err.Error())
				return
			}

			payment := r.Header.Get("X-PAYMENT")
			paymentPayload, err := types.DecodePaymentPayloadFromBase64(payment)
			if err != nil {
				if isWebBrowser {
					html := options.CustomPaywallHTML
					if html == "" {
						html = getPaywallHtml(options)
					}
					http.Error(w, html, http.StatusPaymentRequired)
					return
				}

				writePaymentRequiredResponse(w, "X-PAYMENT header is required", paymentRequirements)
				return
			}
			paymentPayload.X402Version = x402Version

			// Verify payment
			response, err := facilitatorClient.Verify(paymentPayload, paymentRequirements)
			if err != nil {
				writeErrorResponse(w, http.StatusInternalServerError, err.Error())
				return
			}

			if !response.IsValid {
				reason := "invalid reason"
				if response.InvalidReason != nil {
					reason = *response.InvalidReason
				}

				writePaymentRequiredResponse(w, reason, paymentRequirements)
				return
			}

			// Settle payment
			settleResponse, err := facilitatorClient.Settle(paymentPayload, paymentRequirements)
			if err != nil {
				writePaymentRequiredResponse(w, err.Error(), paymentRequirements)
				return
			}

			settleResponseHeader, err := settleResponse.EncodeToBase64String()
			if err != nil {
				writeErrorResponse(w, http.StatusInternalServerError, err.Error())
				return
			}

			w.Header().Set("X-PAYMENT-RESPONSE", settleResponseHeader)

			// Proceed to the next handler
			next.ServeHTTP(w, r)
		})
	}
}

// writeErrorResponse writes an error response with the given status code and message.
func writeErrorResponse(w http.ResponseWriter, statusCode int, errorMsg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"error":       errorMsg,
		"x402Version": x402Version,
	})
}

// writePaymentRequiredResponse writes a payment required response with the given error message and payment requirements.
func writePaymentRequiredResponse(w http.ResponseWriter, errorMsg string, requirements *types.PaymentRequirements) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusPaymentRequired)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"error":       errorMsg,
		"accepts":     []*types.PaymentRequirements{requirements},
		"x402Version": x402Version,
	})
}

// getPaywallHtml is the default paywall HTML for the PaymentMiddleware.
func getPaywallHtml(_ *PaymentMiddlewareOptions) string {
	return "<html><body>Payment Required</body></html>"
}
