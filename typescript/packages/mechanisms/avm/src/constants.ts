/**
 * Algorand Network Constants for x402 AVM Implementation
 *
 * CAIP-2 Network Identifiers use the format: algorand:<genesis-hash-base64>
 * Genesis hashes uniquely identify Algorand networks.
 */

// ============================================================================
// CAIP-2 Network Identifiers (V2)
// ============================================================================

/**
 * CAIP-2 network identifier for Algorand Mainnet
 * Format: algorand:<genesis-hash-base64>
 */
export const ALGORAND_MAINNET_CAIP2 = 'algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8='

/**
 * CAIP-2 network identifier for Algorand Testnet
 * Format: algorand:<genesis-hash-base64>
 */
export const ALGORAND_TESTNET_CAIP2 = 'algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI='

/**
 * All supported CAIP-2 network identifiers
 */
export const CAIP2_NETWORKS = [ALGORAND_MAINNET_CAIP2, ALGORAND_TESTNET_CAIP2] as const

// ============================================================================
// Genesis Hashes
// ============================================================================

/**
 * Algorand Mainnet genesis hash (base64 encoded)
 */
export const ALGORAND_MAINNET_GENESIS_HASH = 'wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8='

/**
 * Algorand Testnet genesis hash (base64 encoded)
 */
export const ALGORAND_TESTNET_GENESIS_HASH = 'SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI='

// ============================================================================
// V1 Network Identifiers (Backward Compatibility)
// ============================================================================

/**
 * V1 network identifier for Algorand Mainnet
 */
export const V1_ALGORAND_MAINNET = 'algorand-mainnet'

/**
 * V1 network identifier for Algorand Testnet
 */
export const V1_ALGORAND_TESTNET = 'algorand-testnet'

/**
 * All V1 network identifiers
 */
export const V1_NETWORKS = [V1_ALGORAND_MAINNET, V1_ALGORAND_TESTNET] as const

/**
 * Mapping from V1 network identifiers to CAIP-2 identifiers
 */
export const V1_TO_CAIP2: Record<string, string> = {
  [V1_ALGORAND_MAINNET]: ALGORAND_MAINNET_CAIP2,
  [V1_ALGORAND_TESTNET]: ALGORAND_TESTNET_CAIP2,
}

/**
 * Mapping from CAIP-2 identifiers to V1 network identifiers
 */
export const CAIP2_TO_V1: Record<string, string> = {
  [ALGORAND_MAINNET_CAIP2]: V1_ALGORAND_MAINNET,
  [ALGORAND_TESTNET_CAIP2]: V1_ALGORAND_TESTNET,
}

// ============================================================================
// USDC ASA (Algorand Standard Asset) Configuration
// ============================================================================

/**
 * USDC ASA ID on Algorand Mainnet
 *
 * @see https://algoexplorer.io/asset/31566704
 */
export const USDC_MAINNET_ASA_ID = '31566704'

/**
 * USDC ASA ID on Algorand Testnet
 *
 * @see https://testnet.algoexplorer.io/asset/10458941
 */
export const USDC_TESTNET_ASA_ID = '10458941'

/**
 * USDC decimals (same across all networks)
 */
export const USDC_DECIMALS = 6

/**
 * USDC configuration per network
 */
export const USDC_CONFIG: Record<string, { asaId: string; name: string; decimals: number }> = {
  [ALGORAND_MAINNET_CAIP2]: {
    asaId: USDC_MAINNET_ASA_ID,
    name: 'USDC',
    decimals: USDC_DECIMALS,
  },
  [ALGORAND_TESTNET_CAIP2]: {
    asaId: USDC_TESTNET_ASA_ID,
    name: 'USDC',
    decimals: USDC_DECIMALS,
  },
  // V1 network mappings
  [V1_ALGORAND_MAINNET]: {
    asaId: USDC_MAINNET_ASA_ID,
    name: 'USDC',
    decimals: USDC_DECIMALS,
  },
  [V1_ALGORAND_TESTNET]: {
    asaId: USDC_TESTNET_ASA_ID,
    name: 'USDC',
    decimals: USDC_DECIMALS,
  },
}

// ============================================================================
// Algod API Endpoints
// ============================================================================

/**
 * Fallback Algod API endpoint for Algorand Mainnet (AlgoNode)
 * Used when ALGOD_MAINNET_URL environment variable is not set.
 *
 * @see https://algonode.io/
 */
export const FALLBACK_ALGOD_MAINNET = 'https://mainnet-api.algonode.cloud'

/**
 * Fallback Algod API endpoint for Algorand Testnet (AlgoNode)
 * Used when ALGOD_TESTNET_URL environment variable is not set.
 *
 * @see https://algonode.io/
 */
export const FALLBACK_ALGOD_TESTNET = 'https://testnet-api.algonode.cloud'

/**
 * Get the Algod API endpoint for Algorand Mainnet.
 * Checks ALGOD_MAINNET_URL environment variable first, falls back to AlgoNode.
 *
 * Set the environment variable to use a custom endpoint:
 * ```
 * ALGOD_MAINNET_URL=https://your-node.example.com
 * ```
 */
export const DEFAULT_ALGOD_MAINNET =
  (typeof process !== 'undefined' && process.env?.ALGOD_MAINNET_URL) || FALLBACK_ALGOD_MAINNET

/**
 * Get the Algod API endpoint for Algorand Testnet.
 * Checks ALGOD_TESTNET_URL environment variable first, falls back to AlgoNode.
 *
 * Set the environment variable to use a custom endpoint:
 * ```
 * ALGOD_TESTNET_URL=https://your-node.example.com
 * ```
 */
export const DEFAULT_ALGOD_TESTNET =
  (typeof process !== 'undefined' && process.env?.ALGOD_TESTNET_URL) || FALLBACK_ALGOD_TESTNET

/**
 * Mapping from network identifiers to Algod endpoints.
 * Endpoints are determined by environment variables if set, otherwise uses fallback (AlgoNode).
 */
export const NETWORK_TO_ALGOD: Record<string, string> = {
  [ALGORAND_MAINNET_CAIP2]: DEFAULT_ALGOD_MAINNET,
  [ALGORAND_TESTNET_CAIP2]: DEFAULT_ALGOD_TESTNET,
  [V1_ALGORAND_MAINNET]: DEFAULT_ALGOD_MAINNET,
  [V1_ALGORAND_TESTNET]: DEFAULT_ALGOD_TESTNET,
}

// ============================================================================
// Transaction Limits
// ============================================================================

/**
 * Maximum number of transactions in an Algorand atomic group
 */
export const MAX_ATOMIC_GROUP_SIZE = 16

/**
 * Minimum transaction fee in microAlgos
 */
export const MIN_TXN_FEE = 1000

/**
 * Maximum reasonable fee for fee payer transactions (16000 microAlgos)
 * Used as a sanity check during verification to prevent fee extraction attacks.
 * Algorand fees are flat (min 1000 microAlgos per txn), so the fee payer's
 * per-transaction fee should never exceed a small multiple of the minimum.
 */
export const MAX_REASONABLE_FEE = 16000

// ============================================================================
// Address Validation
// ============================================================================

/**
 * Algorand address regex (58-character base32 string)
 */
export const ALGORAND_ADDRESS_REGEX = /^[A-Z2-7]{58}$/

/**
 * Algorand address length in characters
 */
export const ALGORAND_ADDRESS_LENGTH = 58
