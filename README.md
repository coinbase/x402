# x402 payments protocol

> "1 line of code to accept digital dollars. No fee, 2 second settlement, $0.001 minimum payment."

```typescript
app.use(
  "/your-endpoint",
  // How much you want to charge, and where you want the funds to land
  paymentMiddleware("$0.10", "0x209693Bc6afc0C5328bA36FaF03C514EF312287C")
);
// Thats it! See example/resource.ts for a complete example. Instruction below for running on base-sepolia.
```

## Terms:

- `resource`: Something on the internet. This could be a webpage, file server, RPC service, API, any resource on the internet that accepts HTTP / HTTPS requests.
- `client`: An entity wanting to pay for a resource.
- `facilitator server`: A server that facilitates verification and execution of on-chain payments.
- `resource server`: An HTTP server that provides an API or other resource for a client.

## Goals:

- Permissionless and secure for clients and servers
- Gassless for client and resource servers
- Minimal integration for the resource server and client (1 line for the server, 1 function for the client)
- Ability to trade off speed of response for guarantee of payment
- Extensible to different payment flows and chains

## V1 Protocol

The `x402` protocol is a chain agnostic standard for payments on top of HTTP, leverage the existing `402 Payment Required` HTTP status code to indicate that a payment is required for access to the resource.

It specifies:

1. A schema for how servers can respond to clients to facilitate payment for a resource (`PaymentDetails`)
2. A standard header `X-PAYMENT` that is set by clients paying for resources
3. A standard schema and encoding method for data in the `X-PAYMENT` header
4. A recommended flow for how payments should be verified and settled by a resource server
5. A REST specification for how a resource server can perform verification and settlement against a remote 3rd party server (`facilitator`)
6. A specification for a `X-PAYMENT-RESPONSE` header that can be used by resource servers to communicate blockchain transactions details to the client in their HTTP response

### V1 Protocol Sequencing

![](./static/x402-protocol-flow.png)

The following outlines the flow of a payment using the `x402` protocol. Note that steps (1) and (2) are optional if the client already knows
the payment details accepted for a resource.

1. `Client` makes an HTTP request to a `resource server`

2. `Resource server` responds with a `402 Payment Required` status and a `Payment Required Response` JSON object in the response body.

3. `Client` selects one of the `paymentDetails` returned by the `accepts` field of the server response and creates a `Payment Payload` based on the `scheme` of the `paymentDetails` they have selected.

4. `Client` sends the HTTP request with the `X-PAYMENT` header containing the `Payment Payload` to the resource server

5. `Resource server` verifies the `Payment Payload` is valid either via local verification or by POSTing the `Payment Payload` and `Payment Details` to the `/verify` endpoint of a `facilitator server`.

6. `Facilitator server` performs verification of the object based on the `scheme` and `networkId` of the `Payment Payload` and returns a `Verification Response`

7. If the `Verification Response` is valid, the resource server performs the work to fulfill the request. If the `Verification Response` is invalid, the resource server returns a `402 Payment Required` status and a `Payment Required Response` JSON object in the response body.

8. `Resource server` either settles the payment by interacting with a blockchain directly, or by POSTing the `Payment Payload` and `Payment Details` to the `/settle` endpoint of a `facilitator server`.

9. `Facilitator server` submits the payment to the blockchain based on the `scheme` and `networkId` of the `Payment Payload`.

10. `Facilitator server` waits for the payment to be confirmed on the blockchain.

11. `Facilitator server` returns a `Payment Execution Response` to the resource server.

12. `Resource server` returns a `200 OK` response to the `Client` with the resource they requested as the body of the HTTP response, and a `X-PAYMENT-RESPONSE` header containing the `Settlement Response` as Base64 encoded JSON if the payment was executed successfully.

### Type Specifications

#### Data types

```
// Payment Required Response
{
  // Version of the x402 payment protocol
  x402Version: int,

  // List of payment details that the resource server accepts. A resource server may accept on multiple chains.
  accepts: [paymentDetails]

  // Message from the resource server to the client to communicate errors in processing payment
  error: string
}

// paymentDetails
{
  // Scheme of the payment protocol to use
  scheme: string;

  // Network of the blockchain to send payment on
  networkId: string;

  // Maximum amount required to pay for the resource as usdc dollars x 10**6
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
  payToAddress: string;

  // Maximum time in seconds for the resource server to respond
  maxTimeoutSeconds: number;

  // Address of the USDC contract
  usdcAddress: string;

  // Extra information about the payment details specific to the scheme
  extra: object | null;
}

// `Payment Payload` (included as the `X-PAYMENT` header as base64 encoded json)
{
  // Version of the x402 payment protocol
  x402Version: number;

  // scheme is the scheme value of the accepted `paymentDetails` the client is using to pay
  scheme: string;

  // networkId is the network id of the accepted `paymentDetails` the client is using to pay
  networkId: string;

  // payload is scheme dependent
  payload: <scheme dependent>;

  // resource the client is paying for
  resource: string;
}
```

#### Facilitator Types & Interface

A `facilitator server` is a 3rd party service that can be used by a `resource server` to verify and settle payments, without the `resource server` needing to have access to a blockchain node or wallet.

```
// Verify a payment with a supported scheme and network
POST /verify
Request body JSON:
{
  paymentHeader: string;
  paymentDetails: paymentDetails;
}

Response:
{
  isValid: boolean;
  invalidReason: string | null;
}

// Settle a payment with a supported scheme and network
POST /settle
Request body JSON:
{
  paymentHeader: string;
  paymentDetails: paymentDetails;
}

Response:
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

// Get supported payment schemes and networks
GET /supported
Response:
{
  kinds: [
    {
      "scheme": string,
      "networkId": string,
    }
  ]
}

```

### Schemes

A scheme is a logical way of moving money.

Blockchains allow for a large number of flexible ways to move money. To help facilitate an expanding number of payment use cases, the `x402` protocol is extensible to different ways of settling payments via its `scheme` field.

Each payment scheme may have different operational functionality depending on what actions are necessary to fulfill the payment.
For example `exact`, the first scheme shipping as part of the protocol, would have different behavior than `upto`. `exact` transfers a specific amount (ex: pay $1 to read an article) while a theoretical `upto` would transfer up to an amount, based on the resources consumed during a request (ex: generating tokens from an LLM).

See `specs/schemes` for more details on schemes, and see `specs/schemes/exact/scheme_exact_evm.md` to see the first proposed scheme for exact payment on EVM chains.

### Schemes vs NetworkIds

Because a scheme is a logical way of moving money, the way a scheme is implemented can be different for different blockchains. (ex: the way you need to implement `exact` on Ethereum is very different than the way you need to implement `exact` on Solana)

Clients and facilitator must explicitly support different `(scheme, networkId)` pairs in order to be able to create proper payloads and verify / settle payments.

## Running example

`cd example`

1. create `.env` `cp ../packages/typescript/x402/.env.example .env` and follow instruction in the file to create wallets

2. `npm install` to install dependencies

3. in 3 separate terminals, run `npm run facilitator`, `npm run resource`, then finally `npm run client`. You should see things happen across all 3 terminals, and get a joke at the end in the client terminal.

## Running tests

`cd packages/typescript`

1. `npm install` to install dependencies
2. Create `.env` with funded keys as above
3. `npm run test` to run tests

## TODO

- have tests run on an anvil fork

## 📝 License

The `x402` protocol is licensed under the [Apache-2.0](LICENSE.md) license.
