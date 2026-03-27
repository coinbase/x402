Fixes #1826

## Summary

This PR addresses a critical issue where hook errors in `afterVerify` and `afterSettle` callbacks could cause successful payment settlements to appear as failures. The problem occurs when external services (analytics, webhooks, databases) fail during post-settlement hooks, making successful on-chain transactions appear failed to the application.

## Changes

### Core Fixes
- **x402ResourceServer.ts**: Added try-catch blocks around all hook executions
- **x402Facilitator.ts**: Added try-catch blocks around all hook executions  
- Hook errors are now logged via `console.error` but don't affect operation results
- Intentional hook aborts (via result objects) still work as expected

### Hook Types Covered
- `beforeVerify` / `beforeSettle` - errors logged, intentional aborts preserved
- `afterVerify` / `afterSettle` - errors isolated from successful results
- `onVerifyFailure` / `onSettleFailure` - errors don't cascade failures

### Comprehensive Test Coverage
- **x402Facilitator.hooks.test.ts**: 200+ lines of new error isolation tests
- **x402ResourceServer.test.ts**: 150+ lines of hook error scenarios
- Tests cover single/multiple hook failures, recovery scenarios, and edge cases
- Validates that successful settlements remain successful despite hook failures

## Impact

- ✅ Prevents false negatives on successful payments
- ✅ External service failures don't break core payment flow  
- ✅ Hook errors are still logged for debugging
- ✅ Backward compatible - no breaking changes
- ✅ Comprehensive test coverage ensures reliability

## Testing

All existing tests pass, plus extensive new test suites:
```bash
pnpm test --filter @x402/core
```

Critical test case validates the core issue:
- Successful on-chain settlement + failing afterSettle hooks = successful result (not failed)