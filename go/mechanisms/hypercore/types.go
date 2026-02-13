package hypercore

const (
	SchemeExact           = "exact"
	NetworkMainnet        = "hypercore:mainnet"
	NetworkTestnet        = "hypercore:testnet"
	SignatureChainID      = 999
	MaxNonceAgeSeconds    = 3600
	HyperliquidAPIMainnet = "https://api.hyperliquid.xyz"
	HyperliquidAPITestnet = "https://api.hyperliquid-testnet.xyz"
)

type AssetInfo struct {
	Token    string
	Name     string
	Decimals int
}

type NetworkConfig struct {
	DefaultAsset AssetInfo
}

var NetworkConfigs = map[string]NetworkConfig{
	NetworkMainnet: {
		DefaultAsset: AssetInfo{
			Token:    "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
			Name:     "USDH",
			Decimals: 8,
		},
	},
	NetworkTestnet: {
		DefaultAsset: AssetInfo{
			Token:    "USDH:0x471fd4480bb9943a1fe080ab0d4ff36c",
			Name:     "USDH",
			Decimals: 8,
		},
	},
}

var NetworkAPIURLs = map[string]string{
	NetworkMainnet: HyperliquidAPIMainnet,
	NetworkTestnet: HyperliquidAPITestnet,
}

type HypercoreSendAssetAction struct {
	Type             string `json:"type"`
	HyperliquidChain string `json:"hyperliquidChain"`
	SignatureChainID string `json:"signatureChainId"`
	Destination      string `json:"destination"`
	SourceDex        string `json:"sourceDex"`
	DestinationDex   string `json:"destinationDex"`
	Token            string `json:"token"`
	Amount           string `json:"amount"`
	FromSubAccount   string `json:"fromSubAccount"`
	Nonce            int64  `json:"nonce"`
}

type HypercoreSignature struct {
	R string `json:"r"`
	S string `json:"s"`
	V int    `json:"v"`
}

type HypercorePaymentPayload struct {
	Action    HypercoreSendAssetAction `json:"action"`
	Signature HypercoreSignature       `json:"signature"`
	Nonce     int64                    `json:"nonce"`
}

type HyperliquidSigner interface {
	SignSendAsset(action HypercoreSendAssetAction) (HypercoreSignature, error)
	GetAddress() string
}

type HyperliquidAPIResponse struct {
	Status string `json:"status"`
}

type LedgerUpdate struct {
	Time  int64       `json:"time"`
	Hash  string      `json:"hash"`
	Delta DeltaUpdate `json:"delta"`
}

type DeltaUpdate struct {
	Type        string  `json:"type"`
	Destination *string `json:"destination,omitempty"`
	Nonce       *int64  `json:"nonce,omitempty"`
}
