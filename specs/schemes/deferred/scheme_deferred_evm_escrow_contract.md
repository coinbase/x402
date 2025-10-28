
# DeferredPaymentEscrow Contract Specification

## Summary

The `DeferredPaymentEscrow` contract enables micropayments using an escrow-based voucher system. Buyers deposit ERC-20 tokens into escrow accounts for specific sellers, then issue off-chain EIP-712 signed vouchers that sellers can redeem against those deposits. This approach allows for efficient aggregation of many small payments before on-chain settlement, while maintaining security through cryptographic signatures and time-bounded withdrawals.

The contract is designed for scenarios where payments are frequent but small (micropayments), making individual on-chain transactions economically inefficient. It provides strong guarantees to both parties: buyers retain control over their deposited funds through a thawing mechanism, while sellers can collect payments immediately when vouchers are presented.

## Contract Overview

The contract manages deposits, withdrawals, and voucher redemption:

- **Deposits**: Buyers deposit ERC-20 tokens for specific sellers
- **Vouchers**: Off-chain signed promises to pay that aggregate over time
- **Collection**: Sellers redeem vouchers against escrow balances
- **Withdrawal**: Buyers can withdraw unused funds after a thawing period
- **Authorizations**: EIP-712 signed operations for gasless interactions (designed for x402 Facilitators to be able to abstract escrow management actions from buyers)

## Data Structures

### EscrowAccount
```solidity
struct EscrowAccount {
    uint256 balance;           // Total deposited balance (includes thawing amount)
    uint256 thawingAmount;     // Amount currently thawing for withdrawal (subset of balance)
    uint64 thawEndTime;        // When thawing completes
}
```

**Important**: The `balance` field represents the total amount of tokens held in the escrow account, which includes any amount currently thawing. The `thawingAmount` is a subset of the `balance` that has been marked for withdrawal after the thawing period. Available funds for new thawing operations = `balance - thawingAmount`.

### Voucher
```solidity
struct Voucher {
    bytes32 id;                // Unique identifier per buyer-seller pair
    address buyer;             // Payment initiator
    address seller;            // Payment recipient
    uint256 valueAggregate;    // Total accumulated amount (monotonically increasing)
    address asset;             // ERC-20 token address
    uint64 timestamp;          // Last aggregation timestamp
    uint256 nonce;             // Incremented with each aggregation
    address escrow;            // This contract's address
    uint256 chainId;           // Network chain ID
}
```

## Account Structure

The contract uses a triple-nested mapping to organize escrow accounts:
```
buyer → seller → asset → EscrowAccount
```

This structure ensures:
- Each buyer-seller pair has independent accounts
- Different assets (tokens) are tracked separately
- Clean separation of concerns between relationships

## Payment Flow

### 1. Deposit Phase
```
Buyer → deposit(seller, asset, amount) → Escrow Contract

OR

Buyer → depositWithAuthorization(auth, signature) → Escrow Contract
```

### 2. Service & Voucher Phase
```
Buyer ↔ Seller (off-chain interactions)
Buyer → signs Voucher(id, valueAggregate, ...) → Seller
```

### 3. Collection Phase
```
Seller → collect(voucher, signature) → Escrow Contract
Escrow Contract → transfer(asset, amount) → Seller
```

### 4. Withdrawal Phase (if needed)
```
Buyer → thaw(seller, asset, amount) → Escrow Contract
[wait THAWING_PERIOD]
Buyer → withdraw(seller, asset) → Escrow Contract

OR 

Buyer → flushWithAuthorization(auth) → Escrow Contract
```

## Verification

To verify a payment in the `deferred` scheme:

1. **Signature Validation**: Verify the voucher signature using EIP-712 and ERC-1271
2. **Contract Verification**: Ensure `voucher.escrow` matches the expected contract address
3. **Chain Verification**: Ensure `voucher.chainId` matches the current network
4. **Balance Check**: Verify escrow account has sufficient balance for collection
5. **Aggregation Validation**: Ensure `voucher.valueAggregate >= previous_collections`

## Settlement

Settlement occurs when sellers call the `collect` function:

1. **Validation**: Contract validates voucher parameters and signature
2. **Amount Calculation**: Determines collectable amount based on:
   - Total voucher value (`valueAggregate`)
   - Previously collected amounts for this voucher ID
   - Available balance in escrow account
3. **State Updates**: Records new collected amount and updates escrow balance
4. **Transfer**: Sends tokens directly to seller
5. **Events**: Emits collection events for off-chain tracking

### Partial Collection

If escrow balance is insufficient for the full voucher amount:
- Contract collects only the available amount
- Voucher remains valid for future collection of remaining amount
- Prevents voucher failures due to temporary fund shortages

**Note for Sellers**: Before accepting a voucher off-chain, sellers should verify that the escrow account has sufficient balance to cover the voucher amount. This can be checked using `getOutstandingAndCollectableAmount(voucher)` which returns both the outstanding amount owed and the amount that can actually be collected immediately.

## Withdrawal Protection

The thawing mechanism protects sellers from sudden fund withdrawals:

1. **Thaw Initiation**: Buyer calls `thaw(seller, asset, amount)` (calling `thaw()` multiple times will add to the thawing amount and reset the timer)
2. **Thawing Period**: Set at contract deployment (standard value is 1 day, though other escrow instances can be deployed with different thawing periods if needed)
3. **Seller Collection**: Sellers can still collect from full balance during thawing
4. **Withdrawal**: After thawing period, buyer can withdraw thawed amount
5. **Cancellation**: Buyers can cancel thawing at any time before completion

## Authorization System

### Gasless Operations

The contract supports EIP-712 signed authorizations for gasless operations, designed for x402:

### Deposit Authorization
Allows x402 Facilitators to execute deposits on behalf of buyers:
```solidity
struct DepositAuthorization {
    address buyer;    // Who is authorizing
    address seller;   // Recipient
    address asset;    // Token to deposit
    uint256 amount;   // Amount to deposit
    bytes32 nonce;    // Random bytes32 for replay protection
    uint64 expiry;    // Authorization expiration
}
```

### Flush Authorization
Enables x402 Facilitators to "flush" funds for buyers (withdraws any funds that have completed thawing, then starts thawing any remaining balance):
```solidity
struct FlushAuthorization {
    address buyer;    // Who is authorizing
    address seller;   // Specific account to flush
    address asset;    // Specific asset to flush
    bytes32 nonce;    // Random bytes32 for replay protection
    uint64 expiry;    // Authorization expiration
}
```

### Flush All Authorization
Allows batch withdrawal from all of a buyer's escrow accounts (performs flush operation on every account):
```solidity
struct FlushAllAuthorization {
    address buyer;    // Who is authorizing
    bytes32 nonce;    // Random bytes32 for replay protection
    uint64 expiry;    // Authorization expiration
}
```

## Contract Interface

### Core Functions

### Deposits
- `deposit(address seller, address asset, uint256 amount)` - Direct deposit
- `depositTo(address buyer, address seller, address asset, uint256 amount)` - Third-party deposit
- `depositMany(address asset, DepositInput[] deposits)` - Batch deposits
- `depositWithAuthorization(DepositAuthorization auth, bytes signature)` - Gasless deposit

### Withdrawals
- `thaw(address seller, address asset, uint256 amount)` - Initiate withdrawal
- `cancelThaw(address seller, address asset)` - Cancel ongoing thaw
- `withdraw(address seller, address asset)` - Complete withdrawal
- `flushWithAuthorization(FlushAuthorization auth, bytes signature)` - Gasless specific flush
- `flushAllWithAuthorization(FlushAllAuthorization auth, bytes signature)` - Gasless batch flush

### Collections
- `collect(Voucher voucher, bytes signature)` - Single voucher redemption
- `collectMany(SignedVoucher[] vouchers)` - Batch voucher redemption

### View Functions
- `getAccount(address buyer, address seller, address asset)` → `EscrowAccount` - Get escrow account details
- `getAccountDetails(address buyer, address seller, address asset, bytes32[] voucherIds, uint256[] valueAggregates)` → `(uint256 balance, uint256 allowance, uint256 nonce)` - Get account details including available balance after accounting for pending vouchers, token allowance, and permit nonce. Returns:
  - `balance`: Available escrow balance minus thawing amount and minus amounts needed for the provided voucher collections
  - `allowance`: Current token allowance granted to the escrow contract
  - `nonce`: Current EIP-2612 permit nonce for the buyer on the asset token contract
- `getVoucherCollected(address buyer, address seller, address asset, bytes32 voucherId)` → `uint256` - Get total amount already collected for this voucher ID
- `getOutstandingAndCollectableAmount(Voucher voucher)` → `(uint256 outstanding, uint256 collectable)` - Returns outstanding amount still owed and amount that can be collected immediately given current escrow balance
- `isVoucherSignatureValid(Voucher voucher, bytes signature)` → `bool` - Validate voucher signature
- `isDepositAuthorizationValid(DepositAuthorization auth, bytes signature)` → `bool` - Validate deposit authorization signature
- `isFlushAuthorizationValid(FlushAuthorization auth, bytes signature)` → `bool` - Validate flush authorization signature
- `isFlushAllAuthorizationValid(FlushAllAuthorization auth, bytes signature)` → `bool` - Validate flush all authorization signature

### Constants
- `THAWING_PERIOD()` → `uint256` - Withdrawal thawing period (immutable, set at deployment)
- `MAX_THAWING_PERIOD()` → `uint256` - Maximum allowed thawing period (30 days)
- `DOMAIN_SEPARATOR()` → `bytes32` - EIP-712 domain separator

## Appendix

### Multi-Chain Deployment

While each contract instance operates on a single chain, the design supports multi-chain deployments:
- Vouchers include `chainId` for chain-specific validation
- Contract will be deployed using Safe Singleton Factory for deterministic addresses across chains
- Cross-chain coordination must be handled at the application layer

### Reference Implementation

A reference implementation for this contract is provided with this repository, it can be found at [DeferredPaymentEscrow](../../../solidity/deferred-escrow/README.md)