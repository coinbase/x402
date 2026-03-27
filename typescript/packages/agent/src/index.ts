import { x402Client, wrapFetchWithPayment } from '@x402/fetch'
import { ExactEvmScheme } from '@x402/evm/exact/client'
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import { base58 } from '@scure/base'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { z } from 'zod'

// Add fetch types globally
declare const fetch: (_input: RequestInfo | URL, _init?: RequestInit) => Promise<Response>

/**
 * Configuration for the simplified x402 agent client
 */
export interface X402AgentConfig {
  /** Maximum USDC to spend per request (default: 0.05) */
  maxPaymentPerCall?: string
  /** Maximum USDC to spend per hour (default: 1.0) */
  maxPaymentPerHour?: string
  /** Maximum USDC to spend per day (default: 10.0) */
  maxPaymentPerDay?: string
  /** Custom EVM private key (if not provided, auto-generated) */
  evmPrivateKey?: string
  /** Custom SVM private key (if not provided, auto-generated) */
  svmPrivateKey?: string
  /** Path to wallet config (default: ~/.x402/wallet.json) */
  walletPath?: string
}

/**
 * Wallet configuration schema
 */
const WalletConfigSchema = z.object({
  evmPrivateKey: z.string(),
  svmPrivateKey: z.string().optional(),
  created: z.string(),
  addresses: z.object({
    evm: z.string(),
    svm: z.string().optional(),
  }),
})

type WalletConfig = z.infer<typeof WalletConfigSchema>

/**
 * Spending tracking
 */
interface SpendingTracker {
  today: string
  dailySpent: number
  hourlySpent: number
  lastHour: string
}

/**
 * Creates a simplified x402-enabled fetch function for AI agents.
 *
 * Features:
 * - Auto-discovers or creates wallet configuration
 * - Handles payments automatically
 * - Built-in spending limits for safety
 * - Zero-config setup for most use cases
 *
 * @param config Optional configuration for safety limits and wallet setup
 * @returns A fetch function that handles 402 responses automatically
 *
 * @example
 * ```typescript
 * import { createX402Client } from '@x402/agent';
 *
 * const client = await createX402Client({
 *   maxPaymentPerCall: '0.10', // Max $0.10 USDC per call
 *   maxPaymentPerDay: '5.0',   // Max $5.00 USDC per day
 * });
 *
 * // Use it like normal fetch - payments happen automatically
 * const response = await client('https://api.example.com/paid-endpoint');
 * const data = await response.json();
 * ```
 */
export async function createX402Client(config: X402AgentConfig = {}) {
  const {
    maxPaymentPerCall = '0.05',
    maxPaymentPerHour = '1.0',
    maxPaymentPerDay = '10.0',
    walletPath = join(homedir(), '.x402', 'wallet.json'),
  } = config

  // Load or create wallet configuration
  const walletConfig = await loadOrCreateWallet(walletPath, config)

  // Create EVM signer (always available)
  const evmSigner = privateKeyToAccount(walletConfig.evmPrivateKey as `0x${string}`)

  // Set up x402 client with EVM support
  const client = new x402Client()
  client.register('eip155:*', new ExactEvmScheme(evmSigner))

  // Add Solana support if available
  if (walletConfig.svmPrivateKey && walletConfig.addresses.svm) {
    try {
      const { ExactSvmScheme } = await import('@x402/svm/exact/client')
      const { createKeyPairSignerFromBytes } = await import('@solana/kit')

      const svmSigner = await createKeyPairSignerFromBytes(
        base58.decode(walletConfig.svmPrivateKey),
      )
      client.register('solana:*', new ExactSvmScheme(svmSigner))
    } catch {
       
      console.warn('⚠️  Solana support not available. Install @solana/kit for Solana payments.')
    }
  }

  // Create spending tracker
  const spendingPath = join(walletPath, '..', 'spending.json')
  let spendingTracker = loadSpendingTracker(spendingPath)

  // Wrap fetch with payment handling and spending limits
  const fetchWithPayment = wrapFetchWithPayment(fetch, client)

  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    // Check spending limits before making request
    checkSpendingLimits(spendingTracker, {
      maxPaymentPerCall: parseFloat(maxPaymentPerCall),
      maxPaymentPerHour: parseFloat(maxPaymentPerHour),
      maxPaymentPerDay: parseFloat(maxPaymentPerDay),
    })

    // Make the request
    const response = await fetchWithPayment(input, init)

    // Track spending if payment was made (TODO: extract actual amount from payment response)
    if (response.headers.has('PAYMENT-RESPONSE') || response.headers.has('X-PAYMENT-RESPONSE')) {
      // For now, assume max payment per call was spent (real implementation would parse payment response)
      const amountSpent = parseFloat(maxPaymentPerCall)
      trackSpending(spendingTracker, amountSpent, spendingPath)
    }

    return response
  }
}

/**
 * Load existing wallet or create a new one
 */
async function loadOrCreateWallet(
  walletPath: string,
  config: X402AgentConfig,
): Promise<WalletConfig> {
  // Ensure directory exists
  const dir = join(walletPath, '..')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  // Try to load existing wallet
  if (existsSync(walletPath)) {
    try {
      const walletData = JSON.parse(readFileSync(walletPath, 'utf-8'))
      const wallet = WalletConfigSchema.parse(walletData)
       
      console.log(`📦 Loaded x402 wallet from ${walletPath}`)
       
      console.log(`💰 EVM Address: ${wallet.addresses.evm}`)
       
      console.log(`💰 SVM Address: ${wallet.addresses.svm}`)
      return wallet
    } catch (_error) {
       
      console.warn(`⚠️  Invalid wallet config, creating new one: ${_error}`)
    }
  }

  // Create new wallet
  const evmPrivateKey = (config.evmPrivateKey as `0x${string}`) || generatePrivateKey()
  const evmAccount = privateKeyToAccount(evmPrivateKey)

  const wallet: WalletConfig = {
    evmPrivateKey,
    created: new Date().toISOString(),
    addresses: {
      evm: evmAccount.address,
    },
  }

  // Try to add Solana support
  try {
    const { createKeyPairSignerFromBytes } = await import('@solana/kit')
    const svmPrivateKey =
      config.svmPrivateKey || base58.encode(crypto.getRandomValues(new Uint8Array(32)))
    const svmAccount = await createKeyPairSignerFromBytes(base58.decode(svmPrivateKey))

    wallet.svmPrivateKey = svmPrivateKey
    wallet.addresses.svm = svmAccount.address
  } catch {
     
    console.log(
      'ℹ️  Solana support not available. EVM-only mode. Install @solana/kit for Solana support.',
    )
  }

  // Save wallet
  writeFileSync(walletPath, JSON.stringify(wallet, null, 2))
   
  console.log(`🆕 Created new x402 wallet at ${walletPath}`)
   
  console.log(`💰 EVM Address: ${wallet.addresses.evm} (Base, Ethereum)`)
  if (wallet.addresses.svm) {
     
    console.log(`💰 Solana Address: ${wallet.addresses.svm}`)
  }
  console.log(`⚠️  Fund these addresses with USDC to start making payments`)

  return wallet
}

/**
 * Load spending tracker
 */
function loadSpendingTracker(spendingPath: string): SpendingTracker {
  if (existsSync(spendingPath)) {
    try {
      return JSON.parse(readFileSync(spendingPath, 'utf-8'))
    } catch {
      // Ignore errors, create fresh tracker
    }
  }

  const today = new Date().toISOString().split('T')[0]
  const currentHour = new Date().toISOString().split(':')[0]

  return {
    today,
    dailySpent: 0,
    hourlySpent: 0,
    lastHour: currentHour,
  }
}

/**
 * Check if spending limits would be exceeded
 */
function checkSpendingLimits(
  tracker: SpendingTracker,
  limits: { maxPaymentPerCall: number; maxPaymentPerHour: number; maxPaymentPerDay: number },
) {
  const today = new Date().toISOString().split('T')[0]
  const currentHour = new Date().toISOString().split(':')[0]

  // Reset daily spending if new day
  if (tracker.today !== today) {
    tracker.today = today
    tracker.dailySpent = 0
  }

  // Reset hourly spending if new hour
  if (tracker.lastHour !== currentHour) {
    tracker.lastHour = currentHour
    tracker.hourlySpent = 0
  }

  // Check limits
  if (tracker.dailySpent + limits.maxPaymentPerCall > limits.maxPaymentPerDay) {
    throw new Error(
      `Daily spending limit would be exceeded. Daily spent: $${tracker.dailySpent.toFixed(3)}, limit: $${limits.maxPaymentPerDay}`,
    )
  }

  if (tracker.hourlySpent + limits.maxPaymentPerCall > limits.maxPaymentPerHour) {
    throw new Error(
      `Hourly spending limit would be exceeded. Hourly spent: $${tracker.hourlySpent.toFixed(3)}, limit: $${limits.maxPaymentPerHour}`,
    )
  }
}

/**
 * Track spending after payment
 */
function trackSpending(tracker: SpendingTracker, amount: number, spendingPath: string) {
  tracker.dailySpent += amount
  tracker.hourlySpent += amount

  // Save updated tracker
  writeFileSync(spendingPath, JSON.stringify(tracker, null, 2))
}

/**
 * Utility function to get wallet information
 */
export function getWalletInfo(walletPath?: string): WalletConfig | null {
  const path = walletPath || join(homedir(), '.x402', 'wallet.json')

  if (!existsSync(path)) {
    return null
  }

  try {
    const walletData = JSON.parse(readFileSync(path, 'utf-8'))
    return WalletConfigSchema.parse(walletData)
  } catch {
    return null
  }
}

// Type is already exported above with the interface declaration
