"""Lightning network identifiers and shared constants for the x402 Lightning mechanism."""

# Reuse protocol scheme name with other exact mechanisms
SCHEME_EXACT = "exact"

ASSET_BTC = "BTC"

# 1 BTC = 10^11 msat (100,000,000,000)
MSAT_PER_BTC = 100_000_000_000

# CAIP-style Lightning network IDs (not CAIP-2; project convention)
LIGHTNING_MAINNET = "lightning:mainnet"
LIGHTNING_TESTNET = "lightning:testnet"
LIGHTNING_REGTEST = "lightning:regtest"

LIGHTNING_NETWORKS = (
    LIGHTNING_MAINNET,
    LIGHTNING_TESTNET,
    LIGHTNING_REGTEST,
)

ERR_UNSUPPORTED_SCHEME = "unsupported_scheme"
ERR_NETWORK_MISMATCH = "network_mismatch"
ERR_INVALID_PAYLOAD = "invalid_payload"
ERR_INVOICE_DECODE_FAILED = "invoice_decode_failed"
ERR_PAYMENT_HASH_MISMATCH = "payment_hash_mismatch"
ERR_AMOUNT_MISMATCH = "amount_mismatch"
ERR_PAY_TO_MISMATCH = "pay_to_mismatch"
ERR_REPLAY = "replay_detected"
ERR_MISSING_INVOICE = "missing_invoice"
ERR_MISSING_PREIMAGE = "missing_preimage"

# Deterministic mock payee (secp256k1 pubkey) for tests — matches ``MockLightningBackend`` signing key.
MOCK_LIGHTNING_PAYEE_PUBKEY = (
    "034f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa"
)
