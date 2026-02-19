# @x402/aptos

Aptos implementation of the x402 payment protocol.

## Installation

```bash
npm install @x402/aptos
# or
pnpm add @x402/aptos
```

## Usage

### Client

```typescript
import { Account, Ed25519PrivateKey } from "@aptos-labs/ts-sdk";
import { ExactAptosClient } from "@x402/aptos/exact/client";

// Create signer from private key
const privateKey = new Ed25519PrivateKey("0x...");
const account = Account.fromPrivateKey({ privateKey });

// Create client
const client = new ExactAptosClient(account);

// Create payment payload
const payload = await client.createPaymentPayload(2, paymentRequirements);
```

### Facilitator

```typescript
import { Account, Ed25519PrivateKey } from "@aptos-labs/ts-sdk";
import { ExactAptosFacilitator, toFacilitatorAptosSigner } from "@x402/aptos";

// Create facilitator signer
const privateKey = new Ed25519PrivateKey("0x...");
const account = Account.fromPrivateKey({ privateKey });
const signer = toFacilitatorAptosSigner(account);

// Create facilitator
const facilitator = new ExactAptosFacilitator(signer);

// Verify and settle payments
const verifyResult = await facilitator.verify(payload, requirements);
const settleResult = await facilitator.settle(payload, requirements);
```

### Server

```typescript
import { x402ResourceServer } from "@x402/core/server";
import { registerExactAptosScheme } from "@x402/aptos/exact/server";

// Create and configure server
const server = new x402ResourceServer({ facilitatorUrl: "https://..." });
registerExactAptosScheme(server);

// Use parsePrice to convert amounts (e.g., "$1.00" or { amount: "1000000", asset: "0x..." })
// The scheme handles USDC conversion automatically
```

## Features

- **Sponsored Transactions**: Facilitators can pay gas fees on behalf of clients
- **Fungible Asset Transfers**: Uses Aptos's native `primary_fungible_store::transfer`
- **Network Support**: Mainnet (`aptos:1`) and Testnet (`aptos:2`)

## Testnet Resources

For testing on Aptos testnet, you can obtain test tokens from these faucets:

- **Test APT**: https://aptos.dev/network/faucet or through an account on [geomi.dev](https://geomi.dev/manage/faucet)
- **Test USDC**: https://faucet.circle.com/

## License

Apache-2.0
