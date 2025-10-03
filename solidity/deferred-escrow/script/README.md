# Deployment Scripts

This directory contains deployment scripts for the DeferredPaymentEscrow contract.

## Scripts

### Deploy.s.sol
Main deployment script that deploys the DeferredPaymentEscrow contract using Safe Singleton Factory for deterministic addresses across all chains.

**Default Parameters:**
- Thawing Period: 1 day (immutable, cannot be changed post-deployment)

**Key Features:**
- No proxy pattern - direct contract deployment
- Deterministic addresses across all chains using Safe Singleton Factory
- Fully permissionless (no owner functionality)
- Immutable thawing period set in constructor

### CalculateStorageSlot.s.sol
Utility script to calculate ERC-7201 storage slots for namespaced storage.

### DepositToEscrow.s.sol
Script to deposit ERC20 tokens into the DeferredPaymentEscrow contract for specific sellers.

### verify.sh
Bash script to verify the deployed contract on Etherscan/Basescan. Follows the same pattern as account-modules for consistency.

## Usage

### Local Deployment (Anvil)
```bash
# Start local node
anvil

# Deploy to local network
forge script script/Deploy.s.sol --rpc-url http://localhost:8545 --broadcast --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

### Predict Contract Address
```bash
# Get the deterministic address before deployment
forge script script/Deploy.s.sol --sig "predict()" --rpc-url <YOUR_RPC_URL>
```

### Testnet/Mainnet Deployment
```bash
# Deploy (verification done separately)
forge script script/Deploy.s.sol \
    --rpc-url <YOUR_RPC_URL> \
    --private-key <YOUR_PRIVATE_KEY> \
    --broadcast

# Verify separately using verify.sh script
./script/verify.sh base-sepolia
```

### Depositing Funds

To deposit tokens for a seller:
```bash
SELLER=<SELLER_ADDRESS> TOKEN=<TOKEN_ADDRESS> AMOUNT=<AMOUNT> \
forge script script/DepositToEscrow.s.sol \
    --rpc-url <YOUR_RPC_URL> \
    --private-key <YOUR_PRIVATE_KEY> \
    --broadcast
```

Example:
```bash
# Deposit 100 USDC (6 decimals) to a seller
SELLER=0x1234...5678 TOKEN=0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 AMOUNT=100000000 \
forge script script/DepositToEscrow.s.sol \
    --rpc-url https://mainnet.infura.io/v3/YOUR_KEY \
    --private-key $PRIVATE_KEY \
    --broadcast
```

## Output

The deployment script will output:
- Single contract address (no proxy/implementation split)
- Note that the address will be consistent across all chains due to deterministic deployment

The deposit script will output:
- Escrow address being used
- Seller, token, and amount details
- Balance before and after deposit
- Transaction summary

## Important Notes

1. **Deterministic Deployment**: The DeferredPaymentEscrow contract uses Safe Singleton Factory, ensuring the same address across all chains regardless of deployer. Use the `predict()` function to get the address before deployment.

2. **Immutable Configuration**: The thawing period is set during deployment and cannot be changed. There is no owner or admin functionality.

3. **Verification**: Use the provided `verify.sh` script for contract verification. The script includes constructor arguments for the thawing period.

4. **Library Dependencies**: The contract uses EscrowSignatureLib which Forge deploys automatically. The verify script handles this correctly.

5. For the deposit script:
   - The script automatically reads the deployed escrow address from `addresses.json` based on the current chain ID
   - Token approval is handled automatically if needed
   - For batch deposits, ensure the arrays have the same length
   - The depositor must have sufficient token balance and the tokens must be ERC20 compliant
