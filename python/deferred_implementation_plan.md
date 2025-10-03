# Python Deferred Payment Scheme Implementation Plan

## Overview
This document outlines the implementation plan for adding deferred payment scheme support to the Python x402 client, based on the existing TypeScript implementation.

## Implementation Steps

### 1. Add Type Definitions (types.py)

Add the following new types to support deferred payments:

```python
class DeferredEvmPayloadVoucher(BaseModel):
    id: str  # Hex encoded 64 bytes (bytes32)
    buyer: str  # EVM address
    seller: str  # EVM address
    value_aggregate: str  # Total outstanding amount, monotonically increasing
    asset: str  # ERC-20 token address
    timestamp: int  # Unix timestamp
    nonce: int  # Incremented with each aggregation
    escrow: str  # Escrow contract address
    chain_id: int  # Network chain ID
    expiry: int  # Expiration timestamp

class DeferredPaymentPayload(BaseModel):
    signature: str
    voucher: DeferredEvmPayloadVoucher

class DeferredPaymentRequirementsExtraNewVoucher(BaseModel):
    type: Literal["new"]
    voucher: dict  # Contains only 'id' and 'escrow' fields

class DeferredPaymentRequirementsExtraAggregationVoucher(BaseModel):
    type: Literal["aggregation"]
    signature: str
    voucher: DeferredEvmPayloadVoucher

# Update SchemePayloads union
SchemePayloads = Union[ExactPaymentPayload, DeferredPaymentPayload]
```

### 2. Create Deferred Module (deferred.py)

Implement core deferred payment functionality:

```python
# Constants
EXPIRY_TIME = 60 * 60 * 24 * 30  # 30 days
DEFERRED_SCHEME = "deferred"

# Core functions
def prepare_payment_header(sender_address, x402_version, payment_requirements)
def create_new_voucher(buyer, payment_requirements)
def aggregate_voucher(buyer, payment_requirements)
def sign_voucher(account, voucher)
def verify_voucher(voucher, signature, signer)
def sign_payment_header(account, payment_requirements, header)
def encode_payment(payment_payload)
```

### 3. EIP-712 Typed Data Structure

The deferred scheme uses different typed data:
- Domain: "DeferredPaymentEscrow" (vs "EIP712Domain" for exact)
- Primary type: Custom voucher structure (vs "TransferWithAuthorization")
- Message fields: id, buyer, seller, valueAggregate, asset, timestamp, nonce, escrow, chainId, expiry

### 4. Update Client Integration

Modify client code to:
- Detect scheme type from payment requirements
- Route to appropriate payment header creation function
- Handle both new voucher creation and aggregation flows

### 5. Testing Requirements

- Unit tests for voucher creation and aggregation
- EIP-712 signature verification tests
- Integration tests with httpx/requests clients
- Edge cases: expired vouchers, invalid signatures, timestamp validation

## Key Differences from Exact Scheme

1. **Voucher-based**: Uses signed vouchers instead of EIP-3009 authorizations
2. **Aggregation**: Supports increasing payment amounts over time
3. **Escrow model**: Funds are pre-deposited in escrow contract
4. **Expiry handling**: Vouchers have expiration timestamps
5. **Nonce management**: Increments with each aggregation (not random)

## TODO Items for MVP

- [ ] Implement basic voucher creation and signing
- [ ] Add voucher aggregation logic
- [ ] Integrate with existing client classes
- [ ] Add comprehensive error handling
- [ ] Write unit tests for core functionality
- [ ] Add integration tests
- [ ] Update documentation

## Future Enhancements

- Smart account support for signature verification
- Batch voucher collection support
- Advanced expiry management
- Performance optimizations for voucher storage/retrieval