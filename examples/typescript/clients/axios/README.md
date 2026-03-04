# @x402/axios Example Client

Example client demonstrating how to use `@x402/axios` to make HTTP requests to endpoints protected by the x402 payment protocol.

```typescript
import { x402Client, wrapAxiosWithPayment } from "@x402/axios";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { registerExactSvmScheme } from "@x402/svm/exact/client";
import { registerExactHederaScheme } from "@x402/hedera/exact/client";
import { privateKeyToAccount } from "viem/accounts";
import { createKeyPairSignerFromBytes } from "@solana/kit";
import { base58 } from "@scure/base";
import { createClientHederaSigner } from "@x402/hedera";
import { PrivateKey } from "@hashgraph/sdk";
import axios from "axios";

const client = new x402Client();
registerExactEvmScheme(client, { signer: privateKeyToAccount(process.env.EVM_PRIVATE_KEY) });
registerExactSvmScheme(client, {
  signer: await createKeyPairSignerFromBytes(base58.decode(process.env.SVM_PRIVATE_KEY)),
});
registerExactHederaScheme(client, {
  signer: createClientHederaSigner(
    process.env.HEDERA_ACCOUNT_ID,
    PrivateKey.fromStringECDSA(process.env.HEDERA_PRIVATE_KEY),
    { network: process.env.HEDERA_NETWORK || "hedera:testnet" },
  ),
});

const api = wrapAxiosWithPayment(axios.create(), client);

const response = await api.get("http://localhost:4021/weather");
console.log(response.data);
```

## Prerequisites

- Node.js v20+ (install via [nvm](https://github.com/nvm-sh/nvm))
- pnpm v10 (install via [pnpm.io/installation](https://pnpm.io/installation))
- A running x402 server (see [express server example](../../servers/express))
- Valid EVM and/or SVM private keys for making payments

## Setup

1. Install and build all packages from the typescript examples root:

```bash
cd ../../
pnpm install && pnpm build
cd clients/axios
```

2. Copy `.env-local` to `.env` and add your private keys:

```bash
cp .env-local .env
```

Required environment variables:

- `EVM_PRIVATE_KEY` - Ethereum private key for EVM payments
- `SVM_PRIVATE_KEY` - Solana private key for SVM payments
- `HEDERA_ACCOUNT_ID` - Hedera account id for Hedera payments (optional)
- `HEDERA_PRIVATE_KEY` - Hedera **ECDSA** private key (0x-prefixed or DER-encoded) for Hedera payments (optional)
- `HEDERA_NETWORK` - Hedera network (optional, default `hedera:testnet`)

3. Run the client:

```bash
pnpm start
```

## Next Steps

See [Advanced Examples](../advanced/) for builder pattern registration, payment lifecycle hooks, and network preferences.
