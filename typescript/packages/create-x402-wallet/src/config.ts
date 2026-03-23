import { promises as fs } from 'fs'
import path from 'path'
import prompts from 'prompts'
import ora from 'ora'

export interface SetupConfigOptions {
  directory: string
}

export async function setupConfig(options: SetupConfigOptions): Promise<void> {
  const spinner = ora('Setting up x402 configuration...').start()

  try {
    // Ensure directory exists
    await fs.mkdir(options.directory, { recursive: true })

    spinner.stop()

    // Ask user for configuration preferences
    const responses = await prompts([
      {
        type: 'select',
        name: 'network',
        message: 'Which network would you like to use?',
        choices: [
          { title: 'Base Mainnet (Production)', value: 'mainnet' },
          { title: 'Base Sepolia (Testnet)', value: 'testnet' },
        ],
        initial: 0,
      },
      {
        type: 'text',
        name: 'facilitator',
        message: 'Facilitator URL:',
        initial: 'https://facilitator.x402.org',
        validate: (value: string) => {
          try {
            new URL(value)
            return true
          } catch {
            return 'Please enter a valid URL'
          }
        },
      },
      {
        type: 'text',
        name: 'maxPaymentPerCall',
        message: 'Maximum payment per API call (USDC):',
        initial: '0.10',
        validate: (value: string) => {
          const num = parseFloat(value)
          if (isNaN(num) || num <= 0) {
            return 'Please enter a positive number'
          }
          return true
        },
      },
      {
        type: 'text',
        name: 'dailySpendLimit',
        message: 'Daily spending limit (USDC):',
        initial: '5.00',
        validate: (value: string) => {
          const num = parseFloat(value)
          if (isNaN(num) || num <= 0) {
            return 'Please enter a positive number'
          }
          return true
        },
      },
    ])

    spinner.start('Creating configuration files...')

    const isTestnet = responses.network === 'testnet'

    // Create global config
    const globalConfig = {
      version: '1.0',
      network: responses.network,
      chainId: isTestnet ? 84532 : 8453,
      rpcUrl: isTestnet ? 'https://sepolia.base.org' : 'https://mainnet.base.org',
      facilitator: responses.facilitator,
      currency: 'USDC',
      tokenAddress: isTestnet
        ? '0x036CbD53842c5426634e7929541eC2318f3dCF7e' // Base Sepolia USDC
        : '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // Base Mainnet USDC
      limits: {
        maxPaymentPerCall: responses.maxPaymentPerCall,
        dailySpendLimit: responses.dailySpendLimit,
      },
      createdAt: new Date().toISOString(),
    }

    const configPath = path.join(options.directory, 'config.json')
    await fs.writeFile(configPath, JSON.stringify(globalConfig, null, 2))

    // Create README file
    const readmePath = path.join(options.directory, 'README.md')
    const readmeContent = [
      '# x402 Wallet Configuration',
      '',
      'This directory contains your x402 wallet configuration and keys.',
      '',
      '## Files',
      '',
      '- `config.json` - Global x402 configuration',
      '- `default.json` - Default wallet configuration',
      '- `default.env` - Environment variables for default wallet',
      '',
      '## Security',
      '',
      '⚠️ **Keep your private keys secure!**',
      '',
      '- Never share your private keys',
      '- Never commit them to version control',
      '- Consider using environment variables in production',
      '',
      '## Usage',
      '',
      '```bash',
      '# Create a new wallet',
      'npx create-x402-wallet',
      '',
      '# Load wallet in your app',
      'import { loadWallet } from "create-x402-wallet";',
      'const wallet = await loadWallet(".x402");',
      '```',
      '',
      '## Networks',
      '',
      `- Current network: ${responses.network}`,
      `- Chain ID: ${globalConfig.chainId}`,
      `- RPC URL: ${globalConfig.rpcUrl}`,
      '',
      '## Limits',
      '',
      `- Max per call: ${responses.maxPaymentPerCall} USDC`,
      `- Daily limit: ${responses.dailySpendLimit} USDC`,
      '',
    ].join('\n')

    await fs.writeFile(readmePath, readmeContent)

    // Create .gitignore
    const gitignorePath = path.join(options.directory, '.gitignore')
    const gitignoreContent = [
      '# x402 Wallet Security',
      '*.json',
      '*.env',
      '*.key',
      '!config.json',
      '',
      '# But do track README',
      '!README.md',
      '',
    ].join('\n')

    await fs.writeFile(gitignorePath, gitignoreContent)

    spinner.succeed('Configuration created successfully!')
  } catch (error) {
    spinner.fail('Failed to setup configuration')
    throw error
  }
}
