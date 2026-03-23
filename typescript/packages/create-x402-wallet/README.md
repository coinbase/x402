# create-x402-wallet

Zero-config CLI tool for creating x402 agent wallets. Addresses the onboarding complexity issue by providing a simple "install and go" experience for AI agents using x402 micropayments.

## 🚀 Quick Start

```bash
# Create a wallet instantly
npx create-x402-wallet

# Or create with options
npx create-x402-wallet create --name my-agent --testnet
```

## 📦 Installation

```bash
# Global installation
npm install -g create-x402-wallet

# One-time usage
npx create-x402-wallet
```

## ✨ Features

- **Zero-config setup** - Creates a wallet with one command
- **Secure key generation** - Uses cryptographically secure random number generation
- **Multiple networks** - Supports Base Mainnet and Base Sepolia testnet
- **Environment integration** - Generates both JSON and .env files
- **Safety limits** - Configurable spending limits for autonomous agents
- **Ready to use** - Works immediately with x402-enabled APIs

## 🛠 Usage

### Create a New Wallet

```bash
# Default wallet (Base Mainnet)
npx create-x402-wallet

# Testnet wallet
npx create-x402-wallet create --testnet

# Custom name and directory
npx create-x402-wallet create --name trading-bot --directory ~/wallets
```

### Command Options

```bash
create-x402-wallet create [options]

Options:
  -n, --name <name>      Wallet name (default: "default")
  -d, --directory <dir>  Output directory (default: "./.x402")
  --testnet             Create wallet for testnet (Base Sepolia)
  --skip-funding        Skip funding instructions
  -f, --force           Overwrite existing wallet
  -h, --help            Display help
```

### Setup Configuration

```bash
# Interactive configuration setup
create-x402-wallet setup
```

## 📁 Output Structure

After creating a wallet, you'll have:

```
.x402/
├── config.json          # Global configuration
├── default.json         # Wallet configuration
├── default.env          # Environment variables
├── README.md            # Usage instructions
└── .gitignore           # Security settings
```

### Wallet Files

**default.json** - Full wallet configuration:

```json
{
  "name": "default",
  "address": "0x1234567890123456789012345678901234567890",
  "privateKey": "0x...",
  "network": "base-mainnet",
  "chainId": 8453,
  "rpcUrl": "https://mainnet.base.org",
  "currency": "USDC",
  "tokenAddress": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "facilitator": "https://facilitator.x402.org",
  "createdAt": "2026-03-23T06:20:00.000Z",
  "version": "1.0"
}
```

**default.env** - Environment variables:

```bash
X402_PRIVATE_KEY=0x...
X402_ADDRESS=0x1234567890123456789012345678901234567890
X402_NETWORK=base-mainnet
X402_CHAIN_ID=8453
X402_RPC_URL=https://mainnet.base.org
X402_TOKEN_ADDRESS=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
X402_FACILITATOR=https://facilitator.x402.org
```

## 💰 Funding Your Wallet

### Mainnet (Base)

1. Bridge USDC to Base network using [bridge.base.org](https://bridge.base.org)
2. Send USDC to your wallet address

### Testnet (Base Sepolia)

1. Get testnet USDC from Base Sepolia faucets
2. Send to your wallet address

## 🔧 Programmatic Usage

```typescript
import { createWallet, loadWallet } from 'create-x402-wallet'

// Create a wallet programmatically
const wallet = await createWallet({
  name: 'my-bot',
  directory: './wallets',
  testnet: false,
  force: false,
})

console.log(`Created wallet: ${wallet.address}`)

// Load an existing wallet
const existingWallet = await loadWallet('./wallets', 'my-bot')
console.log(`Loaded wallet: ${existingWallet.address}`)
```

## 🔒 Security

- Private keys are generated using cryptographically secure random number generation
- Uses `@noble/secp256k1` for key generation
- Proper Ethereum address derivation with keccak256
- Includes `.gitignore` to prevent accidental commits
- No network requests during key generation (offline-safe)

### Security Best Practices

1. **Never share private keys** - Keep your `.json` and `.env` files secure
2. **Use environment variables** - Load private keys from environment in production
3. **Set spending limits** - Configure reasonable limits for autonomous agents
4. **Regular monitoring** - Check wallet balance and transaction history

## 🌐 Networks Supported

| Network      | Chain ID | USDC Token                                 | RPC URL                  |
| ------------ | -------- | ------------------------------------------ | ------------------------ |
| Base Mainnet | 8453     | 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 | https://mainnet.base.org |
| Base Sepolia | 84532    | 0x036CbD53842c5426634e7929541eC2318f3dCF7e | https://sepolia.base.org |

## 🤖 AI Agent Integration

This tool is designed for AI agents that need to make autonomous payments:

```javascript
// Load wallet configuration
const wallet = await loadWallet('.x402')

// Use with x402-enabled APIs
const response = await fetch('https://api.example.com/premium-endpoint', {
  headers: {
    Authorization: `Bearer ${wallet.privateKey}`,
    'X402-Network': wallet.network,
  },
})
```

## 🆘 Troubleshooting

### Common Issues

**"Wallet already exists"**

```bash
# Use --force to overwrite
npx create-x402-wallet create --force
```

**"Permission denied"**

```bash
# Check directory permissions
mkdir -p .x402
chmod 755 .x402
```

**"Invalid network"**

- Ensure you're using supported networks (Base Mainnet/Sepolia)
- Check your internet connection for RPC validation

### Getting Help

- Create an issue: [GitHub Issues](https://github.com/coinbase/x402/issues)
- Join Discord: [x402 Community](https://discord.gg/x402)

## 🤝 Contributing

Contributions welcome! This tool addresses [Issue #1759](https://github.com/coinbase/x402/issues/1759) about x402 onboarding complexity.

## 📄 License

MIT License - see [LICENSE](../../LICENSE) file.

---

**Built for the x402 ecosystem** 🚀
