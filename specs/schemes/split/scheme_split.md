# Scheme: `split`

## Summary

`split` is a scheme that transfers funds from a client and distributes them to multiple recipients in a single atomic transaction. The split ratios are defined in basis points (BPS) and MUST sum to 10,000 (100%). This enables use cases where payments need to be divided between multiple parties (e.g., content creator + platform, service provider + referrer + protocol).

Unlike the `exact` scheme which transfers to a single `payTo` address, the `split` scheme routes funds through an on-chain splitter contract that atomically distributes to all recipients. This guarantees that either all parties receive their share or the entire payment reverts.

## Use Cases

- **Content platforms**: Reader pays $1.00, author receives 90%, platform receives 10%
- **Referral systems**: Buyer pays for a service, provider gets 70%, referrer gets 20%, protocol gets 10%
- **Agent marketplaces**: Agent pays for a tool, tool creator gets 80%, marketplace gets 15%, protocol gets 5%
- **Sponsorships**: Sponsor pays to support a creator, creator gets majority, platform takes a fee
- **Multi-party services**: Payment is split between multiple service providers who collaborated on a result

## Payment Requirements

The `split` scheme extends the base `PaymentRequirements` with split-specific fields:

```json
{
  "scheme": "split",
  "network": "eip155:8453",
  "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "amount": "1000000",
  "maxTimeoutSeconds": 300,
  "extra": {
    "splitterAddress": "0x...",
    "recipients": [
      {
        "address": "0xAuthor...",
        "bps": 9000,
        "label": "author"
      },
      {
        "address": "0xProtocol...",
        "bps": 1000,
        "label": "protocol"
      }
    ]
  }
}
```

### Field Definitions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `splitterAddress` | `string` | MUST | Address of the deployed splitter contract |
| `recipients` | `Recipient[]` | MUST | Array of 2-5 recipients |
| `recipients[].address` | `string` | MUST | Recipient wallet address |
| `recipients[].bps` | `number` | MUST | Basis points (0-10000) for this recipient |
| `recipients[].label` | `string` | MAY | Human-readable label (e.g., "author", "protocol") |

### Validation Rules

- `recipients` array MUST contain between 2 and 5 entries
- Sum of all `recipients[].bps` MUST equal exactly 10,000
- Each `recipients[].bps` MUST be greater than 0
- Each `recipients[].address` MUST be a valid address for the specified network
- `splitterAddress` MUST be a deployed and verified splitter contract
- `amount` represents the total payment; individual shares are computed on-chain

## Splitter Contract Interface

The splitter contract MUST implement the following interface:

```solidity
interface IPaymentSplitter {
    struct Recipient {
        address addr;
        uint256 bps;
    }

    /// @notice Split a payment to multiple recipients
    /// @param token The ERC20 token to split
    /// @param totalAmount The total amount to distribute
    /// @param recipients Array of recipients with basis point allocations
    function split(
        address token,
        uint256 totalAmount,
        Recipient[] calldata recipients
    ) external;

    event PaymentSplit(
        address indexed payer,
        address indexed token,
        uint256 totalAmount,
        uint256 recipientCount
    );

    event RecipientPaid(
        address indexed recipient,
        address indexed token,
        uint256 amount,
        uint256 bps
    );
}
```

### Contract Behavior

1. Caller MUST have approved the splitter contract to spend `totalAmount` of `token`
2. The contract MUST validate that BPS values sum to 10,000
3. The contract MUST compute each recipient's share: `amount = (totalAmount * bps) / 10000`
4. Remainder from integer division MUST be added to the first recipient's share
5. The contract MUST transfer all shares atomically (all succeed or all revert)
6. The contract MUST emit `PaymentSplit` and `RecipientPaid` events

## Client Flow

1. Client receives 402 with `scheme: "split"` and `extra.recipients`
2. Client approves the `splitterAddress` to spend `amount` of `asset`
3. Client calls `splitter.split(asset, amount, recipients)`
4. Client includes the transaction hash in the payment header

## Verification

Facilitators MUST verify:

1. Transaction exists and is confirmed on the specified network
2. Transaction called the declared `splitterAddress`
3. `PaymentSplit` event was emitted with correct `totalAmount`
4. `RecipientPaid` events match the declared recipients and BPS allocations
5. All recipient addresses match those in `PaymentRequirements.extra.recipients`
6. Total distributed amount equals or exceeds `PaymentRequirements.amount`

## Settlement

Settlement follows the same pattern as `exact`:

1. Facilitator verifies the transaction (see Verification above)
2. If valid, facilitator returns `SettlementResponse` with success
3. Resource server grants access to the protected resource

No additional settlement step is needed because the splitter contract handles distribution atomically during the client's transaction.

## Security Considerations

- **Atomic execution**: All transfers MUST succeed or the entire transaction reverts. Partial distributions MUST NOT occur.
- **BPS validation**: The contract MUST enforce that BPS sum to exactly 10,000 on-chain, regardless of what the server declared. This prevents servers from misconfiguring splits.
- **Rounding**: Integer division remainder MUST be handled deterministically. The spec assigns remainder to the first recipient.
- **Reentrancy**: Splitter contracts MUST use reentrancy guards or follow checks-effects-interactions pattern.
- **Token compatibility**: The contract SHOULD verify the token's `transferFrom` return value or use SafeERC20.
- **No admin keys**: The splitter contract SHOULD be permissionless with no owner or admin functions that could redirect funds.

## Comparison with `exact`

| Feature | `exact` | `split` |
|---------|---------|---------|
| Recipients | 1 | 2-5 |
| On-chain contract | None (direct transfer) | Splitter contract required |
| Atomicity | Single transfer | All-or-nothing multi-transfer |
| Gas cost | ~50k | ~70-120k (varies by recipient count) |
| Use case | Simple payments | Platform fees, referrals, multi-party |

## Appendix

### Reference Implementation

A reference `PaymentSplitter.sol` contract is provided in the x402 repository. Deployments:

- Base Mainnet: (TBD)
- Base Sepolia: (TBD)

### Related Issues

- [#937 - Add new `exact-split` scheme for native facilitator fee support](https://github.com/coinbase/x402/issues/937)
- [#1011 - Escrow Scheme for x402 using Base Commerce Payments Protocol](https://github.com/coinbase/x402/issues/1011)
