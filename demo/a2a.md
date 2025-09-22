# A2A + x402 Demo (Polygon Amoy) — Detailed Description

This document explains what we are building, which protocol elements we use, and which are simulated or intentionally out of scope. The implementation for this demo will reside under `demo/a2a/*` in this repository, and follows both the A2A (Agent2Agent) protocol and x402 payments standard.

- Upstream A2A repository: https://github.com/a2aproject/A2A
- Internal references: `demo/architecture.md`, `demo/demo.md`, `demo/research.md`, `demo/a2a_demo.md`

## What we are building

Two independent agents interoperate using A2A over JSON-RPC:
- A Client Agent requests a premium capability from a Service Agent using `message/send`.
- The Service Agent’s premium capability is implemented behind an HTTP paywall protected by x402 (Exact scheme).
- The Client Agent automatically pays a small fee in a USDC-like EIP-3009 token on Polygon Amoy, enabled by an Axios interceptor that crafts the `X-PAYMENT` header.
- A local Facilitator verifies and settles the payment on-chain and the Resource Server returns the paid content along with `X-PAYMENT-RESPONSE` including the transaction hash.

## A2A: What we use

- Transport: JSON-RPC 2.0 over HTTP(S)
- Methods implemented (Service Agent):
  - `message/send` (required)
  - `tasks/get` (optional minimal polling)
- Agent discovery:
  - Agent publishes an `AgentCard` (JSON) with:
    - `url` for its JSON-RPC endpoint
    - `preferredTransport: "JSONRPC"`
    - `capabilities.streaming: false`
    - `securitySchemes` (demo-only; may be optional or static Bearer)
- Data model:
  - Minimal shapes for `Message`, `Part` (Text/Data/File), and `Task`/`TaskStatus` where applicable
- Authentication:
  - HTTP-layer (demo-mode), declared in `AgentCard.securitySchemes`

## A2A: Simulated or not included (for this demo)

- Streaming and push notifications:
  - `message/stream` via SSE and push webhooks are scoped out for the first version
- Complex task orchestration/lifecycle:
  - We provide a simple `tasks/get` stub or basic polling; full lifecycle management is out of scope
- Rich artifacts and multi-modal parts:
  - We focus on text and JSON payloads; media/file parts are not central to the demo
- Advanced auth and federation:
  - OAuth/OpenID or advanced credential flows are not included; demo may use static or disabled auth

## x402: What we use

- Scheme: `exact` (EIP-3009 `transferWithAuthorization`)
- Network: Polygon Amoy (chainId 80002)
- Flow:
  1. Client calls premium HTTP endpoint → receives 402 with `accepts: PaymentRequirements[]`
  2. Client retries with `X-PAYMENT` header (base64-encoded PaymentPayload)
  3. Resource Server calls Facilitator `/verify` → serves content → calls `/settle`
  4. Server adds `X-PAYMENT-RESPONSE` (base64) with `{ success, transaction, network, payer }`
- Headers:
  - `X-PAYMENT` (request) and `X-PAYMENT-RESPONSE` (response)
- Facilitator endpoints:
  - `POST /verify`, `POST /settle`, `GET /supported`

## x402: Simulated or not included (for this demo)

- Token selection:
  - We will use a USDC-like EIP-3009 token address on Amoy or a locally deployed minimal EIP-3009-compatible token for demonstration
- Limits and pricing tiers:
  - A single, static `maxAmountRequired` is used; dynamic pricing and multi-tier rate cards are out of scope
- Production replay protection and idempotency stores:
  - We implement nonce checks/time windows; durable, multi-node idempotency stores are beyond the demo

## Component mapping

- Client Agent (`demo/a2a/client-agent`)
  - Loads AgentCard and sends `message/send`
  - Uses Axios + x402 interceptor to handle 402 challenges and payment
- Service Agent (`demo/a2a/service-agent`)
  - Implements A2A `message/send`; routes premium requests to Resource Server
  - Publishes `agent-card.json`
- Resource Server (`demo/a2a/resource-server-express`)
  - Exposes premium route (e.g., `/premium/summarize`) protected by `x402-express`
  - Calls Facilitator to verify/settle; emits `X-PAYMENT-RESPONSE`
- Facilitator (`demo/a2a/facilitator-amoy`)
  - Provides `/verify`, `/settle`, `/supported` specialized for Amoy

## Compliance guarantees

- A2A
  - JSON-RPC 2.0 wire format, method names, and basic data shapes align with specification
  - AgentCard fields and advertised capabilities match actual server behavior
- x402
  - Strict 402 → `X-PAYMENT` → verify → serve → settle → `X-PAYMENT-RESPONSE` cycle
  - EIP-3009 typed data, chain ID 80002, authorization windows and nonce handling

## Out-of-scope and future work

- Add `message/stream` (SSE), push notifications for long-running tasks
- Multiple tokens and multi-network support beyond Amoy
- Advanced auth (OAuth/OIDC), multi-tenant RBAC, audit trails
- Browser-wallet path and hosted facilitator redundancy

## How to run (high level)

1) Start Facilitator: `cd demo/a2a/facilitator-amoy && pnpm start`
2) Start Resource Server: `cd demo/a2a/resource-server-express && pnpm start`
3) Start Service Agent: `cd demo/a2a/service-agent && pnpm start`
4) Run Client Agent: `cd demo/a2a/client-agent && pnpm start`

Inspect logs for 402 challenge, paid retry, and `X-PAYMENT-RESPONSE` with the Amoy transaction hash. View the tx on `https://amoy.polygonscan.com/`. 