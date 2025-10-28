# Voucher Store Specification

## Summary

The Voucher Store is a critical component of the x402 `deferred` payment scheme that manages the persistence and retrieval of signed payment vouchers and their settlement records. It serves as the data layer for sellers and facilitators to track off-chain payment obligations and their eventual on-chain settlements.

This specification defines the interface and requirements for implementing a voucher store in the deferred EVM payment system, ensuring consistent behavior across different implementations (in-memory, database-backed, etc.).

## Overview

The voucher store manages three key concepts:

1. **Vouchers**: EIP-712 signed payment commitments from buyers to sellers
2. **Voucher Series**: A sequence of vouchers sharing the same ID but with different nonces (representing aggregations)
3. **Collections**: Records of on-chain settlements for vouchers

## Data Model

### Voucher Structure

A voucher contains the following fields:

| Field | Type | Description |
|-------|------|-------------|
| `id` | bytes32 | Unique identifier for the voucher series |
| `buyer` | address | Address of the payment initiator |
| `seller` | address | Address of the payment recipient |
| `valueAggregate` | uint256 | Total accumulated amount (monotonically increasing) |
| `asset` | address | ERC-20 token contract address |
| `timestamp` | uint64 | Last aggregation timestamp |
| `nonce` | uint256 | Incremented with each aggregation |
| `escrow` | address | Address of the escrow contract |
| `chainId` | uint256 | Network chain ID |
| `signature` | bytes | EIP-712 signature of the voucher |

### Collection Structure

A collection record contains:

| Field | Type | Description |
|-------|------|-------------|
| `voucherId` | bytes32 | The voucher series ID |
| `voucherNonce` | uint256 | The specific voucher nonce |
| `transactionHash` | bytes32 | On-chain settlement transaction hash |
| `collectedAmount` | uint256 | Amount actually collected on-chain |
| `asset` | address | ERC-20 token contract address |
| `chainId` | uint256 | Network chain ID |
| `collectedAt` | uint64 | Collection timestamp |

## Core Operations

### 1. Voucher Storage

**Operation**: `storeVoucher(voucher)`

**Purpose**: Persist a new signed voucher received from a buyer.

**Requirements**:
- MUST reject duplicate vouchers (same id + nonce combination)
- MUST validate all required fields are present
- SHOULD validate signature format (but not cryptographic validity)
- MUST return error if storage fails

**Use Case**: When a seller receives a new payment voucher from a buyer, either for a new series or an aggregation of an existing series.

### 2. Voucher Retrieval

#### Single Voucher Lookup

**Operation**: `getVoucher(id, nonce?)`

**Purpose**: Retrieve a specific voucher or the latest in a series.

**Behavior**:
- When `nonce` provided: Return exact voucher matching (id, nonce)
- When `nonce` omitted: Return voucher with highest nonce for the given id
- Return `null` if no matching voucher exists

**Use Case**: Get the details of a voucher.

#### Series Retrieval

**Operation**: `getVoucherSeries(id, pagination)`

**Purpose**: Retrieve all vouchers in a series for audit or history tracking.

**Requirements**:
- MUST return vouchers sorted by nonce (descending - newest first)
- MUST support pagination with configurable limit and offset
- MUST return empty array for non-existent series

**Pagination Options**:
- `limit`: The maximum number of vouchers to return
- `offset`: The offset of the first voucher to return

**Use Case**: Display payment history, audit trail, or analyze aggregation patterns.

#### Query-Based Retrieval

**Operation**: `getVouchers(query, pagination)`

**Purpose**: Find vouchers matching specific criteria.

**Query Options**:
- `buyer`: Filter by buyer address
- `seller`: Filter by seller address  
- `latest`: If true, return only highest nonce per series

**Pagination Options**:
- `limit`: The maximum number of vouchers to return
- `offset`: The offset of the first voucher to return

**Sorting**:
- Primary: By nonce (descending)
- Secondary: By timestamp (descending)

**Use Case**: Dashboard views, account reconciliation, payment analytics.

### 3. Available Voucher Discovery

**Operation**: `getAvailableVoucher(buyer, seller)`

**Purpose**: Find the most suitable voucher for aggregation in a new payment.

**Selection Algorithm**:
1. Filter vouchers matching exact buyer and seller
2. For each series, select the voucher with highest nonce
3. Among selected vouchers, return the one with most recent timestamp
4. Return `null` if no vouchers match

**Use Case**: When a seller needs to determine which existing voucher to use to aggregate new payments from a returning buyer.

### 4. Settlement Recording

**Operation**: `settleVoucher(voucher, txHash, amount)`

**Purpose**: Record that a voucher has been collected on-chain.

**Requirements**:
- MUST store the settlement record
- MUST associate with correct voucher (id, nonce)
- MUST record actual collected amount (may differ from voucher amount)
- SHOULD allow multiple collections for same voucher (partial settlements)

**Use Case**: After successful on-chain collection, record the settlement for reconciliation and tracking.

### 5. Collection History

**Operation**: `getVoucherCollections(query, pagination)`

**Purpose**: Retrieve settlement history for vouchers.

**Query Options**:
- `id`: Filter by voucher series ID
- `nonce`: Filter by specific nonce (requires id)

**Pagination Options**:
- `limit`: The maximum number of vouchers to return
- `offset`: The offset of the first voucher to return

**Use Case**: Reconcile on-chain settlements with off-chain vouchers, audit payment flows.

## Appendix

### Reference Implementation

The `InMemoryVoucherStore` class in the X402 TypeScript package provides a reference implementation suitable for development and testing. Production implementations should follow the same interface while adding appropriate persistence, scaling, and security features.