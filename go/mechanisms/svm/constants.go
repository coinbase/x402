package svm

import (
	"time"

	"github.com/gagliardetto/solana-go/rpc"
)

const (
	// SchemeExact is the scheme identifier for exact payments
	SchemeExact = "exact"

	// DefaultDecimals is the default token decimals for USDC
	DefaultDecimals = 6

	// DefaultComputeUnitPriceMicrolamports is the default compute unit price in microlamports
	DefaultComputeUnitPriceMicrolamports = 1

	// MaxComputeUnitPriceMicrolamports is the maximum compute unit price in microlamports (facilitator validation limit)
	// 5 lamports = 5,000,000 microlamports
	MaxComputeUnitPriceMicrolamports = 5_000_000

	// DefaultComputeUnitLimit is the default compute unit limit for transactions
	DefaultComputeUnitLimit uint32 = 6500

	// DefaultCommitment is the default commitment level for transactions
	DefaultCommitment = rpc.CommitmentConfirmed

	// MaxConfirmAttempts is the maximum number of confirmation attempts
	MaxConfirmAttempts = 30

	// ConfirmRetryDelay is the base delay between confirmation attempts
	ConfirmRetryDelay = 1 * time.Second

	// CAIP-2 network identifiers (V2)
	SolanaMainnetCAIP2 = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"
	SolanaDevnetCAIP2  = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1"
	SolanaTestnetCAIP2 = "solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z"

	// V1 network names
	SolanaMainnetV1 = "solana"
	SolanaDevnetV1  = "solana-devnet"
	SolanaTestnetV1 = "solana-testnet"

	// USDC mint addresses
	USDCMainnetAddress = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
	USDCDevnetAddress  = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
	USDCTestnetAddress = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU" // Same as devnet
)

var (
	// NetworkConfigs maps CAIP-2 identifiers to network configurations
	NetworkConfigs = map[string]NetworkConfig{
		SolanaMainnetCAIP2: {
			Name:   "Solana Mainnet",
			CAIP2:  SolanaMainnetCAIP2,
			RPCURL: "https://api.mainnet-beta.solana.com",
			DefaultAsset: AssetInfo{
				Address:  USDCMainnetAddress,
				Symbol:   "USDC",
				Decimals: DefaultDecimals,
			},
			SupportedAssets: map[string]AssetInfo{
				"USDC": {
					Address:  USDCMainnetAddress,
					Symbol:   "USDC",
					Decimals: DefaultDecimals,
				},
			},
		},
		SolanaDevnetCAIP2: {
			Name:   "Solana Devnet",
			CAIP2:  SolanaDevnetCAIP2,
			RPCURL: "https://api.devnet.solana.com",
			DefaultAsset: AssetInfo{
				Address:  USDCDevnetAddress,
				Symbol:   "USDC",
				Decimals: DefaultDecimals,
			},
			SupportedAssets: map[string]AssetInfo{
				"USDC": {
					Address:  USDCDevnetAddress,
					Symbol:   "USDC",
					Decimals: DefaultDecimals,
				},
			},
		},
		SolanaTestnetCAIP2: {
			Name:   "Solana Testnet",
			CAIP2:  SolanaTestnetCAIP2,
			RPCURL: "https://api.testnet.solana.com",
			DefaultAsset: AssetInfo{
				Address:  USDCTestnetAddress,
				Symbol:   "USDC",
				Decimals: DefaultDecimals,
			},
			SupportedAssets: map[string]AssetInfo{
				"USDC": {
					Address:  USDCTestnetAddress,
					Symbol:   "USDC",
					Decimals: DefaultDecimals,
				},
			},
		},
	}

	// V1ToV2NetworkMap maps V1 network names to CAIP-2 identifiers
	V1ToV2NetworkMap = map[string]string{
		SolanaMainnetV1: SolanaMainnetCAIP2,
		SolanaDevnetV1:  SolanaDevnetCAIP2,
		SolanaTestnetV1: SolanaTestnetCAIP2,
	}
)
