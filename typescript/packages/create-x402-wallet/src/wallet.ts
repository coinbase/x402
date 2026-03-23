import { randomBytes } from 'crypto'
import * as secp256k1 from '@noble/secp256k1'
import { keccak256 } from './utils/crypto.js'
import { promises as fs } from 'fs'
import path from 'path'
import ora from 'ora'

export interface CreateWalletOptions {
  name: string
  directory: string
  testnet?: boolean
  skipFunding?: boolean
  force?: boolean
}

export interface WalletResult {
  name: string
  address: string
  network: string
  configPath: string
  privateKey: string
}

export async function createWallet(options: CreateWalletOptions): Promise<WalletResult> {
  const spinner = ora('Generating wallet keypair...').start()

  try {
    // Generate private key
    const privateKeyBytes = randomBytes(32)
    const privateKey = `0x${privateKeyBytes.toString('hex')}`

    spinner.text = 'Deriving address...'

    // Generate public key
    const publicKey = secp256k1.getPublicKey(privateKeyBytes, false)

    // Derive Ethereum address from public key
    const publicKeyHash = keccak256(publicKey.slice(1)) // Remove 0x04 prefix
    const address = `0x${publicKeyHash.slice(-40)}`

    spinner.text = 'Creating configuration...'

    // Ensure directory exists
    await fs.mkdir(options.directory, { recursive: true })

    const network = options.testnet ? 'base-sepolia' : 'base-mainnet'
    const configPath = path.join(options.directory, `${options.name}.json`)

    // Check if wallet already exists
    const exists = await fs
      .access(configPath)
      .then(() => true)
      .catch(() => false)
    if (exists && !options.force) {
      spinner.fail(`Wallet ${options.name} already exists. Use --force to overwrite.`)
      throw new Error(`Wallet already exists: ${configPath}`)
    }

    // Create wallet configuration
    const walletConfig = {
      name: options.name,
      address: address,
      privateKey: privateKey,
      network: network,
      chainId: options.testnet ? 84532 : 8453,
      rpcUrl: options.testnet ? 'https://sepolia.base.org' : 'https://mainnet.base.org',
      currency: 'USDC',
      tokenAddress: options.testnet
        ? '0x036CbD53842c5426634e7929541eC2318f3dCF7e' // Base Sepolia USDC
        : '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // Base Mainnet USDC
      facilitator: 'https://facilitator.x402.org',
      createdAt: new Date().toISOString(),
      version: '1.0',
    }

    // Save wallet configuration
    await fs.writeFile(configPath, JSON.stringify(walletConfig, null, 2))

    // Also save a simple .env format file
    const envPath = path.join(options.directory, `${options.name}.env`)
    const envContent = [
      `# x402 Wallet Configuration - ${options.name}`,
      `# Created: ${walletConfig.createdAt}`,
      ``,
      `X402_PRIVATE_KEY=${privateKey}`,
      `X402_ADDRESS=${address}`,
      `X402_NETWORK=${network}`,
      `X402_CHAIN_ID=${walletConfig.chainId}`,
      `X402_RPC_URL=${walletConfig.rpcUrl}`,
      `X402_TOKEN_ADDRESS=${walletConfig.tokenAddress}`,
      `X402_FACILITATOR=${walletConfig.facilitator}`,
      ``,
      `# Usage:`,
      `# source ${envPath}`,
      `# or load in your application`,
      ``,
    ].join('\n')

    await fs.writeFile(envPath, envContent)

    spinner.succeed('Wallet created successfully!')

    return {
      name: options.name,
      address: address,
      network: network,
      configPath: configPath,
      privateKey: privateKey,
    }
  } catch (error) {
    spinner.fail('Failed to create wallet')
    throw error
  }
}

export async function loadWallet(directory: string, name: string = 'default') {
  const configPath = path.join(directory, `${name}.json`)

  try {
    const content = await fs.readFile(configPath, 'utf-8')
    return JSON.parse(content)
  } catch {
    throw new Error(`Wallet not found: ${configPath}`)
  }
}
