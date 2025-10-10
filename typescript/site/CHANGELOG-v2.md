# Proposed V2 Changelog

## Goals:

1. Create clearer separation between the Spec, Facilitator, and SDK
2. Make it easier to add new networks, schemes, and generally extend the base x402 packages and spec for experimentation
3. Improve x402's conformity to common web standards and best practices
4. Codify learnings from experiments related to discovery
5. Give resource servers more tools to engage clients
6. Maintain backwards compatibility with v1 in the reference SDK, within a namespace

## x402 Spec

### Concept: Separation of Spec, Facilitator, and SDK

x402 v2 establishes clear boundaries between three distinct layers:

1. **The Specification** - Core protocol for payment signaling, consent, and settlement
2. **Facilitator** – (optional) verification and onchain/offchain settlement
3. **SDK** – Reference tools for client/server usage, with modular configuration

This will materialize across documentation, code, and complimentary materials.

### Version

Increment `x402Version` to `2`.

### PaymentRequirements

1. Network

**What**: `network` to be moved from a custom identifier per-chain, to the CAIP-2 format for Blockchains. (e.g. `eip155:8453`, `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`). Custom network identifers remain valid for non-blockchain networks (ex: `cloudflare`, `ach`, `sepa`)

```git
-  "network": "base" | "solana"
+  "network": "eip155:8453" | "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp" | "cloudflare" | "ach"
```

**Why**: Leveraging existing standards for blockchain networks will improves portability, and simplifies integrations with other networks. However, supporting fiat requires supporting non-blockchain networks, therefore the flexibility of a custom network identifier is required.

2. Asset

**What**: `asset`'s definition to be expanded beyond a token contract address to include [ISO 4217](https://www.iso.org/iso-4217-currency-codes.html) currency codes when referring to fiat.

```git
-  "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 | "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
+  "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 | "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" | "USD"
```

**Why**: Fiat is not expressed in token contract addresses. ISO 4217 is the international standard for expressing fiat.

**Validation rule**: ISO 4217 codes must appear only with custom networks, not CAIP-2 encoded networks.

3. PayTo

**What**: `payTo`'s definition to be expanded to include either an address or a constant (e.g. `merchant`).

```
-  "payTo": "0x209693Bc6afc0C5328bA36FaF04C514EF312287C" | "2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHEBg4"
+  "payTo": "0x209693Bc6afc0C5328bA36FaF04C514EF312287C" | "2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHEBg4" | "merchant"
```

**Why**: A facilitator who is faciliating a fiat transfer will not have an address for this transfer. Instead, the facilitator would resolve the `payTo` based on the `resource`, therefore `payTo` represents a role in association with the resource.

4. Schema

**What**: `outputSchema` to be been renamed to `schema`. Though schema remains optional and flexible, the recommended structure to ensure robustness and interopability between Bazaars is to have an internal `input` and `output` properties, specific to the transport (ex: `http`, `a2a`, `mcp`).

```
  "schema": {
    "input": <transport specific input> | undefined
    "output": <transport specific output> | undefined
  } | undefined
```

**Why**: `outputSchema` became overloaded in v1, being repurposed to support both `input` and `output` schemas. This rename codifies this behavior into the spec. The recommended input structure remains flexible, however the suggested path is to ensure compatibility with the emerging Bazaar standard being built ontop of x402, and ensures a clear separation of concerns between transport protocols.

5. MimeType

**What**: `mimeType` to be removed, with the suggestion that it be moved into `schema.output`.

**Why**: `mimeType` is a HTTP concern, while x402 is a transport agnostic protocol for payments.

6. External Id

**What**: `externalId` to be added as a new optional field of the `PaymentRequirements`

```git
+  "externalId": "1" | "1b0ef9cf-5d80-4b43-bd1f-aa5c3787179f" | undefined
```

**Why**: There is no way to associate a `PaymentRequirement` with an external identifier such as an ID from a proprietary database or external payments service. There is also no way to guarantee the provided `PaymentPayload` is for a specific `PaymentRequirements`, only that it satisfies the payment constraints of a `PaymentRequirements`. This allows the resource server to create flexible associations between `PaymentRequirements` and `PaymentPayload`

**Validation Rules**: Both `PaymentRequirements` and `PaymentPayload` must have matching `externalId` values.

#### Updated PaymentRequirements

| Field Name | Type | Required | Description |
| --- | --- | --- | --- |
| `scheme` | `string` | Required | Payment scheme identifier (e.g., "exact") |
| `network` | `string` | Required | Network identifier in CAIP-2 format (e.g., "eip155:84532") or custom string |
| `maxAmountRequired` | `string` | Required | Required payment amount in atomic token units |
| `asset` | `string` | Required | Token contract address or ISO 4217 currency code |
| `payTo` | `string` | Required | Recipient wallet address for the payment or a constant (e.g. "merchant") |
| `resource` | `string` | Required | URL of the protected resource |
| `description` | `string` | Required | Human-readable description of the resource |
| `maxTimeoutSeconds` | `number` | Required | Maximum time allowed for payment completion |
| `externalId` | `string` | Optional | Unique identifier for the payment requirement |
| `schema` | `object` | Optional | JSON schema describing the request & response formats |
| `extra` | `object` | Optional | Scheme-specific additional information |

### PaymentPayload

1. Network

Same as PaymentRequirements' `network` change (e.g. `eip155:8453`, `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`)

```git
-  "network": "base" | "solana"
+  "network": "eip155:8453" | "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp" | "cloudflare" | "ach"
```

2. External Id

Same as PaymentRequirements' `externalId` change

```git
+  "externalId": "1" | "1b0ef9cf-5d80-4b43-bd1f-aa5c3787179f"
```

#### Updated PaymentPayload

| Field Name | Type | Required | Description |
| --- | --- | --- | --- |
| `x402Version` | `number` | Required | Protocol version identifier |
| `scheme` | `string` | Required | Payment scheme identifier (e.g., "exact") |
| `network` | `string` | Required | Network identifier in CAIP-2 format (e.g., "eip155:84532") or custom string |
| `payload` | `object` | Required | Payment data object |
| `externalId` | `string` | Optional | Unique identifier referencing the payment requirement |

### Signed Identifier

**What**: A new concept called the `SignedIdentifier` to be added. This optional object to allow a client to provide proof of controlling a signer that may have previously paid for a resource. Servers to be able to use the signed identifier to validate that a customer did in fact pay for a resource, and grant the caller access without requiring repurchase. `SignedIdentifer` is to be included on initial request to allow servers to skip the 402 response, if they have identified the client has paid. In the http transport this would be included as a `Signed-Identifier` header.

```git
+  "signedIdentifier": {
+    "resource": "https://api.example.com/data/123",
+    "expiry": 1735689600,
+    "curve": "secp256k1",
+    "signature": "0x..."
+  } | undefined
```

**Why**: Currently, there is no standardized way for clients to prove they have previously paid for a resource without re-submitting the full payment payload. This creates friction for returning users and prevents access to previously purchased content. The `SignedIdentifier` provides a lightweight authentication mechanism that proves wallet ownership without requiring on-chain verification for every access attempt.

**Validation Rules**:

- The `signature` must be a valid signature of the concatenated `resource` and `expiry` fields using the specified `curve`
- The `expiry` timestamp must be in the future at the time of verification
- It is advised that servers reject signatures that expire at `> time.now() + 1 minute` or `<time.now()`.
- The signing address recovered from the signature should match a previously verified payment for the specified `resource`

**Note:** content access policies should not be tied to signature expiry. Ex: It is fully valid to have 30 day access for a resource tied to the signing address that issues many signature over time.

#### SignedIdentifier Structure

| Field Name | Type | Required | Description |
| --- | --- | --- | --- |
| `resource` | `string` | Required | URL of the protected resource being accessed |
| `expiry` | `number` | Required | The expiry timestamp of the signature in epoch seconds |
| `curve` | `string` | Required | The cryptographic curve used for signing (e.g., "secp256k1", "ed25519") |
| `signature` | `string` | Required | The signature of the concatenated resource and expiry |

**Transport Considerations**:

- **HTTP**: transmitted as a custom header (e.g., `SIGNED-IDENTIFIER`) with base64-encoded JSON
- **MCP**: included as a parameter in the tool request
- **A2A**: included in the message payload structure

**NOTE**: We encourage additional feedback from builders operating in the A2A and MCP spaces regarding the best way to incorporate the signed identifier into the transport flows.

## HTTP Transport

### PAYMENT-SIGNATURE

**What**: `X-PAYMENT` header to be renamed to `PAYMENT-SIGNATURE`

**Why**: The `X-` prefix has been deprecated since RFC 6648. The IETF recommends against using the "X-" prefix for HTTP headers because:

1. It creates standardization challenges when experimental headers become widely adopted
2. Many "X-" headers become de facto standards but remain permanently marked as "experimental"
3. It leads to interoperability issues when transitioning from experimental to standard status

The new `PAYMENT-SIGNATURE` name is more descriptive and follows modern HTTP header naming conventions.

### PAYMENT-REQUIRED

**What**: The 402 status code response body to be moved to a `PAYMENT-REQUIRED` header and be base64 encoded.

**Why**: Headers separate protocol metadata from application content, allowing servers to return HTML paywalls for browsers or custom error messages while preserving payment requirements. This also improves middleware compatibility since many frameworks expect to control response bodies.

### PAYMENT-RESPONSE

**What**: The `X-PAYMENT-RESPONSE` header to be renamed to `PAYMENT-RESPONSE`

**Why**: Same as PAYMENT-SIGNATURE above. The `X-` prefix has been deprecated since RFC 6648 to avoid standardization and interoperability issues.

### SIGNED-IDENTIFIER

**What**: A new optional `SIGNED-IDENTIFIER` header containing a base64-encoded payload proving wallet ownership, allowing access to previously purchased resources without re-payment.

**Why**: Eliminates friction for returning users by providing lightweight proof of prior payment on first request without requiring full payment re-submission or on-chain verification for every access.

## SDK Refactor

### Modularize Schemes & Networks

**What**: Replace hardcoded if/else chains with a single `SchemeNetworkImplementation` interface and builder pattern registration.

```typescript
interface SchemeNetworkClient {
  readonly scheme: string; // ex: "exact"

  createPaymentPayload(signer, requirements, version): Promise<string>;
  signPaymentPayload(string): Promise<string>;
}

interface SchemeNetworkFacilitator {
  readonly scheme: string; // ex: "exact"

  verify(client, payload, requirements): Promise<VerifyResponse>;
  settle(signer, payload, requirements): Promise<SettleResponse>;
}

// Usage
const client = new x402Client()
  .registerScheme("eip155:*", new ExactEvmImplementation(evmWallet))
  .registerScheme("solana:*", new ExactSvmImplementation(svmWallet))
  .withIndentitySigner(svmWallet);

// Facilitator
const facilitator = new x402Facilitator()
  .registerScheme("eip155:*", new ExactEvmImplementation(evmWallet))
  .registerScheme("solana:*", new ExactSvmImplementation(svmWallet));
```

**Why**: Currently, contributors must navigate nested directories, modify core switching logic in `client/createPaymentHeader.ts` and `facilitator/facilitator.ts`, and understand internal coupling to add support for new blockchains or payment schemes. This refactor eliminates these barriers by providing a single interface to implement and explicit registration.

**Implementation Packaging**: The EVM and SVM implementations to be extracted into separate packages (`@x402/evm` and `@x402/svm`) to serve as reference implementations. For developer experience, they will be imported by default in the core `@x402/core` package, but their separation allows them to demonstrate the implementation pattern for future schemes and networks.

**Extensibility**: After this refactor, adding support for new networks, schemes, or implementations will not require a PR to the core repository. Developers can create their own packages implementing the `SchemeNetworkClient` and `SchemeNetworkFacilitator` interfaces and use them immediately. We will continue to welcome PRs to add new implementations as official packages, but unofficial packages will be fully compatible with plug-and-play functionality.

### Client Configuration

The sdk will export a client type contructed via a builder pattern, that is leveraged for reference client packages such as `@x402/axios` and `@x402/fetch`

#### Composable Client Architecture

**What**: Clients to become composable containers for signers, scheme implementations, and policy lambdas, eliminating rigid wallet type requirements and enabling experimentation.

**Key Changes:**

(see builder pattern above for scheme / network changes)

**Lambda-Based Policy Engine**

```typescript
client
  .addPolicy(paymentReq => paymentReq.maxAmountRequired <= 100_000)
  .addPolicy(paymentReq => paymentReq.network !== "eip155:1") // no mainnet
  .addPolicy((paymentReq, context) => context.timestamp > startTime);
```

**Why**: Current clients hardcode specific wallet types and schemes, creating friction for developers experimenting with new payment schemes or integrating different wallet libraries. This composable approach enables:

- Custom scheme implementations without SDK modifications
- Any wallet/signing library integration
- Runtime-configurable payment policies
- Immediate usability without build steps

### Middleware Configuration

#### Per-Route `payTo` Payment Configuration

**What**: The `payTo` parameter to move from a global middleware parameter into per-route configuration, allowing different payment addresses and networks for each endpoint.

**Before:**

```typescript
paymentMiddleware(
  "0x209693Bc6afc0C5329bA36FaF03C514EF312287C", // Single payTo for all routes
  routes,
);
```

**After:**

```typescript
paymentMiddleware({
  "/api/evm": {
    payTo: "0x209693Bc6afc0C5329bA36FaF03C514EF312287C",
    price: "$0.01",
    network: "eip155:84532",
  },
  "/api/solana": {
    payTo: "ABC123...",
    price: "$0.01",
    network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
  },
});
```

**Why**: Enables multi-chain applications and marketplace scenarios where different endpoints may have different payment recipients or operate on different networks.

#### Dynamic Payment Recipients

**What**: The `payTo` parameter to be a callback function that determines the payment recipient at runtime based on request context.

```typescript
{
  "POST /api/marketplace": {
    payTo: async (request) => {
      const productId = request.body.productId;
      const sellerAddress = await getSellerAddress(productId);
      return sellerAddress; // Returns address string
    },
    price: "$0.10",
    network: "eip155:84532
  }
}
```

**Why**: Enables marketplace models, revenue sharing, and context-dependent payment routing where the recipient cannot be determined at build time (e.g., user-generated content, dynamic seller selection, commission splits).

#### Multiple Payment Options Per Endpoint

**What**: Endpoints to accept an array of payment configurations, allowing clients to choose their preferred payment network and currency.

```typescript
{
  "/api/data": [
    {
      payTo: "0x209693Bc6afc0C5329bA36FaF03C514EF312287C",
      price: "$0.01",
      network: "eip155:8453"
    },
    {
      payTo: "2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg5",
      price: "0.05",
      network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"
    },
  ]
}
```

**Why**: Provides payment flexibility for clients with different network preferences, reduces friction by supporting multiple currencies, and enables automatic failover if one network is congested or unavailable.

#### Dynamic Pricing

**What**: Price to be a callback function that determines pricing at runtime based on request context.

```typescript
{
  "/api/data": {
    price: async (request) => {
      const tier = request.query.tier;
      return tier === "premium" ? "$0.10" : "$0.01";
    },
    payTo: "0x209693Bc6afc0C5329bA36FaF03C514EF312287C",
    network: "base-sepolia"
  }
}
```

**Why**: Enables flexible pricing models including user-specific pricing, time-based rates, usage tiers, and request complexity-based pricing without requiring separate endpoints.

#### Network-Specific Convenience Wrappers

**What**: Introduction of network and asset specific middleware wrappers like `usdcOnBase()`, `usdcOnSolana()`, etc., that provide pre-configured setups for common payment stacks.

```typescript
// Before: Manual configuration
paymentMiddleware({
  "/api/*": {
    payTo: "0x309693Bc6afc0C5328bA36FaF03C514EF312287D",
    price: "$0.01",
    network: "eip155:8453",
  },
});

// After: Network-optimized wrapper
usdcOnBase(payTo, { "/api/*": "$0.01" });
```

**Why**: Reduces configuration complexity for faster development when following common patterns.

### Facilitator Usage in Middlewares

#### Startup Validation

**What**: Middlewares to optionally validate facilitator compatibility at startup by calling `/supported` on each facilitator and building a scheme→network→facilitator mapping.

**Why**: Ensures configuration errors are caught immediately at startup rather than during runtime payment attempts, improving reliability and debugging.

**Note**: Validation can be skipped for serverless/lambda environments where startup time is critical.

#### Multiple Facilitator Support

**What**: Middlewares to accept an array of facilitator configurations or a single facilitator.

```typescript
const facilitators = [
  { url: "https://base.facilitator.com" },
  { url: "https://solana.facilitator.com" },
  { url: "https://polygon.facilitator.com" },
];
// or
const facilitators = "https://base.facilitator.com";
```

**Why**: Expands the supported payment schemes, networks, and assets that a single server can accept by combining multiple specialized facilitators. Also provides redundancy and enables gradual migration between providers.
