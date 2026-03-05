package stellar

const (
	// SchemeExact is the scheme identifier for exact payments
	SchemeExact = "exact"

	// DefaultDecimals is the default token decimals for Stellar assets (7 decimals)
	DefaultDecimals = 7

	// Horizon endpoints
	HorizonTestnet = "https://horizon-testnet.stellar.org"
	HorizonMainnet = "https://horizon.stellar.org"

	// Network passphrases
	TestnetPassphrase = "Test SDF Network ; September 2015"
	MainnetPassphrase = "Public Global Stellar Network ; September 2015"

	// CAIP-2 network identifiers
	StellarPubnetCAIP2  = "stellar:pubnet"
	StellarTestnetCAIP2 = "stellar:testnet"

	// USDC issuer addresses
	USDCIssuerMainnet = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN"
	USDCIssuerTestnet = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"

	// USDC asset code
	USDCCode = "USDC"

	// XLM native asset identifier
	XLMNative = "native"
)

// AssetInfo contains information about a Stellar asset
type AssetInfo struct {
	Code     string // Asset code (e.g., "USDC", "XLM")
	Issuer   string // Issuer address (empty for native XLM)
	Decimals int    // Asset decimals (7 for Stellar)
	IsNative bool   // Whether this is the native XLM asset
}

// NetworkConfig contains network-specific configuration
type NetworkConfig struct {
	Name         string    // Network name
	CAIP2        string    // CAIP-2 identifier
	Passphrase   string    // Network passphrase
	HorizonURL   string    // Horizon API URL
	DefaultAsset AssetInfo // Default stablecoin
}

var (
	// NetworkConfigs maps CAIP-2 identifiers to network configurations
	NetworkConfigs = map[string]NetworkConfig{
		StellarPubnetCAIP2: {
			Name:       "Stellar Pubnet",
			CAIP2:      StellarPubnetCAIP2,
			Passphrase: MainnetPassphrase,
			HorizonURL: HorizonMainnet,
			DefaultAsset: AssetInfo{
				Code:     USDCCode,
				Issuer:   USDCIssuerMainnet,
				Decimals: DefaultDecimals,
			},
		},
		StellarTestnetCAIP2: {
			Name:       "Stellar Testnet",
			CAIP2:      StellarTestnetCAIP2,
			Passphrase: TestnetPassphrase,
			HorizonURL: HorizonTestnet,
			DefaultAsset: AssetInfo{
				Code:     USDCCode,
				Issuer:   USDCIssuerTestnet,
				Decimals: DefaultDecimals,
			},
		},
	}
)
