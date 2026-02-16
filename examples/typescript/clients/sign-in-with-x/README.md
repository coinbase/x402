# Sign-In-With-X (SIWX) Client Example

Client demonstrating how to use Sign-In-With-X authentication with x402, allowing wallet signatures to prove prior payment and skip re-payment on subsequent requests.

```typescript
import { x402Client, x402HTTPClient, wrapFetchWithPayment } from "@x402/fetch";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { registerExactSvmScheme } from "@x402/svm/exact/client";
import { createSIWxClientHook } from "@x402/extensions/sign-in-with-x";
import { privateKeyToAccount } from "viem/accounts";
import { createKeyPairSignerFromBytes } from "@solana/kit";

const evmSigner = privateKeyToAccount(process.env.EVM_PRIVATE_KEY);
// Or use SVM: const svmSigner = await createKeyPairSignerFromBytes(base58.decode(process.env.SVM_PRIVATE_KEY));

const client = new x402Client();
registerExactEvmScheme(client, { signer: evmSigner });
// Optional: registerExactSvmScheme(client, { signer: svmSigner });

// SIWX works with both EVM (eip191) and Solana (ed25519) signers
const httpClient = new x402HTTPClient(client).onPaymentRequired(
  createSIWxClientHook(evmSigner) // or svmSigner
);

const fetchWithPayment = wrapFetchWithPayment(fetch, httpClient);

// First request: pays for access
const response1 = await fetchWithPayment("http://localhost:4021/weather");

// Second request: SIWX proves we already paid, no payment needed
const response2 = await fetchWithPayment("http://localhost:4021/weather");
```

## How It Works

1. **First request** — Client pays for resource access
2. **Server remembers** — Payment is recorded against wallet address
3. **Second request** — Client signs SIWX message proving wallet ownership
4. **Server grants access** — No payment required, authenticated via signature

## Prerequisites

- Node.js v20+ (install via [nvm](https://github.com/nvm-sh/nvm))
- pnpm v10 (install via [pnpm.io/installation](https://pnpm.io/installation))
- At least one private key (EVM or SVM) for payments and SIWX authentication
- Running SIWX server (see [server example](../../servers/sign-in-with-x/))

## Setup

1. Copy `.env-local` to `.env`:

```bash
cp .env-local .env
```

and provide at least one private key:

- `EVM_PRIVATE_KEY` - (Optional) Ethereum private key for EVM payments and SIWX authentication
- `SVM_PRIVATE_KEY` - (Optional) Solana private key for SVM payments and SIWX authentication
- `RESOURCE_SERVER_URL` - (Optional) Server URL (defaults to `http://localhost:4021`)

**Note:** At least one private key (EVM or SVM) is required. SIWX supports both EVM signatures (EIP-191) and Solana signatures (Ed25519), so authentication works with either key type.

2. Install and build from typescript examples root:

```bash
cd ../../
pnpm install && pnpm build
cd clients/sign-in-with-x
```

3. Start the SIWX server:

```bash
cd ../../servers/sign-in-with-x
pnpm dev
```

4. Run the client:

```bash
cd ../../clients/sign-in-with-x
pnpm start
```

## Expected Output

```
Client EVM address: 0x...
Server: http://localhost:4021

--- /weather ---
1. First request...
   ✓ Paid via payment settlement
   Payment details: {
     "success": true,
     "transaction": "0x...",
     "network": "eip155:84532",
     ...
   }
   Response: { weather: 'sunny', temperature: 72 }
2. Second request...
   ✓ Authenticated via SIWX (previously paid)
   Response: { weather: 'sunny', temperature: 72 }

--- /joke ---
1. First request...
   ✓ Paid via payment settlement
   ...
2. Second request...
   ✓ Authenticated via SIWX (previously paid)
   ...
```