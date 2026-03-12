"""TVM mechanism constants - network configs, error codes, TON-specific values."""

# Payment scheme identifier
SCHEME_EXACT = "exact"

# CAIP-2 network identifiers for TVM chains
TVM_MAINNET = "tvm:-239"
TVM_TESTNET = "tvm:-3"

SUPPORTED_NETWORKS = {TVM_MAINNET, TVM_TESTNET}

# USDT Jetton Master contract address on TON
USDT_MASTER = "0:b113a994b5024a16719f69139328eb759596c38a25f59028b146fecdc3621dfe"

# Jetton transfer opcode (TEP-74)
JETTON_TRANSFER_OP = 0x0F8A7EA5

# W5 (Wallet v5r1) code hash - base64-encoded hash of the W5R1 contract code
W5R1_CODE_HASH = "IINLe3KxEhR+Gy+0V7hOdNGjDwT3N9T2KmaOlVLSty8="

# Maximum BoC size in bytes (protection against DoS)
MAX_BOC_SIZE = 4096

# Settlement timeout (seconds)
SETTLEMENT_TIMEOUT = 15

# Default max relay commission in USDT nano units (0.5 USDT = 500000)
DEFAULT_MAX_RELAY_COMMISSION = 500_000

# TONAPI base URLs
TONAPI_MAINNET_URL = "https://tonapi.io"
TONAPI_TESTNET_URL = "https://testnet.tonapi.io"

# Default token decimals for USDT on TON
DEFAULT_DECIMALS = 6

# Error codes (match EVM pattern)
ERR_INVALID_SIGNATURE = "invalid_exact_tvm_payload_signature"
ERR_UNSUPPORTED_SCHEME = "unsupported_scheme"
ERR_UNSUPPORTED_NETWORK = "unsupported_network"
ERR_PAYMENT_EXPIRED = "invalid_exact_tvm_payment_expired"
ERR_REPLAY_DETECTED = "invalid_exact_tvm_replay_detected"
ERR_INSUFFICIENT_AMOUNT = "invalid_exact_tvm_insufficient_amount"
ERR_RECIPIENT_MISMATCH = "invalid_exact_tvm_recipient_mismatch"
ERR_RELAY_COMMISSION_TOO_HIGH = "invalid_exact_tvm_relay_commission_too_high"
ERR_SETTLEMENT_FAILED = "settlement_failed"
ERR_SETTLEMENT_TIMEOUT = "settlement_timeout"
