# @x402/hedera

Hedera implementation of the x402 `exact` payment scheme (v2).

## Installation

```bash
pnpm add @x402/hedera
```

## Features

- x402 v2 exact scheme support for Hedera (`hedera:mainnet`, `hedera:testnet`)
- HBAR (`asset: 0.0.0`) and HTS fungible token payment validation
- Facilitator fee payer model via `paymentRequirements.extra.feePayer`
- Configurable alias handling policy (`allow` or `reject`, default `reject`)
- Server-side money parser chain with configured HTS fallback conversion

## Usage

### Client

```ts
import { x402Client } from "@x402/core/client";
import { createClientHederaSigner } from "@x402/hedera";
import { ExactHederaScheme } from "@x402/hedera/exact/client";

const signer = createClientHederaSigner("0.0.1111", process.env.HEDERA_PRIVATE_KEY!, {
  network: "hedera:testnet",
});

const client = new x402Client().register("hedera:*", new ExactHederaScheme(signer));
```

### Server

```ts
import { x402ResourceServer } from "@x402/core/server";
import { ExactHederaScheme } from "@x402/hedera/exact/server";

const server = new x402ResourceServer(facilitatorClient);
server.register(
  "hedera:*",
  new ExactHederaScheme({
    defaultAssets: {
      "hedera:testnet": { asset: "0.0.6001", decimals: 6 },
      "hedera:mainnet": { asset: "0.0.9001", decimals: 6 },
    },
  }),
);
```

### Facilitator

```ts
import { x402Facilitator } from "@x402/core/facilitator";
import { ExactHederaScheme } from "@x402/hedera/exact/facilitator";

const facilitatorSigner = {
  getAddresses: () => ["0.0.5001"],
  signAndSubmitTransaction: async () => ({ transactionId: "0.0.5001@1700000000.000000000" }),
};

const facilitator = new x402Facilitator().register(
  "hedera:*",
  new ExactHederaScheme(facilitatorSigner, { aliasPolicy: "reject" }),
);
```

## Amount Units

- HBAR (`asset: "0.0.0"`): amount is in tinybars (1 HBAR = 10^8 tinybars).
- HTS fungible token: amount is in token smallest units according to token decimals.

## Alias Policy

- `reject` (default): facilitator may reject `payTo` values that resolve as aliases/non-existing accounts.
- `allow`: facilitator allows alias destinations.

Implementations should document and monitor this policy because alias-based auto-account creation may introduce additional cost.
