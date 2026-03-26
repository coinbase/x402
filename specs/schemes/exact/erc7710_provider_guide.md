# ERC-7710 Payment Provider Implementation Guide

This guide explains how to implement an `ERC7710PaymentProvider` for use with x402 payments. Providers enable smart contract accounts with ERC-7710 delegation support to make x402 payments.

## Overview

The `ERC7710PaymentProvider` interface allows x402 clients to create payment delegations using any ERC-7710 compatible delegation framework (MetaMask Delegation Framework, Pimlico, ZeroDev, etc.).

x402 defines the interface - your SDK provides the implementation.

## Interface

```typescript
interface ERC7710PaymentProvider {
  /** Address of the account that holds the funds (the delegator) */
  readonly delegator: `0x${string}`;

  /**
   * Create a payment delegation for an x402 payment.
   *
   * @throws Error if delegation cannot be created
   */
  createX402PaymentDelegation(
    params: ERC7710PaymentParams
  ): Promise<ERC7710PaymentDelegation>;
}

interface ERC7710PaymentParams {
  /** Addresses authorized to redeem the delegation (facilitators) */
  redeemers: `0x${string}`[];
  /** Recipient of the ERC-20 transfer */
  payTo: `0x${string}`;
  /** ERC-20 token address */
  asset: `0x${string}`;
  /** Amount in smallest unit */
  amount: bigint;
  /** Maximum time until delegation expires (seconds) */
  maxTimeoutSeconds: number;
}

interface ERC7710PaymentDelegation {
  /** Address of the ERC-7710 Delegation Manager contract */
  delegationManager: `0x${string}`;
  /** Encoded permission context for redeemDelegations */
  permissionContext: `0x${string}`;
  /** Which redeemers were authorized (subset of input) */
  authorizedRedeemers: `0x${string}`[];
}
```

## Implementation Requirements

### 1. Root Delegation

Your provider is initialized with a "root delegation" - a pre-existing delegation that grants your client spending authority. This could come from:

- ERC-7715 wallet permission grant
- Direct delegation from another account
- Multi-hop delegation chain

The root delegation defines the constraints (asset types, amounts, time limits) that your provider can work within.

### 2. Sub-Delegation per Payment

When `createX402PaymentDelegation` is called, your implementation must:

1. **Create a sub-delegation** from the root delegation, scoped to:
   - The specific `payTo` address
   - The specific `asset` token
   - The exact `amount`
   - A subset (or all) of the provided `redeemers`
   - An expiration based on `maxTimeoutSeconds`

2. **Encode the permission context** in the format expected by your delegation framework's `DelegationManager.redeemDelegations()` function.

3. **Return which redeemers were authorized** - your framework may not support all provided redeemers.

### 3. Error Handling

Throw descriptive errors when:

- Insufficient allowance remaining in root delegation
- Unsupported asset type
- Root delegation expired
- No common redeemers between input and what your framework supports
- Any other constraint violation

## Example: MetaMask Delegation Framework

```typescript
import { DelegationFramework, Delegation } from "@metamask/delegation-framework";

class GatorPaymentProvider implements ERC7710PaymentProvider {
  readonly delegator: `0x${string}`;
  private readonly framework: DelegationFramework;
  private readonly rootDelegation: Delegation;

  constructor(framework: DelegationFramework, rootDelegation: Delegation) {
    this.framework = framework;
    this.rootDelegation = rootDelegation;
    this.delegator = rootDelegation.delegator;
  }

  async createX402PaymentDelegation(
    params: ERC7710PaymentParams
  ): Promise<ERC7710PaymentDelegation> {
    // Create caveats for this specific payment
    const caveats = [
      // Limit to specific ERC-20 transfer
      this.framework.createERC20TransferCaveat({
        token: params.asset,
        recipient: params.payTo,
        amount: params.amount,
      }),
      // Limit who can redeem
      this.framework.createRedeemerEnforcerCaveat({
        allowedRedeemers: params.redeemers,
      }),
      // Time limit
      this.framework.createTimestampCaveat({
        validUntil: Math.floor(Date.now() / 1000) + params.maxTimeoutSeconds,
      }),
    ];

    // Create sub-delegation from root
    const subDelegation = await this.framework.createDelegation({
      parent: this.rootDelegation,
      caveats,
    });

    // Encode for redeemDelegations
    const permissionContext = this.framework.encodePermissionContext([
      this.rootDelegation,
      subDelegation,
    ]);

    return {
      delegationManager: this.framework.delegationManagerAddress,
      permissionContext,
      authorizedRedeemers: params.redeemers, // All redeemers supported
    };
  }
}
```

## Usage with x402

```typescript
import { ExactEvmScheme } from "@x402/evm";
import { createGatorPaymentProvider } from "@your-sdk/gator";

// Initialize provider with root delegation (obtained via ERC-7715 or other means)
const provider = createGatorPaymentProvider(rootDelegation);

// Create x402 client scheme
const scheme = new ExactEvmScheme({ erc7710Provider: provider });

// Register with x402 client
client.register("eip155:*", scheme);

// Payments now use ERC-7710 delegations when facilitators are available
```

## Facilitator Flow

When processing ERC-7710 payments, the x402 facilitator:

1. Receives `PaymentPayload` with:
   - `delegationManager`: Your framework's DelegationManager address
   - `permissionContext`: Encoded delegation chain
   - `delegator`: The account holding the funds

2. Simulates `redeemDelegations()` to verify the delegation is valid

3. Executes `redeemDelegations()` with an ERC-7579 execution that performs the ERC-20 transfer

## Security Considerations

1. **Validate redeemers**: Only authorize redeemers that are known x402 facilitators
2. **Minimize scope**: Create the narrowest possible sub-delegation for each payment
3. **Check expiration**: Ensure delegations expire within `maxTimeoutSeconds`
4. **Validate amounts**: Never create delegations exceeding the requested amount

## Testing

Implement comprehensive tests for:

- Successful delegation creation
- Insufficient allowance handling
- Unsupported asset handling
- Expired root delegation handling
- Multiple redeemer scenarios
- Edge cases (zero amount, past expiration, etc.)

## Questions?

For questions about x402 integration, see the [x402 documentation](https://github.com/coinbase/x402).

For questions about specific delegation frameworks:
- MetaMask Delegation Framework: [gator.metamask.io](https://gator.metamask.io)
