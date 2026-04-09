---
"@x402/evm": minor
---

Add ERC-7710 smart account delegation support to the exact EVM facilitator.

Implements `verifyERC7710` and `settleERC7710` alongside the existing EIP-3009 and Permit2 handlers, completing the three asset transfer methods defined in the spec. Verification is performed entirely via `eth_call` simulation of `redeemDelegations` — no signature check required, the DelegationManager handles auth. Settlement calls `redeemDelegations` on the DelegationManager contract using ERC-7579 single-call execution mode.

New exports: `ExactERC7710Payload` type, `isERC7710Payload()` type guard. `AssetTransferMethod` now includes `"erc7710"`.
