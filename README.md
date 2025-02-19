# 402 payments protocol

> "1 line of code to accept digital dollars. No fee, 2 second settlement, $0.05 minimum payment."

```typescript
app.use(
  "/your-api",
  paymentMiddleware("$0.10", "0x209693Bc6afc0C5328bA36FaF03C514EF312287C")
);
// Thats it! See example/resource.ts for a complete example. Instruction below for running on base-sepolia.
```

## Terms:

- resource: some thing on the internet, could be a file, a service, api, etc.
- client: entity wanting to pay for a resource
- facilitator service: service that facilitates verification and execution of payments onchain
- resource server: an http server that provides an api or other resources for a client

## Goals:

- gassless for client and resource servers
- minimal integration for the resource server and client (1 line for server, 1 function for client)
- ability to trade off speed of response for guarantee of payment

## Tradeoffs

There are 2 standards that `usdc` supports that we can leverage for a payments protocol, `EIP-3009` and `EIP-2612`.

**EIP-3009: Transfer with Authorization**: Allows for a signature to be used to authorize a transfer of a **specific amount** from one address to another in a single transaction.

Pros:

- CB can faciliate payments of specific amounts (broadcast transactions), meaning both the client and resource server do not need gas to settle payments.
- No new contracts needed, we can faciliate this transaction without needing to deploy a contract to route or custody funds onchain.

Cons:

- The signature authorizing transfer includes the `amount` to be transferred, meaning a resource server needs to know exactly how much something should cost at the time of request. This means things like usage based payments (ex: generate tokens from an LLM) are not possible.

**EIP-2612: Permit**: Allows for a signature to be used to authorize usage of **up to an amount** funds from one address to another in a later transaction.

Pros:

- Because the permit signature gives permission for transfering up to an amount, it allows for usage based payments.

Cons:

- Submitting the permit signature and then performing the `transferFrom` call are 2 separate function calls, meaning you need to either use `multicall` or deploy a contract (routing contract) that wraps the 2 functions. The permit signature would need to authorized the routing contract to transfer funds.

- Leverages `ERC-20` `transferFrom` / `approve` / `transfer` functions, which have a hard dependency on msg.sender. This breaks the flow of performing the facilitator batching a `permit()` call and a `transferFrom()` call in a single multicall (msg.sender becomes the multicall contract address rather than the facilitators address).

### Recommendation

- Use `EIP-3009` for the first version of the protocol and only support payments of specific amounts
- In follow up leverage `EIP-2612` + `routing contract` to support usage based payments, and optionally bundle that with hard guarantees of payment by holding funds in escrow with the routing contract.

# V1 Flow

1. Make http request to resource server
2. Receive 402 response with json body `PaymentNeededDetails`

```
{
  version: number;                      // Version of the payment protocol
  maxAmountRequired: uint256 as string; // Maximum amount required to pay for the resource
  resource: string;                     // URL of resource to pay for
  description: string;                  // Description of the resource
  mimeType: string;                     // MIME type of the resource response
  outputSchema?: object | null;         // Output schema of the resource response
  resourceAddress: string;              // Address of the routing account that facilitates payment
  recommendedDeadlineSeconds: number;   // Time in seconds for the resource to be processed

};
```

3. Client creates payment payload to include as `X-PAYMENT` header

3.a Sign EIP-3009 `authorizeTransfer` operation with `usdc` contract for `resourceAddress`

3.b Create type `PaymentPayloadV1`

```
// PaymentPayloadV1
{
  version: number;
  payload: PayloadV1;
  resource: string;
};

// PayloadV1
{
  signature: HexString;
  params: PermitParameters;
};


// AuthorizationParameters json
{
  from: Address as string;
  to: Address as string;
  value: uint256 as string;
  validAfter: uint256 as string;
  validBefore: uint256 as string;
  nonce: HexString;
  chainId: number;
  version: string;
  usdcAddress: Address as string;
};
```

3.c Convert `PaymentPayloadV1` to json and base64 encode

4. Send request to resource server with `X-PAYMENT` header

5. Resource server verifies payload its self or forwards payment header to facilitator service calling `verify`

### Verification (default path, synchronous)

Facilitator service (CDP provided) has the follow interface provided over REST. This is stubbed out in typescript but can be implemented in any language. `PaymentHeader` is the base64 encoded `PaymentPayloadV1`

```typescript
export type PaymentExecutionResponse = {
  success: boolean;
  error?: string | undefined;
  txHash?: Hex | undefined;
  chainId?: number | undefined;
};

export type ValidPaymentResponse = {
  isValid: boolean;
  invalidReason?: string | undefined;
};

interface FacilitatorService {
  verify(
    paymentHeader: string,
    paymentDetails: PaymentNeededDetails
  ): ValidPaymentResponse;
  settle(
    paymentHeader: string,
    paymentDetails: PaymentNeededDetails
  ): PaymentExecutionResponse; // amount is the required payment represented as a string
}
```

6. Verifier confirms funds are available and performs other checks to ensure the resource should accept the request

7. Resource server performs work to fulfill request

8. Resource server calls `settle` on the facilitator service

8.a facilitator service broadcasts the transaction to the usdc contract using `transferWithAuthorization` to settle the payment and waits for the tx to be confirmed

9. Facilitator service returns the `PaymentExecutionResponse` to the resource server

10. Resource server returns the response to the client

### Verification (optimistic aka just trust me bro)

todo: more detailed steps

- similar to default path but the resource server doesn't wait for payment to execute before returning the response to the client

### Verification (high value)

todo: more detailed steps

- on `verifyPayment` the resource server pulls funds into an escrow account before telling the client to proceed with the work.

## Future

- re-requesting resources that have been paid for

# Dev

#### Notes

- there is a window of time while the resource server is performing the work that the client could revoke a nonce or move funds that would result in the payment failing
- the resource server currently waits for payment to execute before returning the response to the client, meaning the minimum response time is 1 block

## Running example

1. create `.env` cp `.env.example .env` and follow instruction in the file to create wallets

2. `npm install` to install dependencies

3. in 3 separate terminals, run `npm run example-facilitator`, `npm run example-resource`, then finally `npm run example-client`. You should see things happen across all 3 terminals, and get a joke at the end in the client terminal.

## Running tests

1. `npm install` to install dependencies
2. Create `.env` with funded keys as above
3. `npm run test` to run tests

## TODO

- more tests
- fix wallet typing issues
- have tests run on an anvil fork
