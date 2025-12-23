# Scheme: `exact` on `EVM` with `EIP-7702 + Permit`

## Summary

The `exact-permit` scheme combines EIP-7702 (Set EOA account code) with ERC-2612 (Permit) to enable a trust-minimized, gasless payment flow where:

- **Payer** authorizes the **Seller's EOA directly** (not a facilitator contract) via ERC-2612 Permit signature
- **Seller** maintains EOA status while having smart contract capabilities through EIP-7702 delegation
- **Facilitator** only triggers the settlement and pays gas fees, **never custodies funds**

This approach provides the best user experience (payer trusts seller directly) while maintaining complete gasless transactions and flexible per-seller configurations.

## `X-Payment` header payload

The `payload` field of the `X-PAYMENT` header must contain the following fields:

- `authorizationType`: Must be `"permit"`
- `signature`: The ERC-2612 Permit signature
- `authorization`: Permit parameters (owner, spender, value, deadline, nonce)

Example:

```json
{
  "authorizationType": "permit",
  "signature": "0x1a2b3c4d5e6f7890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab1c",
  "authorization": {
    "owner": "0x857b06519E91e3A54538791bDbb0E22373e36b66",
    "spender": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
    "value": "10000",
    "deadline": "1740672154",
    "nonce": "42"
  }
}
```

Full `X-PAYMENT` header:

```json
{
  "x402Version": 1,
  "scheme": "exact",
  "network": "base-sepolia",
  "payload": {
    "authorizationType": "permit",
    "signature": "0x1a2b3c4d5e6f7890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab1c",
    "authorization": {
      "owner": "0x857b06519E91e3A54538791bDbb0E22373e36b66",
      "spender": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
      "value": "10000",
      "deadline": "1740672154",
      "nonce": "42"
    }
  }
}
```

## Verification

Steps to verify a payment for the `exact-eip7702` scheme:

1. **Verify EIP-7702 delegation**:

   - Check that the `seller` address has delegated code (not pure EOA)
   - Verify the delegation is properly initialized with valid configuration
   - Confirm the facilitator is authorized to call settlement functions

2. **Verify Permit signature**:

   - Reconstruct the EIP-712 typed data for the Permit
   - Recover the signer from the signature
   - Verify the signer matches the `authorization.owner` (payer)

3. **Verify authorization parameters**:

   - `spender` must equal the `seller` address (not facilitator)
   - `value` must be >= `paymentRequirements.maxAmountRequired`
   - `deadline` must be in the future
   - `nonce` must match the current nonce for the owner in the token contract

4. **Verify token balance**:

   - Confirm the payer has sufficient balance of the token
   - Ensure the token is the one specified in `paymentRequirements.asset`

5. **Simulate the settlement transaction**:
   - Call the seller's delegated `settleWithPermit()` function in simulation mode
   - Verify it would execute successfully
   - Check that fund distribution matches expectations

## Settlement

Settlement is performed by the facilitator calling the seller's delegated contract:

```solidity
// Facilitator calls seller's delegated code
ISellerDelegation(seller).settleWithPermit(
    token,
    payer,
    amount,
    deadline,
    v, r, s
);
```

with the `payload.signature` and `payload.authorization` parameters from the `X-PAYMENT` header.

### What Happens Inside Seller's Delegated Code

The seller's delegated code (EIP7702SellerDelegation contract) executes:

```solidity
function settleWithPermit(
    address token,
    address payer,
    uint256 amount,
    uint256 deadline,
    uint8 v, bytes32 r, bytes32 s
) external {
    // 1. Execute the Permit (note: spender = address(this) = seller's EOA)
    IERC20Permit(token).permit(
        payer,
        address(this),  // seller's EOA address
        amount,
        deadline,
        v, r, s
    );

    // 2. Pull tokens from payer to seller
    IERC20(token).safeTransferFrom(payer, address(this), amount);

    // ...
}
```

## Appendix

### ERC-2612: Permit

ERC-2612 allows for a signature to be used to authorize usage of **up to an amount** funds from one address to another in a later transaction.

Pros:

- Because the permit signature gives permission for transfering up to an amount, it allows for usage-based payments.

Cons:

- Submitting the permit signature and then performing the `transferFrom` call are 2 separate function calls, meaning you need to either use `multicall` or deploy a contract (routing contract) that wraps the 2 functions. The permit signature would need to authorize the routing contract to transfer funds.

- Leverages `ERC-20` `transferFrom` / `approve` / `transfer` functions, which have a hard dependency on `msg.sender`. This breaks the flow of performing the facilitator batching a `permit()` call and a `transferFrom()` call in a single multicall (`msg.sender` becomes the multicall contract address rather than the facilitator's address).

### EIP-7702

EIP-7702 allows EOAs to temporarily have smart contract code by signing an authorization:

```typescript
// Seller signs EIP-7702 authorization
const authorizationSignature = await wallet.signTypedData({
  domain: {
    name: "EIP7702",
    version: "1",
    chainId: 1,
  },
  types: {
    Authorization: [
      { name: "chainId", type: "uint256" },
      { name: "codeAddress", type: "address" },
      { name: "nonce", type: "uint256" },
    ],
  },
  message: {
    chainId: 1,
    codeAddress: "0xDelegationContractAddress",
    nonce: 0,
  },
});

// Submit as Type 4 transaction with authorizationList
```

After this transaction:

- Seller's EOA behaves like the delegation contract
- State is stored in seller's EOA storage
- Seller can revoke delegation anytime
- Seller maintains EOA identity

### Security Considerations: Delegation Contract Security

**Risk**: If the delegation contract has vulnerabilities, all sellers using it are affected.

**Mitigation**:

- Thoroughly audit delegation contract code
- Use battle-tested libraries (OpenZeppelin)
- Allow sellers to upgrade to new delegation contracts
- Multiple independent audits before mainnet deployment

### Chain Support

EIP-7702 is supported on chains that have undergone the Pectra upgrade:

- ✅ Ethereum Mainnet (post-Pectra)
- ✅ Ethereum Sepolia testnet
- ✅ Base Mainnet
- ✅ Base Sepolia testnet
- ✅ Optimism Mainnet
- ✅ Arbitrum One
- ✅ Polygon PoS
- ✅ Avalanche C-Chain
- ✅ BNB Smart Chain
- ✅ X Layer

**Note**: As of 2025, EIP-7702 is widely supported across major EVM chains following the Pectra network upgrade.
