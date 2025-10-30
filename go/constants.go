package x402

// Version constants
const (
	// Version is the SDK version
	Version = "2.0.0"

	// ProtocolVersion is the current x402 protocol version
	ProtocolVersion = 2

	// ProtocolVersionV1 is the legacy x402 protocol version
	ProtocolVersionV1 = 1
)

// Export the main types with uppercase names for external packages
type (
	// X402Client is the exported type for x402Client
	X402Client = x402Client

	// X402ResourceService is the exported type for x402ResourceService
	X402ResourceService = x402ResourceService

	// X402Facilitator is the exported type for x402Facilitator
	X402Facilitator = x402Facilitator
)
