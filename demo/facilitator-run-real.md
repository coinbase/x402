# run-real.js — real transaction test for the facilitator

This document describes `demo/tests/facilitator/run-real.js` (the real transaction test runner) and how it was executed during verification.

What the script does
- Loads configuration from `demo/.env.local` (uses `dotenv` with a path resolved relative to the script).
- Builds an EIP-3009 `TransferWithAuthorization` payload with fields: `from`, `to`, `value`, `validAfter`, `validBefore`, `nonce`, `verifyingContract` and `chainId` (80002).
- Signs the payload using the payer private key (`PRIVATE_KEY`) using Ethers v6 typed-data signing (`wallet.signTypedData`).
- Calls the facilitator endpoints in sequence:
  1. `POST /verify` with `{ paymentPayloadBase64 }` to validate signature and payload.
  2. `POST /settle` with the same payload to mark nonce used and (if configured) broadcast the on-chain `transferWithAuthorization`.
- Prints responses and the `X-PAYMENT-RESPONSE` header (base64). The header decodes to JSON that includes the `transaction` hash when a broadcast occurred.

How to run
1. Ensure `demo/.env.local` contains the correct values:
   - `PRIVATE_KEY` (payer key used to sign authorizations)
   - `FACILITATOR_PRIVATE_KEY` (settler account with gas funds)
   - `AMOY_RPC_URL` (a working Polygon Amoy RPC endpoint)
   - `AMOY_USDC_ADDRESS` (token contract supporting transferWithAuthorization)
   - `REAL_SETTLE=true` (to enable broadcasting)
2. Start the facilitator image with the env file mounted:

```bash
# from repo root
docker run -d --rm --name facilitator-real --env-file demo/.env.local -p 5401:5401 ghcr.io/akshatgada/x402-facilitator-amoy:latest
```

3. From repo root run the script:

```bash
node demo/tests/facilitator/run-real.js
```

Observed results (from this run)
- `/verify` returned `200 { success: true }` confirming the signed payload was valid.
- `/settle` returned `200 { success: true, transaction: '0xace10063808ccfdaedbfe118297fada1ac027b3c37ad46c569555ac985811e8c' }`.
- `X-PAYMENT-RESPONSE` header contained a base64-encoded JSON with the transaction hash and payer address; decoding yields `{ success: true, transaction: '0xace1...e8c', network: 'polygon-amoy', payer: '<payer address>' }`.

Verification on-chain
- To verify the transaction on Amoy, query the RPC or block explorer (if available) for the transaction hash returned above.

Security notes
- Do not commit private keys or secrets. Use a secrets manager or CI/GCP secret injection for production runs.
- The script and facilitator are for demo/test purposes; for production use a hardened facilitator with persistent nonce store and robust error handling. 