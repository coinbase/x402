#!/usr/bin/env node

import { Command } from 'commander'
import chalk from 'chalk'
import { createWallet } from './wallet.js'
import { setupConfig } from './config.js'

const program = new Command()

program
  .name('create-x402-wallet')
  .description('Zero-config CLI tool for creating x402 agent wallets')
  .version('0.1.0')

program
  .command('create')
  .alias('c')
  .description('Create a new x402 wallet')
  .option('-n, --name <name>', 'Wallet name', 'default')
  .option('-d, --directory <dir>', 'Output directory', process.cwd() + '/.x402')
  .option('--testnet', 'Create wallet for testnet (Base Sepolia)', false)
  .option('--skip-funding', 'Skip funding instructions', false)
  .option('-f, --force', 'Overwrite existing wallet', false)
  .action(async (options) => {
    try {
      console.log(chalk.blue('🔑 Creating x402 agent wallet...\n'))

      const result = await createWallet({
        name: options.name,
        directory: options.directory,
        testnet: options.testnet,
        skipFunding: options.skipFunding,
        force: options.force,
      })

      console.log(chalk.green('✅ Wallet created successfully!\n'))

      console.log(chalk.bold('Wallet Details:'))
      console.log(`  Name: ${result.name}`)
      console.log(`  Address: ${chalk.yellow(result.address)}`)
      console.log(`  Network: ${result.network}`)
      console.log(`  Config: ${result.configPath}`)

      if (!options.skipFunding) {
        console.log(chalk.blue('\n💰 Funding Instructions:'))
        if (options.testnet) {
          console.log(`  1. Get testnet USDC from Base Sepolia faucet`)
          console.log(`  2. Send USDC to: ${chalk.yellow(result.address)}`)
        } else {
          console.log(`  1. Bridge USDC to Base network`)
          console.log(`  2. Send USDC to: ${chalk.yellow(result.address)}`)
          console.log(`  3. Use bridges like: bridge.base.org`)
        }
      }

      console.log(chalk.blue('\n🚀 Next Steps:'))
      console.log(`  1. Fund your wallet with USDC`)
      console.log(`  2. Use x402-enabled APIs with automatic payments`)
      console.log(`  3. Check balance: npx x402-wallet balance`)
    } catch (error) {
      console.error(chalk.red('❌ Error creating wallet:'), error)
      process.exit(1)
    }
  })

program
  .command('setup')
  .description('Setup x402 configuration')
  .option('-d, --directory <dir>', 'Config directory', process.cwd() + '/.x402')
  .action(async (options) => {
    try {
      console.log(chalk.blue('⚙️ Setting up x402 configuration...\n'))

      await setupConfig({
        directory: options.directory,
      })

      console.log(chalk.green('✅ Configuration setup complete!'))
    } catch (error) {
      console.error(chalk.red('❌ Error setting up configuration:'), error)
      process.exit(1)
    }
  })

// Default action - run create
if (process.argv.length === 2) {
  program.parse(['node', 'cli.js', 'create'])
} else {
  program.parse()
}
