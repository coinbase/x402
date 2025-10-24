# x402 payments protocol <!-- omit in toc -->

> [!NOTE]
> "1 line of code to accept digital dollars. No fee, 2 second settlement, $0.001 minimum payment."

```typescript
app.use(
  // How much you want to charge, and where you want the funds to land
  paymentMiddleware("0xYourAddress", { "/your-endpoint": "$0.01" })
);
```

That's it! See [examples/typescript/servers/express.ts](./examples/typescript/servers/express.ts) for a complete example.

- [Philosophy](#philosophy)
- [Principles](#principles)
- [Ecosystem](#ecosystem)
- [Roadmap](#roadmap)
- [Terms](#terms)
- [Technical Goals](#technical-goals)
- [V1 Protocol](#v1-protocol)
  - [V1 Protocol Sequencing](#v1-protocol-sequencing)
    - [V1 Protocol Details](#v1-protocol-details)
  - [Type Specifications](#type-specifications)
    - [Payment Required Response Data Type](#payment-required-response-data-type)
    - [`PaymentRequirements` Data Type](#paymentrequirements-data-type)
    - [Payment Payload Data Type](#payment-payload-data-type)
    - [Facilitator Types \& Interface](#facilitator-types--interface)
      - [POST /verify](#post-verify)
      - [POST /settle](#post-settle)
      - [GET /supported](#get-supported)
  - [Schemes](#schemes)
  - [Schemes vs Networks](#schemes-vs-networks)
- [Running example](#running-example)
- [Running tests](#running-tests)

## Philosophy

Payments on the internet are fundamentally flawed. Credit Cards are high friction, hard to accept, have minimum payments that are far too high, and don't fit into the programmatic nature of the internet.

It's time for an open, internet-native form of payments. A payment rail that doesn't have high minimums + % based fee. Payments that are amazing for humans and AI agents.

## Principles

- **Open standard:** the x402 protocol will never force reliance on a single party. It is based on the [402 HTTP Payment Required status code](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/402).
- **HTTP Native:** x402 is meant to seamlessly complement the existing HTTP request made by traditional web services, it should not mandate additional requests outside the scope of a typical client / server flow.
- **Chain and token agnostic:** we welcome contributions that add support for new chains, signing standards, or schemes, so long as they meet our acceptance criteria laid out in [CONTRIBUTING.md](./CONTRIBUTING.md).
- **Trust minimizing:** all payment schemes must not allow for the facilitator or resource server to move funds, other than in accordance with client intentions.
- **Easy to use:** x402 needs to be 10x better than existing ways to pay on the internet. This means abstracting as many details of crypto as possible away from the client and resource server, and into the facilitator. This means the client/server should not need to think about gas, rpc, etc.

## Ecosystem

The x402 ecosystem is growing! Check out our [ecosystem page](https://x402.org/ecosystem) to see projects building with x402, including:

- Client-side integrations
- Services and endpoints
- Ecosystem infrastructure and tooling
- Learning and community resources

Want to add your project to the ecosystem? See our [demo site README](./typescript/site/README.md#adding-your-project-to-the-ecosystem) for detailed instructions on how to submit your project.

## Roadmap

Visit [ROADMAP.md](./ROADMAP.md) for a list of upcoming features and planned changes.

## Terms

- `resource`: Something on the internet. This could be a webpage, file server, RPC service, API, any resource on the internet that accepts HTTP / HTTPS requests.
- `client`: An entity wanting to pay for a resource.
- `facilitator server`: A server that facilitates verification and execution of on-chain payments.
- `resource server`: An HTTP server that provides an API or other resource for a client.

## Technical Goals

- Permissionless and secure for clients and servers
- Gasless for client and resource servers
- Minimal integration for the resource server and client (1 line for the server, 1 function for the client)
- Ability to trade off speed of response for guarantee of payment
- Extensible to different payment flows and chains

## V1 Protocol

The `x402` protocol is a chain agnostic standard for payments on top of HTTP, leverage the existing [`402 Payment Required`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/402) HTTP status code to indicate that a payment is required for access to the resource.

It specifies:

1. `PaymentRequirements`: A schema for how servers can respond to clients to facilitate payment for a resource
2. `X-PAYMENT`: A standard header that is set by clients paying for resources
3. `PaymentPayload`: A standard schema and encoding method for data in the `X-PAYMENT` header
4. `PaymentVerification`: A recommended flow for how payments should be verified and settled by a resource server
5. `PaymentSettlement`: A REST specification for how a resource server can perform verification and settlement against a remote 3rd party server (`facilitator`)
6. `X-PAYMENT-RESPONSE`: A specification for a header that can be used by resource servers to communicate blockchain transactions details to the client in their HTTP response

### V1 Protocol Sequencing

```mermaid
sequenceDiagram
    actor C as Client
    participant S as Server
    participant F as Facilitator
    participant B as Blockchain

    C->>S: (1) GET /api
    S-->>C: (2) 402 - Payment Required
    C->>C: (3) Select payment method and create payload
    C->>S: (4) Include Header: X-PAYMENT: 664 payload
    S->>F: (5) /verify
    F-->>S: (6) verification
    S->>S: (7) do work to fulfill request
    S->>F: (8) /settle
    F->>B: (9) Submit tx w/ sig to usdc contract
    B-->>F: (10) Tx confirmed
    F-->>S: (11) settled
    S-->>C: (12) return response w/ X-PAYMENT-RESPONSE

    Note over C,S: latency introduced ≈ block time<br>server can opt not to await settled response<br>additional latency is just facilitator API round trip time
```

You can also view this [image](./static/x402-protocol-flow.png)

#### V1 Protocol Details

The following outlines the flow of a payment using the `x402` protocol. Note that steps (1) and (2) are optional if the client already knows the payment details accepted for a resource.

1. `Client` makes an HTTP request to a `resource server`.

2. `Resource server` responds with a `402 Payment Required` status and a `Payment Required Response` JSON object in the response body.

3. `Client` selects one of the `paymentRequirements` returned by the server response and creates a `Payment Payload` based on the `scheme` of the `paymentRequirements` they have selected.

4. `Client` sends the HTTP request with the `X-PAYMENT` header containing the `Payment Payload` to the resource server.

5. `Resource server` verifies the `Payment Payload` is valid either via local verification or by POSTing the `Payment Payload` and `Payment Requirements` to the `/verify` endpoint of a `facilitator server`.

6. `Facilitator server` performs verification of the object based on the `scheme` and `network` of the `Payment Payload` and returns a `Verification Response`.

7. If the `Verification Response` is valid, the resource server performs the work to fulfill the request. If the `Verification Response` is invalid, the resource server returns a `402 Payment Required` status and a `Payment Required Response` JSON object in the response body.

8. `Resource server` either settles the payment by interacting with a blockchain directly, or by POSTing the `Payment Payload` and `Payment PaymentRequirements` to the `/settle` endpoint of a `facilitator server`.

9. `Facilitator server` submits the payment to the blockchain based on the `scheme` and `network` of the `Payment Payload`.

10. `Facilitator server` waits for the payment to be confirmed on the blockchain.

11. `Facilitator server` returns a `Payment Execution Response` to the resource server.

12. `Resource server` returns a `200 OK` response to the `Client` with the resource they requested as the body of the HTTP response, and a `X-PAYMENT-RESPONSE` header containing the `Settlement Response` as Base64 encoded JSON if the payment was executed successfully.

### Type Specifications

#### Payment Required Response Data Type

```json5
{
  // Version of the x402 payment protocol
  x402Version: int,

  // List of payment requirements that the resource server accepts. A resource server may accept on multiple chains, or in multiple currencies.
  accepts: [paymentRequirements]

  // Message from the resource server to the client to communicate errors in processing payment
  error: string
}
```

#### `PaymentRequirements` Data Type

```json5
{
  // Scheme of the payment protocol to use
  scheme: string;

  // Network of the blockchain to send payment on
  network: string;

  // Maximum amount required to pay for the resource in atomic units of the asset
  maxAmountRequired: uint256 as string;

  // URL of resource to pay for
  resource: string;

  // Description of the resource
  description: string;

  // MIME type of the resource response
  mimeType: string;

  // Output schema of the resource response
  outputSchema?: object | null;

  // Address to pay value to
  payTo: string;

  // Maximum time in seconds for the resource server to respond
  maxTimeoutSeconds: number;

  // Address of the EIP-3009 compliant ERC20 contract
  asset: string;

  // Extra information about the payment details specific to the scheme
  // For `exact` scheme on a EVM network, expects extra to contain the records `name` and `version` pertaining to asset
  extra: object | null;
}
```

#### Payment Payload Data Type

This is included as the `X-PAYMENT` header in base64 encoded json.

```json5
{
  // Version of the x402 payment protocol
  x402Version: number;

  // scheme is the scheme value of the accepted `paymentRequirements` the client is using to pay
  scheme: string;

  // network is the network id of the accepted `paymentRequirements` the client is using to pay
  network: string;

  // payload is scheme dependent
  payload: <scheme dependent>;
}
```

#### Facilitator Types & Interface

A `facilitator server` is a 3rd party service that can be used by a `resource server` to verify and settle payments, without the `resource server` needing to have access to a blockchain node or wallet.

##### POST /verify

Verify a payment with a supported scheme and network.

**Request JSON body**:

```json5
{
  x402Version: number;
  paymentHeader: string;
  paymentRequirements: paymentRequirements;
}
```

**Response JSON body**:

```json5
{
  isValid: boolean;
  invalidReason: string | null;
}
```

##### POST /settle

Settle a payment with a supported scheme and network.

**Request JSON body**:

```json5
  {
    x402Version: number;
    paymentHeader: string;
    paymentRequirements: paymentRequirements;
  }
```

**Response JSON body**:

```json5
  {
    // Whether the payment was successful
    success: boolean;

    // Error message from the facilitator server
    error: string | null;

    // Transaction hash of the settled payment
    txHash: string | null;

    // Network id of the blockchain the payment was settled on
    networkId: string | null;
  }
```

##### GET /supported

Get supported payment schemes and networks.

**Response JSON body**:

```json5
  {
    kinds: [
      {
        "scheme": string,
        "network": string,
      }
    ]
  }
```

### Schemes

A scheme is a logical way of moving money.

Blockchains allow for a large number of flexible ways to move money. To help facilitate an expanding number of payment use cases, the `x402` protocol is extensible to different ways of settling payments via its `scheme` field.

Each payment scheme may have different operational functionality depending on what actions are necessary to fulfill the payment.

For example:

- `exact` transfers a specific amount; e.g. pay exactly $1 to read an article
- `upto` transfers up to an amount, based on the resources consumed during a request; e.g. pay up to $1 to read an article

`exact` is the first scheme shipping as part of the protocol, and is implemented for EVM chains. `upto` is being planned for future releases.

See `specs/schemes` for more details on schemes, and see `specs/schemes/exact/scheme_exact_evm.md` to see the first proposed scheme for exact payment on EVM chains.

### Schemes vs Networks

Because a scheme is a logical way of moving money, the way a scheme is implemented can be different for different blockchains.

For example, the way you need to implement `exact` on **Ethereum** is very different from the way you need to implement `exact` on **Solana**.

Clients and facilitators **MUST EXPLICITLY** support different `(scheme, network)` pairs in order to be able to create proper payloads and verify / settle payments.

## Running example

**Requirements:** Node.js v24 or higher

1. Ensure all dependant packages are installed and setup by:

   ```bash
   cd examples/typescript
   pnpm install
   pnpm build
   ```

1. Select a server (i.e. express) and `cd` into that example. Add your **server's ethereum address** to get paid to into the `.env` file, and then run `pnpm dev` in that directory.

1. Select a client (i.e. axios) and `cd` into that example. Add your **private key for the account making payments** into the `.env` file, and then run `pnpm dev` in that directory.

You should see activities in the client terminal, which will display a weather report.

## Running tests

The following will run the unit tests for the x402 packages.

```bash
cd typescript
pnpm install
pnpm test
```
