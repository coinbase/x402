# Python Deferred Payment Scheme - TODO

## What we built

✅ **Completed:**
- Added new type definitions for deferred payments:
  - `DeferredEvmPayloadVoucher` - Full voucher structure with all fields
  - `DeferredPaymentPayload` - Payload containing signature and voucher
  - `DeferredPaymentRequirementsExtra*` - Discriminated unions for new/aggregation
  - Updated `SchemePayloads` union to include deferred

- Created `deferred.py` module with:
  - `prepare_payment_header()` - Creates unsigned deferred payments
  - `create_new_voucher()` - Creates new vouchers with initial valueAggregate
  - `aggregate_voucher()` - Aggregates existing vouchers (increments valueAggregate)
  - `sign_voucher()` - EIP-712 signing for DeferredPaymentEscrow domain
  - `verify_voucher()` - Verifies voucher signatures
  - Full encode/decode support

- Updated client integration:
  - Modified `base.py` to support both exact and deferred schemes
  - Added scheme detection and routing in `create_payment_header()`
  - Updated payment requirements selector to accept deferred

- Wrote comprehensive unit tests (test_deferred.py):
  - New voucher creation
  - Voucher signing and verification
  - Voucher aggregation with validation
  - Expired voucher handling
  - Encoding/decoding

## Things to fix eventually

### High Priority
- [x] Test runner setup - Tests are now passing with uv
- [x] Fixed nonce encoding bug in exact.py (was returning bytes instead of hex)
- [ ] Integration tests with actual HTTP clients (httpx/requests)
- [ ] Verify EIP-712 signature format matches TypeScript exactly
- [ ] Add proper error handling for network errors during aggregation

### Medium Priority  
- [ ] Add support for smart account signature verification (noted in TypeScript TODO)
- [ ] Implement batch voucher collection support (collectMany)
- [ ] Add voucher storage/retrieval helpers for managing multiple vouchers
- [ ] Performance optimization for voucher lookups

### Low Priority
- [ ] Add comprehensive logging for debugging
- [ ] Create example scripts showing deferred payment flows
- [ ] Document differences between exact and deferred schemes
- [ ] Add type hints for all function parameters

## Security Notes

⚠️ **Important security considerations:**
- Voucher signatures MUST be verified before aggregation
- Expiry timestamps need to be checked to prevent expired voucher usage
- Chain ID validation is critical to prevent cross-chain replay attacks
- Value aggregation must be monotonically increasing
- Currently assumes trusted input for voucher data - needs validation in production

## Testing Notes

The test suite covers the core functionality but hasn't been run yet due to environment setup. Before using in production:
1. Run full test suite
2. Add integration tests with real escrow contracts
3. Test edge cases around timestamp boundaries
4. Verify signature compatibility with TypeScript implementation

## Implementation Notes

- Used eth_account for EIP-712 signing (same as exact scheme)
- Followed TypeScript structure closely for compatibility
- 30-day default expiry matches TypeScript
- Checksum addresses used throughout for consistency