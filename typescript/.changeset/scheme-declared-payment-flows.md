---
"@x402/core": minor
"@x402/evm": minor
"@x402/svm": minor
"@x402/avm": minor
"@x402/xrpl": minor
"@x402/tvm": minor
"@x402/stellar": minor
"@x402/near": minor
"@x402/keeta": minor
"@x402/hedera": minor
"@x402/concordium": minor
"@x402/aptos": minor
"@x402/express": minor
"@x402/hono": minor
"@x402/fastify": minor
"@x402/next": minor
"@x402/mcp": minor
---

Require ATM-keyed `paymentFlows` (and `defaultAssetTransferMethod`) on every `SchemeNetworkServer`. Core resolves ATM/flow from the table, rejects unsupported combinations, and always signals non-`authorization` `paymentFlow` on the 402 wire. All schemes currently declare `authorization` only.
