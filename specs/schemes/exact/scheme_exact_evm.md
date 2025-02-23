# Scheme: `exact` on `EVM`

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

## Appendix

There are 2 standards that `usdc` supports on EVM chains that we can leverage for a payments protocol, `EIP-3009` and `EIP-2612`.

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
