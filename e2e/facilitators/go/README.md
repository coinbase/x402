# Go Facilitator for E2E Testing

This is a real blockchain facilitator implementation using the x402 Go SDK. It connects to Base Sepolia testnet and performs actual on-chain operations.

## Features

- **Real EIP-712 Signature Verification**: Uses go-ethereum's apitypes for proper signature recovery and verification
- **Actual Blockchain Calls**: Connects via RPC to read contract state
- **On-Chain Settlement**: Executes real USDC transfers via `transferWithAuthorization`
- **Transaction Monitoring**: Polls for actual transaction receipts

## Environment Variables

Required:
- `EVM_PRIVATE_KEY`: The facilitator's private key (must have ETH for gas and USDC for settlements)
- `EVM_NETWORK`: Network identifier (e.g., "eip155:84532" for Base Sepolia)

Optional:
- `PORT`: HTTP server port (default: 4022)
- `EVM_RPC_URL`: RPC endpoint URL (default: "https://sepolia.base.org")

## Endpoints

- `POST /verify`: Verify a payment signature and check nonce state
- `POST /settle`: Execute the payment on-chain
- `GET /supported`: Return supported payment kinds
- `GET /health`: Health check
- `POST /close`: Graceful shutdown

## Implementation Details

### Real Blockchain Operations

#### Signature Verification
- Reconstructs EIP-712 typed data hash
- Recovers signer address from signature
- Compares recovered address with expected payer

#### Contract Reads
- Calls `authorizationState(address, bytes32)` to check if nonce is used
- Calls `balanceOf(address)` to verify sufficient balance
- Calls `allowance(address, address)` to verify spending approval

#### Contract Writes
- Creates and signs transactions using the facilitator's private key
- Executes `transferWithAuthorization` on USDC contract
- Waits for transaction confirmation

### Type Handling

The facilitator automatically converts between Go types and Ethereum ABI types:
- String addresses → `common.Address`
- Hex string nonces → `[32]byte`
- Separate v, r, s signature components → Single 65-byte signature
- `*big.Int` values → uint256

## Running

```bash
# Make executable
chmod +x run.sh

# Run with environment variables
EVM_PRIVATE_KEY=0x... EVM_RPC_URL=https://... PORT=4022 ./run.sh
```

## Notes

- The facilitator requires ETH for gas fees on the testnet
- For production, use a reliable RPC endpoint (Alchemy, Infura, etc.) to avoid rate limiting
- The public Base Sepolia RPC may rate limit under heavy load

