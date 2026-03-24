import { createX402Client, getWalletInfo } from './src/index'

/**
 * Example demonstrating simplified x402 agent usage.
 *
 * This addresses the feedback from issue #1759 about complex onboarding.
 * Now agents can make x402 payments with minimal setup.
 */
async function main() {
  // 1. Create client - auto-generates wallet if needed
  console.log('🚀 Creating x402 client...\n')

  const client = createX402Client({
    maxPaymentPerCall: '0.01', // Max penny per call
    maxPaymentPerDay: '1.0', // Max dollar per day
  })

  // 2. Check wallet info
  const wallet = getWalletInfo()
  if (wallet) {
    console.log('💰 Wallet Info:')
    console.log('  EVM Address (Base/Ethereum):', wallet.addresses.evm)
    console.log('  Solana Address:', wallet.addresses.svm)
    console.log('  Created:', wallet.created)
    console.log()
    console.log('⚠️  Fund these addresses with USDC to start making payments!')
    console.log('  Base USDC: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913')
    console.log('  Solana USDC: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')
    console.log()
  }

  // 3. Example API calls (would require funded wallets)
  console.log('📡 Example API calls:')
  console.log('  Weather: await client("https://api.example.com/weather?city=Tokyo")')
  console.log('  Crypto data: await client("https://api.deepbluebase.xyz/price/btc")')
  console.log(
    '  AI analysis: await client("https://api.example.com/analyze", { method: "POST", body: "..." })',
  )
  console.log()

  // Note: Actual calls would require funded wallets, so we skip them in the example
  console.log("💡 That's it! Use client() like fetch() - payments happen automatically.")
}

main().catch(console.error)
