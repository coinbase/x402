---
title: "Trust & Reputation in beforeSettle"
description: "How to use lifecycle hooks to gate x402 payments on wallet trust signals — from on-chain credentials for cold-start wallets to behavioral scoring and post-interaction reputation."
---

AI agents paying for API access via x402 present a trust problem: how does a server decide whether to settle a payment from an unknown wallet?

This guide shows how to use `onBeforeSettle` hooks to layer three complementary trust signals into the payment flow. Each answers a different question, and each covers a phase of the wallet lifecycle that the others cannot.

---

## The problem: cold-start wallets

A brand-new agent wallet has no transaction history and no reputation. Behavioral scoring returns nothing. On-chain reputation registries have no entries. But the wallet might hold staked ETH across three chains, governance tokens, and stablecoins — real economic substance that indicates a legitimate actor.

The `onBeforeSettle` hook is the right place to check, because it runs after payment verification but before funds move. If the wallet fails your trust criteria, you abort settlement and return an error — no funds lost, no service delivered.

---

## Three layers, three questions

| Layer | Question it answers | Signal source | Cold-start wallet? |
|-------|-------------------|---------------|-------------------|
| **On-chain credentials** | "Is this a real wallet with economic substance?" | Asset holdings across chains | Yes — this is the only signal available |
| **Behavioral scoring** | "Has this wallet behaved well?" | Transaction pattern analysis | No — requires history |
| **Post-interaction reputation** | "How did this wallet perform as a customer?" | Payment-weighted on-chain feedback | No — requires prior x402 interactions |

These are not competing signals ranked by strength. They answer different questions at different lifecycle phases. A wallet holding staked ETH and governance tokens across multiple chains is not a "weak" trust signal — it is strong evidence of economic substance. The other two layers simply cannot provide that evidence for a wallet with no history.

---

## Layer 1: On-chain credentials (cold-start coverage)

[InsumerAPI](https://insumermodel.com/developers/trust/) checks 17 on-chain conditions across 32 blockchains and returns an ECDSA-signed trust profile. The response includes per-check results organized into four dimensions (stablecoins, governance, NFTs, staking) plus a summary.

```typescript
import { x402ResourceServer } from "@x402/core";

const server = new x402ResourceServer(facilitatorClient);

server.onBeforeSettle(async (context) => {
  const payer = context.result.payer;

  const res = await fetch("https://api.insumermodel.com/v1/trust", {
    method: "POST",
    headers: {
      "X-API-Key": process.env.INSUMER_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ wallet: payer }),
  });
  const { ok, data } = await res.json();

  if (!ok) {
    return { abort: true, reason: "Credential check failed" };
  }

  // Response shape:
  // data.trust.summary.totalChecks        — 17 (base checks)
  // data.trust.summary.totalPassed        — how many checks this wallet passes
  // data.trust.summary.dimensionsWithActivity — dimensions where wallet has holdings
  // data.trust.summary.dimensionsChecked  — 4 (stablecoins, governance, NFTs, staking)
  // data.sig                              — ECDSA P-256 signature (base64 P1363)
  // data.kid                              — "insumer-attest-v1" (for JWKS lookup)

  const hasSubstance = data.trust.summary.dimensionsWithActivity >= 2;

  if (!hasSubstance) {
    return { abort: true, reason: "Wallet lacks economic substance across multiple dimensions" };
  }
});
```

The signature can be verified client-side via the [`insumer-verify`](https://www.npmjs.com/package/insumer-verify) npm package or by fetching the JWKS endpoint at `https://insumermodel.com/.well-known/jwks.json`.

**When this matters:** Every time, but especially for day-zero wallets that have never transacted with any x402 service.

Docs: [Trust endpoint](https://insumermodel.com/developers/trust/) | [API reference](https://insumermodel.com/developers/api-reference/)

---

## Layer 2: Behavioral scoring (transaction history)

[DJD Agent Score](https://github.com/JFJimenezDJD/djd-agent-score) analyzes on-chain transaction patterns — payment regularity, volume, wash trading detection — and returns a behavioral score.

```typescript
server.onBeforeSettle(async (context) => {
  const payer = context.result.payer;

  const res = await fetch(
    `https://djd-agent-score.fly.dev/v1/score/basic?wallet=${payer}`
  );
  const djd = await res.json();

  if (djd.score < 25) {
    return { abort: true, reason: "Behavioral score too low" };
  }
});
```

**When this matters:** Once a wallet has enough transaction history for pattern analysis. New wallets will return low or zero scores — which is expected, not suspicious.

Docs: [DJD Agent Score GitHub](https://github.com/JFJimenezDJD/djd-agent-score)

---

## Layer 3: Post-interaction reputation (on-chain feedback)

[ERC-8004 Reputation Registry](https://eips.ethereum.org/EIPS/eip-8004) stores payment-weighted feedback on-chain. Only wallets that have completed x402 payments to a service can submit opinions, and each opinion is weighted by cumulative USDC volume between rater and service. This makes fake reviews economically expensive.

```typescript
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";

const reputationRegistry = "0x8004..."; // ERC-8004 contract on Base

server.onBeforeSettle(async (context) => {
  const client = createPublicClient({ chain: base, transport: http() });

  const reputation = await client.readContract({
    address: reputationRegistry,
    abi: reputationRegistryAbi,
    functionName: "getWeightedReputation",
    args: [payerTokenId],
  });

  if (reputation.averageScore < 25n) {
    return { abort: true, reason: "On-chain reputation too low" };
  }
});
```

**When this matters:** After the wallet has completed enough x402 payments for meaningful reputation to accumulate. This is the strongest signal for repeat interactions, but provides nothing for first-time visitors.

Docs: [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) | [Azeth MCP Server](https://www.npmjs.com/package/@azeth/mcp-server)

---

## Composing all three layers

A production `onBeforeSettle` hook can layer all three signals with independent thresholds. The key design principle: each layer is opt-in, and the hook degrades gracefully when a signal is unavailable.

```typescript
server.onBeforeSettle(async (context) => {
  const payer = context.result.payer;
  let hasCredentials = false;
  let hasBehavior = false;
  let hasReputation = false;

  // Layer 1: On-chain credentials (always available)
  try {
    const trustRes = await fetch("https://api.insumermodel.com/v1/trust", {
      method: "POST",
      headers: {
        "X-API-Key": process.env.INSUMER_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ wallet: payer }),
    });
    const { ok, data } = await trustRes.json();
    if (ok) {
      hasCredentials = data.trust.summary.dimensionsWithActivity >= 2;
    }
  } catch {}

  // Layer 2: Behavioral scoring (requires transaction history)
  try {
    const djdRes = await fetch(
      `https://djd-agent-score.fly.dev/v1/score/basic?wallet=${payer}`
    );
    const djd = await djdRes.json();
    hasBehavior = djd.score >= 25;
  } catch {}

  // Layer 3: On-chain reputation (requires prior x402 interactions)
  try {
    const reputation = await reputationClient.readContract({
      address: reputationRegistry,
      abi: reputationRegistryAbi,
      functionName: "getWeightedReputation",
      args: [payerTokenId],
    });
    hasReputation = reputation.averageScore >= 25n;
  } catch {}

  // Gate: require at least one positive signal
  if (!hasCredentials && !hasBehavior && !hasReputation) {
    return {
      abort: true,
      reason: "No trust signals: wallet has no credentials, behavioral history, or reputation",
    };
  }
});
```

Facilitators can adjust the gating logic to their risk tolerance. Strict services might require credentials *and* behavior. Permissive services might accept any single signal. The hook pattern keeps this decision with the service operator, not the protocol.

---

## Related

- [Lifecycle Hooks](../advanced-concepts/lifecycle-hooks) — full hook API reference
- [Facilitator](../core-concepts/facilitator) — verification and settlement service
- [coinbase/x402#1395](https://github.com/coinbase/x402/issues/1395) — original discussion thread
