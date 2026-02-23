# CDP Facilitator Memo Compatibility Issue

## Problem Description

The CDP hosted facilitator (`api.cdp.coinbase.com`) rejects Solana transactions that include Memo instructions (`MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr`), returning the error:

```
unknown fourth instruction: MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr
```

This is problematic because the x402 Python SDK's own SVM client (`x402/mechanisms/svm/exact/v1/client.py`) **adds Memo instructions by default** on every transaction it builds.

**Impact**: The official Python SDK produces transactions that the official CDP facilitator rejects on Solana, while EVM (Base) works fine.

## Root Cause

The Python SDK client builds transactions with 4 instructions:

```python
# x402/mechanisms/svm/exact/v1/client.py, lines 188-202
memo_ix = Instruction(
    program_id=Pubkey.from_string(MEMO_PROGRAM_ADDRESS),
    accounts=[],
    data=binascii.hexlify(os.urandom(16)),
)

message = MessageV0.try_compile(
    payer=fee_payer,
    instructions=[set_cu_limit_ix, set_cu_price_ix, transfer_ix, memo_ix],
    ...
)
```

The CDP facilitator only accepts 3 instructions: `[ComputeUnitLimit, ComputeUnitPrice, TransferChecked]` and rejects the Memo instruction.

Meanwhile, the open-source facilitator in the same SDK (`facilitator.py`, lines 228-249) **already whitelists** both `MEMO_PROGRAM_ADDRESS` and `LIGHTHOUSE_PROGRAM_ADDRESS` as valid optional instructions.

## Why Memo Instructions are Used

1. **Transaction uniqueness** — The random 16-byte nonce prevents duplicate transaction signatures when clients make multiple payments with the same amount/recipient within the same blockhash window
2. **SDK design** — The x402 Python SDK adds this automatically to every Solana transaction
3. **Security** — The Memo program is benign - it only logs UTF-8 data and cannot transfer funds or modify accounts

## Current Status

- **Issue reported**: [#1203](https://github.com/coinbase/x402/issues/1203)
- **Affected**: Solana transactions only (EVM works fine)
- **Root cause**: CDP facilitator doesn't whitelist Memo instructions that the SDK includes by default

## Workarounds

### Option 1: Use Alternative Facilitators

Switch to facilitators that support Memo instructions:

- `https://x402.org/facilitator` (supports both mainnet and testnet)
- `https://payai.net/x402/facilitator` (PayAI facilitator)
- Self-hosted facilitator using the open-source implementation

**Example configuration:**

```python
from x402.mechanisms.svm.exact.v1 import ExactSvmScheme

# Use x402.org facilitator instead of CDP
facilitator_url = "https://x402.org/facilitator"
scheme = ExactSvmScheme(facilitator_url=facilitator_url)
```

### Option 2: Custom Client Implementation

If you must use the CDP facilitator, you would need to modify the SVM client to not include Memo instructions. However, this approach:

- Removes transaction uniqueness protection
- May cause duplicate transaction issues
- Is not recommended for production use

## Comparison with Similar Issues

This follows the same pattern as [#828](https://github.com/coinbase/x402/issues/828), where the Phantom wallet's Lighthouse instructions were initially rejected but later whitelisted.

The Memo program is arguably even safer than Lighthouse since it has no account interactions at all.

## Recommendation

**For immediate use**: Switch to the `x402.org` facilitator for Solana transactions while continuing to use CDP for EVM transactions.

**Long-term**: The CDP facilitator should whitelist `MEMO_PROGRAM_ADDRESS` to match the behavior of the open-source facilitator, ensuring compatibility with the official Python SDK.

## Related Documentation

- [Network and Token Support](/docs/core-concepts/network-and-token-support.mdx) - For supported networks and facilitators
- [Facilitator](/docs/core-concepts/facilitator.md) - Understanding facilitator roles and responsibilities
- [Python SVM Documentation](https://github.com/coinbase/x402/tree/main/python) - Python SDK implementation details