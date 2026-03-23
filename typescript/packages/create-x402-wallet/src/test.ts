import { createWallet, loadWallet } from './wallet.js'
import { isValidAddress, isValidPrivateKey } from './utils/crypto.js'
import { tmpdir } from 'os'
import { join } from 'path'

async function testWalletCreation() {
  console.log('Testing wallet creation...')

  const testDir = join(tmpdir(), 'test-x402-wallet')

  try {
    // Create a test wallet
    const wallet = await createWallet({
      name: 'test',
      directory: testDir,
      testnet: true,
      skipFunding: true,
      force: true,
    })

    console.log('✅ Wallet created:', wallet.address)

    // Validate the results
    if (!isValidAddress(wallet.address)) {
      throw new Error('Invalid address generated')
    }

    if (!isValidPrivateKey(wallet.privateKey)) {
      throw new Error('Invalid private key generated')
    }

    // Try to load the wallet
    const loadedWallet = await loadWallet(testDir, 'test')

    if (loadedWallet.address !== wallet.address) {
      throw new Error('Loaded wallet address mismatch')
    }

    console.log('✅ Wallet loading works')
    console.log('✅ All tests passed!')
  } catch (error) {
    console.error('❌ Test failed:', error)
    process.exit(1)
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testWalletCreation()
}
