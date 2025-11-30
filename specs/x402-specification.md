# X402 Protocol Specification

**Document Scope**

This specification defines the core x402 protocol for internet-native payments. It covers:

- **Protocol fundamentals**: Payment requirements format, payment payload structure, and core message schemas
- **Facilitator interface**: Standard APIs for payment verification and settlement
- **Payment schemes**: Extensible payment methods (currently supporting the "exact" scheme)
- **Security considerations**: Replay attack prevention and trust minimization

**Out of Scope**: This specification does not include:

- Transport-specific implementations (covered in transport specifications)
- Specific implementation patterns (covered in application notes)
- Framework-specific integrations
- Client-side budget management
- Session handling mechanisms

**Architecture**

x402 is made up of three core components:

1. **Types**: Core data structures (e.g., `PaymentRequirements`, `PaymentPayload`, `SettlementResponse`) that are independent of both transport mechanism and payment scheme
2. **Logic**: Payment formation and verification logic that depends on the payment scheme (e.g., exact, deferred) and network (e.g., evm, solana, lightning)
3. **Representation**: How payment data is transmitted and signaled, which depends on the transport mechanism (e.g., HTTP, MCP, A2A)

**1. Overview**

x402 is an open payment standard that enables clients to pay for external resources. The protocol defines standardized message formats and payment flows that can be implemented over various transport layers, providing a standardized mechanism for payments across different payment schemes, networks and transport layers.

This specification is based on the x402 protocol implementation and documentation available in the [Coinbase x402 repository](https://github.com/coinbase/x402). It aims to provide a comprehensive and implementation-agnostic specification for the x402 protocol.

**2. Core Payment Flow**

The x402 protocol follows a standard request-response cycle with payment integration:

1. **Client Request**: Client makes a request to a resource server
2. **Payment Required Response**: If no valid payment is attached, the server responds with a payment required signal and payment requirements
3. **Payment Authorization Request**: Client submits a signed payment authorization in the subsequent request
4. **Settlement Response**: Server verifies the payment authorization and initiates blockchain or Lightning settlement

**3. Protocol Components**

The x402 protocol involves three primary components:

- **Resource Server**: A service that requires payment for access to protected resources (APIs, content, data, etc.)
- **Client**: Any application or agent that requests access to protected resources
- **Facilitator**: A service that handles payment verification and blockchain or Lightning settlement

**4. Response Types**

The x402 protocol defines standard response types with specific semantics:

- **Success**: Request successful, payment verified and settled
- **Payment Required**: Payment required to access the resource
- **Invalid Request**: Invalid payment payload or payment requirements
- **Server Error**: Server error during payment processing

Transport-specific implementations map these response types to appropriate transport mechanisms (e.g., HTTP status codes, JSON-RPC error codes, etc.).

**5. Types**

This section defines the core data structures used in the x402 protocol. These are completely independent of both transport mechanism and payment scheme. All transports and schemes use these exact data structures, differing only in how they represent them (transport layer) and what validation/settlement logic they apply (scheme layer).

**5.1 PaymentRequirementsResponse Schema**

**5.1.1 JSON Payload**

When a resource server requires payment, it responds with a payment required signal and a JSON payload containing payment requirements. Example:

```json
{
  "x402Version": 1,
  "error": "X-PAYMENT header is required",
  "accepts": [
    {
      "scheme": "exact",
      "network": "base-sepolia",
      "maxAmountRequired": "10000",
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "payTo": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
      "resource": "https://api.example.com/premium-data",
      "description": "Access to premium market data",
      "mimeType": "application/json",
      "outputSchema": null,
      "maxTimeoutSeconds": 60,
      "extra": {
        "name": "USDC",
        "version": "2"
      }
    }
  ]
}
```

**5.1.2 Field Descriptions**

The `PaymentRequirementsResponse` schema contains the following fields:

**All fields are required.**
| Field Name | Type | Description |
| ---------- | ---- | ----------- |
| `x402Version` | `number` | Protocol version identifier |
| `error` | `string` | Human-readable error message explaining why payment is required |
| `accepts` | `array` | Array of payment requirement objects defining acceptable payment methods |

Each `PaymentRequirements` object in the `accepts` array contains:

| Field Name          | Type     | Required | Description                                                                                                                                                               |
| ------------------- | -------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scheme`            | `string` | Required | Payment scheme identifier (e.g., "exact")                                                                                                                                 |
| `network`           | `string` | Required | Payment network identifier (e.g., blockchain network "base-sepolia" or Lightning network "btc-lightning-mainnet")                                                         |
| `maxAmountRequired` | `string` | Required | Required payment amount in the smallest unit of the asset (e.g., wei, lamports, sats), represented as a base-10 string                                                    |
| `asset`             | `string` | Required | Asset identifier (e.g., ERC-20 contract address, SPL mint address, or an implementation-defined Lightning asset id such as "BTC" or "lnbits-test-asset")                  |
| `payTo`             | `string` | Required | Recipient identifier for the payment (e.g., EVM address, Solana address, or implementation-defined Lightning destination such as node pubkey, LNURL, or LNbits wallet id) |
| `resource`          | `string` | Required | URL of the protected resource                                                                                                                                             |
| `description`       | `string` | Required | Human-readable description of the resource                                                                                                                                |
| `mimeType`          | `string` | Optional | MIME type of the expected response                                                                                                                                        |
| `outputSchema`      | `object` | Optional | JSON schema describing the response format                                                                                                                                |
| `maxTimeoutSeconds` | `number` | Required | Maximum time allowed for payment completion                                                                                                                               |
| `extra`             | `object` | Optional | Scheme-specific additional information                                                                                                                                    |

**5.2 PaymentPayload Schema**

**5.2.1 JSON Structure**

The client includes payment authorization as JSON in the payment payload field:

```json
{
  "x402Version": 1,
  "scheme": "exact",
  "network": "base-sepolia",
  "payload": {
    "signature": "0x2d6a7588d6acca505cbf0d9a4a227e0c52c6c34008c8e8986a1283259764173608a2ce6496642e377d6da8dbbf5836e9bd15092f9ecab05ded3d6293af148b571c",
    "authorization": {
      "from": "0x857b06519E91e3A54538791bDbb0E22373e36b66",
      "to": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
      "value": "10000",
      "validAfter": "1740672089",
      "validBefore": "1740672154",
      "nonce": "0xf3746613c2d920b5fdabc0856f2aeb2d4f88ee6037b8cc5d04a71a4462f13480"
    }
  }
}
```

**5.2.2 Field Descriptions**

The `PaymentPayload` schema contains the following fields:

**All fields are required.**

| Field Name    | Type     | Description                                                                                                        |
| ------------- | -------- | ------------------------------------------------------------------------------------------------------------------ |
| `x402Version` | `number` | Protocol version identifier (must be 1)                                                                            |
| `scheme`      | `string` | Payment scheme identifier (e.g., "exact")                                                                          |
| `network`     | `string` | Blockchain or Lightning network identifier (e.g., "base-sepolia", "btc-lightning-signet", "btc-lightning-mainnet") |
| `payload`     | `object` | Payment data object                                                                                                |

The `payload` field contains a `SchemePayload` object with scheme-specific data. Its structure depends on the scheme and network.

For the `exact` scheme on **EVM networks**, the payload has the following structure:

**All fields are required.**

| Field Name      | Type     | Description                         |
| --------------- | -------- | ----------------------------------- |
| `signature`     | `string` | EIP-712 signature for authorization |
| `authorization` | `object` | EIP-3009 authorization parameters   |

The `Authorization` object contains the following fields:

**All fields are required.**

| Field Name    | Type     | Description                                     |
| ------------- | -------- | ----------------------------------------------- |
| `from`        | `string` | Payer's wallet address                          |
| `to`          | `string` | Recipient's wallet address                      |
| `value`       | `string` | Payment amount in atomic units                  |
| `validAfter`  | `string` | Unix timestamp when authorization becomes valid |
| `validBefore` | `string` | Unix timestamp when authorization expires       |
| `nonce`       | `string` | 32-byte random nonce to prevent replay attacks  |

For the `exact` scheme on **BTC Lightning networks**, the payload instead carries Lightning invoice data:

```json
{
  "x402Version": 1,
  "scheme": "exact",
  "network": "btc-lightning-signet",
  "payload": {
    "bolt11": "lnbc1testinvoice...",
    "invoiceId": "inv_123"
  }
}
```

Where:

- `bolt11` (`string`, required): BOLT11 Lightning invoice string that the client has paid or will pay
- `invoiceId` (`string`, optional): Implementation-specific invoice identifier for facilitator backends (e.g., LNbits payment id)

**5.3 SettlementResponse Schema**

**5.3.1 JSON Structure**

After payment settlement, the server includes transaction details in the payment response field as JSON:

```json
{
  "success": true,
  "transaction": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
  "network": "base-sepolia",
  "payer": "0x857b06519E91e3A54538791bDbb0E22373e36b66"
}
```

**5.3.2 Field Descriptions**

The `SettlementResponse` schema contains the following fields:

| Field Name    | Type      | Required | Description                                                                                                                                               |
| ------------- | --------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `success`     | `boolean` | Required | Indicates whether the payment settlement was successful                                                                                                   |
| `errorReason` | `string`  | Optional | Error reason if settlement failed (omitted if successful)                                                                                                 |
| `transaction` | `string`  | Required | Settlement identifier (e.g., blockchain transaction hash, Lightning payment hash, invoice ID, or synthetic identifier); empty string if settlement failed |
| `network`     | `string`  | Required | Blockchain or Lightning network identifier                                                                                                                |
| `payer`       | `string`  | Required | Payer identifier (e.g., wallet address or Lightning node pubkey, depending on the scheme)                                                                 |

**6. Payment Schemes (The Logic)**

This section describes the payment schemes supported by the x402 protocol. Payment schemes define how payments are formed, validated, and settled on specific payment networks. Schemes are independent of the underlying transport mechanism.

Each scheme defines:

- How to construct the `payload` field within `PaymentPayload`
- Settlement and validation procedures
- Scheme-specific requirements in the `extra` field of `PaymentRequirements`

**6.1 Exact Scheme (EVM overview)**

The "exact" scheme uses EIP-3009 (Transfer with Authorization) to enable secure, gasless transfers of specific amounts of ERC-20 tokens.

**6.1.1 EIP-3009 Authorization**

The authorization follows the EIP-3009 standard for `transferWithAuthorization`:

```javascript
const authorizationTypes = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
};
```

**6.1.2 Verification Steps**

The facilitator performs the following verification steps:

1. **Signature Validation**: Verify the EIP-712 signature is valid and properly signed by the payer
2. **Balance Verification**: Confirm the payer has sufficient token balance for the transfer
3. **Amount Validation**: Ensure the payment amount meets or exceeds the required amount
4. **Time Window Check**: Verify the authorization is within its valid time range
5. **Parameter Matching**: Confirm authorization parameters match the original payment requirements
6. **Transaction Simulation**: Simulate the `transferWithAuthorization` transaction to ensure it would succeed

**6.1.3 Settlement**

Settlement is performed by calling the `transferWithAuthorization` function on the ERC-20 contract with the signature and authorization parameters provided in the payment payload.

**6.2 Exact Scheme (SVM overview)**

For Solana (SVM), the `exact` scheme is implemented using `TransferChecked` for SPL tokens. Critical verification requirements include:

- Enforcing a strict instruction layout (Compute Unit Limit, Compute Unit Price, optional ATA Create, TransferChecked)
- Ensuring the facilitator fee payer does not appear in any instruction accounts and is not the transfer `authority` or `source`
- Bounding compute unit price to mitigate gas abuse
- Verifying the destination ATA matches the `payTo`/`asset` PDA and account existence rules
- Requiring the transfer `amount` to exactly equal `maxAmountRequired`

Full SVM details are specified in `specs/schemes/exact/scheme_exact_svm.md`.

**6.3 Exact Scheme (BTC Lightning overview)**

For BTC Lightning networks, the `exact` scheme uses BOLT11 invoices instead of on-chain authorizations. The client pays, or commits to pay, a specific-amount Lightning invoice identified by its `bolt11` string, and the facilitator verifies payment status via a Lightning backend.

Key properties:

- Off-chain, invoice-based payments denominated in satoshis
- Facilitator cannot move client funds; it can only inspect invoice state in a Lightning backend
- Suitable for low-latency, low-fee micropayments and high-frequency calls
- Supported networks include `btc-lightning-signet` (test/signet) and `btc-lightning-mainnet` (mainnet)

Payload and requirements summary:

- `PaymentRequirements` for Lightning:
  - `scheme`: `"exact"`
  - `network`: `"btc-lightning-signet"` or `"btc-lightning-mainnet"`
  - `asset`: typically `"BTC"` or an implementation-defined Lightning asset identifier (e.g., `"lnbits-test-asset"`)
  - `payTo`: Lightning recipient identifier (e.g., node pubkey, LNURL-pay, or another implementation-defined Lightning recipient identifier such as an LNbits wallet id)
- `PaymentPayload.payload`:
  - `bolt11`: BOLT11 Lightning invoice string (required)
  - `invoiceId`: Optional implementation-specific invoice identifier

Verification and settlement outline:

- Basic x402 checks on `scheme`, `network`, and payload shape
- Structural validation that `bolt11` looks like a Lightning invoice (e.g., prefix `ln`, base32-ish character set)
- Lightning backend is responsible for authoritative checks:
  - invoice is for the correct network and payee
  - amount received ≥ `maxAmountRequired` (in sats)
  - invoice not expired or cancelled
- Settlement is modeled as "invoice is settled" rather than an on-chain transaction; the `transaction` field in `SettlementResponse` typically carries a payment hash, invoice ID, or synthetic identifier. In the PoC, `transaction` may simply be set to `invoiceId` if present, or the `bolt11` string as a fallback.

Full Lightning details are specified in `specs/schemes/exact/scheme_exact_btc_lightning.md`.

**7. Facilitator Interface**

The facilitator provides HTTP REST APIs for payment verification and settlement. This allows resource servers to delegate blockchain or Lightning operations to trusted third parties or host the endpoints themselves. Note that while the core x402 protocol is transport-agnostic, facilitator APIs are currently standardized as HTTP endpoints.

**7.1 POST /verify**

Verifies a payment authorization without executing the transaction on the blockchain or Lightning network.

**Request (Exact Scheme):**

```json
{
  "paymentPayload": {
    /* PaymentPayload schema */
  },
  "paymentRequirements": {
    /* PaymentRequirements schema */
  }
}
```

Example with actual data:

```json
{
  "paymentPayload": {
    "x402Version": 1,
    "scheme": "exact",
    "network": "base-sepolia",
    "payload": {
      "signature": "0x...",
      "authorization": {
        "from": "0x...",
        "to": "0x...",
        "value": "10000",
        "validAfter": "1740672089",
        "validBefore": "1740672154",
        "nonce": "0x..."
      }
    }
  },
  "paymentRequirements": {
    "scheme": "exact",
    "network": "base-sepolia",
    "maxAmountRequired": "10000",
    "resource": "https://api.example.com/premium-data",
    "description": "Access to premium market data",
    "mimeType": "application/json",
    "payTo": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
    "maxTimeoutSeconds": 60,
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "extra": {
      "name": "USDC",
      "version": "2"
    }
  }
}
```

**Successful Response:**

```json
{
  "isValid": true,
  "payer": "0x857b06519E91e3A54538791bDbb0E22373e36b66"
}
```

**Error Response:**

```json
{
  "isValid": false,
  "invalidReason": "insufficient_funds",
  "payer": "0x857b06519E91e3A54538791bDbb0E22373e36b66"
}
```

**7.2 POST /settle**

Executes a verified payment by broadcasting the transaction to the blockchain or confirming settlement in a Lightning backend.

**Request:** Same as `/verify` endpoint

**Successful Response:**

```json
{
  "success": true,
  "payer": "0x857b06519E91e3A54538791bDbb0E22373e36b66",
  "transaction": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
  "network": "base-sepolia"
}
```

**Error Response:**

```json
{
  "success": false,
  "errorReason": "insufficient_funds",
  "payer": "0x857b06519E91e3A54538791bDbb0E22373e36b66",
  "transaction": "",
  "network": "base-sepolia"
}
```

**7.3 GET /supported**

Returns the list of payment schemes and networks supported by the facilitator.

**Response:**

```json
{
  "kinds": [
    {
      "x402Version": 1,
      "scheme": "exact",
      "network": "base-sepolia"
    },
    {
      "x402Version": 1,
      "scheme": "exact",
      "network": "base"
    },
    {
      "x402Version": 1,
      "scheme": "exact",
      "network": "avalanche-fuji"
    },
    {
      "x402Version": 1,
      "scheme": "exact",
      "network": "avalanche"
    },
    {
      "x402Version": 1,
      "scheme": "exact",
      "network": "iotex"
    }
  ]
}
```

**8. Discovery API**

The x402 protocol includes a discovery mechanism that allows clients to find and explore available x402-enabled resources. This enables the creation of marketplaces (known as "Bazaars") where users can discover and access monetized APIs and digital services.

Discovery is currently implemented as HTTP REST APIs, though the discovered resources may use any x402-supported transport.

8.1 GET /discovery/resources

List discoverable x402 resources from the Bazaar.

**Request Parameters:**

| Parameter | Type     | Required | Description                                 | Default |
| --------- | -------- | -------- | ------------------------------------------- | ------- |
| `type`    | `string` | Optional | Filter by resource type (e.g., "http")      | -       |
| `limit`   | `number` | Optional | Maximum number of results to return (1-100) | 20      |
| `offset`  | `number` | Optional | Number of results to skip for pagination    | 0       |

**Response:**

```json
{
  "x402Version": 1,
  "items": [
    {
      "resource": "https://api.example.com/premium-data",
      "type": "http",
      "x402Version": 1,
      "accepts": [
        {
          "scheme": "exact",
          "network": "base-sepolia",
          "maxAmountRequired": "10000",
          "resource": "https://api.example.com/premium-data",
          "description": "Access to premium market data",
          "mimeType": "application/json",
          "payTo": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
          "maxTimeoutSeconds": 60,
          "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
          "extra": {
            "name": "USDC",
            "version": "2"
          }
        }
      ],
      "lastUpdated": 1703123456,
      "metadata": {
        "category": "finance",
        "provider": "Example Corp"
      }
    }
  ],
  "pagination": {
    "limit": 10,
    "offset": 0,
    "total": 1
  }
}
```

**8.2 Discovered Resource Fields**

| Field Name    | Type     | Required | Description                                                     |
| ------------- | -------- | -------- | --------------------------------------------------------------- |
| `resource`    | `string` | Required | The resource URL or identifier being monetized                  |
| `type`        | `string` | Required | Resource type (currently "http" for HTTP endpoints)             |
| `x402Version` | `number` | Required | Protocol version supported by the resource                      |
| `accepts`     | `array`  | Required | Array of PaymentRequirements objects specifying payment methods |
| `lastUpdated` | `number` | Required | Unix timestamp of when the resource was last updated            |
| `metadata`    | `object` | Optional | Additional metadata (category, provider, etc.)                  |

**8.3 Bazaar Concept**

The Bazaar is a marketplace ecosystem where x402-enabled resources can be discovered and accessed. Key features:

- **Resource Discovery**: Find APIs and services by category, provider, or payment requirements
- **Payment Transparency**: View pricing and payment methods upfront
- **Provider Information**: Learn about service providers and their offerings
- **Dynamic Updates**: Resources can be added, updated, or removed dynamically

**8.4 Example Usage**

```bash
# Discover financial data APIs
GET /discovery/resources?type=http&limit=10

# Search for specific provider
GET /discovery/resources?metadata[provider]=Coinbase
```

**9. Error Handling**

The x402 protocol defines standard error codes that may be returned by facilitators or resource servers. These error codes help clients understand why a payment failed and take appropriate action.

- **`insufficient_funds`**: Client does not have enough tokens to complete the payment
- **`invalid_exact_evm_payload_authorization_valid_after`**: Payment authorization is not yet valid (before validAfter timestamp)
- **`invalid_exact_evm_payload_authorization_valid_before`**: Payment authorization has expired (after validBefore timestamp)
- **`invalid_exact_evm_payload_authorization_value`**: Payment amount is insufficient for the required payment
- **`invalid_exact_evm_payload_signature`**: Payment authorization signature is invalid or improperly signed
- **`invalid_exact_evm_payload_recipient_mismatch`**: Recipient address does not match payment requirements
- **`invalid_network`**: Specified blockchain or Lightning network is not supported
- **`invalid_payload`**: Payment payload is malformed or contains invalid data
- **`invalid_payment_requirements`**: Payment requirements object is invalid or malformed
- **`invalid_scheme`**: Specified payment scheme is not supported
- **`unsupported_scheme`**: Payment scheme is not supported by the facilitator
- **`invalid_x402_version`**: Protocol version is not supported
- **`invalid_transaction_state`**: Transaction or settlement failed or was rejected
- **`unexpected_verify_error`**: Unexpected error occurred during payment verification
- **`unexpected_settle_error`**: Unexpected error occurred during payment settlement

**10. Security Considerations**

**10.1 Replay Attack Prevention**

The x402 protocol implements multiple layers of protection against replay attacks:

- **EIP-3009 Nonce**: Each authorization includes a unique 32-byte nonce to prevent replay attacks
- **Blockchain Protection**: EIP-3009 contracts inherently prevent nonce reuse at the smart contract level
- **Time Constraints**: Authorizations have explicit valid time windows to limit their lifetime
- **Signature Verification**: All authorizations are cryptographically signed by the payer
- **Lightning Invoices**: For BTC Lightning, BOLT11 invoices are single-use by design; facilitators should rely on backend invoice state and identifiers to prevent reuse across requests

**10.2 Authentication Integration**

The protocol supports integration with authentication systems (e.g., Sign-In with Ethereum - SIWE) to enable authenticated pricing models where verified users receive discounted rates or special access terms.

**11. Implementation Notes**

**11.1 Supported Networks**

The following networks are currently supported by the reference implementation (non-exhaustive):

- **`base-sepolia`**: Base Sepolia testnet (Chain ID: 84532)
- **`base`**: Base mainnet (Chain ID: 8453)
- **`avalanche-fuji`**: Avalanche Fuji testnet (Chain ID: 43113)
- **`avalanche`**: Avalanche mainnet (Chain ID: 43114)
- **`solana-devnet`**: Solana Devnet
- **`solana`**: Solana mainnet-beta
- **`btc-lightning-signet`**: Bitcoin Lightning Signet (test/signet) network
- **`btc-lightning-mainnet`**: Bitcoin Lightning mainnet

**11.2 Supported Assets**

The protocol currently supports the following token and asset types:

- **`USDC`**: USD Coin (EIP-3009 compliant ERC-20 token)
- **Additional ERC-20 tokens**: May be supported if they implement EIP-3009 (Transfer with Authorization)
- **SPL tokens**: For Solana/SVM, tokens supported via `TransferChecked` according to the SVM `exact` scheme
- **BTC on Lightning**: For Lightning networks, payments denominated in satoshis with `asset` typically set to `"BTC"` or another implementation-defined Lightning asset identifier

Token support depends on:

- EIP-3009 compliance for the "exact" scheme on EVM
- SPL token support and program constraints for the SVM scheme
- Facilitator service capabilities
- Network-specific token/asset availability

**12. Use Cases and Applications**

The x402 protocol enables diverse monetization scenarios across the internet. While the core protocol is HTTP-native and chain-agnostic, specific implementations can vary based on use case requirements.

### 12.1 AI Agent Integration

AI agents can use x402 to autonomously pay for resources and services. The protocol supports:

- **Automatic payment handling** for resource access
- **Resource discovery** through facilitator services
- **Budget management** and spending controls (implementation-specific)
- **Correlation tracking** for operation grouping (implementation-specific)
- **Multi-transport support** allowing agents to work across HTTP APIs, MCP tools, and other protocol layers

### 12.2 Human User Applications

Applications can implement x402 for:

- **Session-based access** (time-limited subscriptions)
- **Pay-per-use content** (articles, videos, downloads, tools)
- **Resource monetization** with per-call pricing
- **Authentication-based pricing** (discounted rates for verified users)
- **Cross-protocol payments** supporting web, desktop, and AI applications

### 12.3 Transport Support

x402 integrates across multiple transport layers:

- **HTTP**: Web APIs, REST services, server frameworks (Express.js, FastAPI, Next.js, etc.)
- **MCP (Model Context Protocol)**: AI agent tools and resources
- **A2A (Agent-to-Agent Protocol)**: Direct agent-to-agent payments
- **Custom Protocols**: Any request-response based system can implement x402 payment flows

### 12.3 Server Frameworks

x402 integrates with popular frameworks:

- **Express.js**: `require_payment()` middleware
- **FastAPI/Flask**: Framework-specific middleware
- **Hono**: Edge runtime support
- **Next.js**: Fullstack integration
- **ai/agents**: AI agent and MCP frameworks

### 12.4 Client Libraries

Clients across different transports can be enhanced with x402 payment capabilities:

- **HTTP clients**: axios/fetch (browser), httpx/requests (Python), curl (CLI)
- **MCP clients**: ai/agents MCP Clients
- **A2A**: x402_a2a (python)
- **Custom integrations**: Application-specific payment handling

### 12.5 Advanced Patterns

The protocol enables sophisticated monetization strategies:

- **Dynamic pricing** based on user authentication or usage patterns
- **Session management** for time-based access control
- **Batch payments** for multiple resource access
- **Subscription models** built on micropayments

_Note: Implementation details for specific patterns (such as budget management, correlation tracking, or session handling) are available in application notes and implementation guides. Transport-specific implementation details are covered in the transport specification documents._

---

## Version History

| Version | Date       | Changes                     | Author                    |
| ------- | ---------- | --------------------------- | ------------------------- |
| v0.3    | 2025-11-30 | Adds btc-lightning support  | Jean-Louis Lauwers        |
| v0.2    | 2025-10-3  | Transport-agnostic redesign | Ethan Niser               |
| v0.1    | 2025-8-29  | Initial draft               | [derived from repository] |
