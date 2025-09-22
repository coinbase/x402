# A2A x402 Polygon Amoy Demo — Task Plan and Checklists

This plan specifies every task needed to implement the end‑to‑end demo in this repo, placing all demo source under `demo/a2a/*`. It integrates A2A (Agent2Agent) with x402 payments, settling on Polygon Amoy (chainId 80002). The A2A upstream repository is vendored as a submodule at `external/A2A`.

- References:
  - A2A Protocol repository: https://github.com/a2aproject/A2A
  - Internal docs: `demo/architecture.md`, `demo/demo.md`, `demo/research.md`

---

## Scope and success criteria

- [ ] A2A Service Agent (server) exposes minimal A2A JSON‑RPC methods (`message/send`, optional `tasks/get`).
- [ ] A2A Client Agent issues `message/send` to request a premium skill.
- [ ] Premium skill calls an x402‑protected HTTP resource; client automatically pays with `X-PAYMENT` and retries.
- [ ] Payment is verified and settled by a local Facilitator, returning `X-PAYMENT-RESPONSE` with Polygon Amoy tx hash.
- [ ] Optional: lightweight frontend dashboard to run the flow and display status/tx links.

---

## Repository layout (demo only)

All code and assets for this demo live under `demo/a2a/*`:

- `demo/a2a/service-agent/` — A2A Service Agent (server, JSON‑RPC over HTTP)
- `demo/a2a/client-agent/` — A2A Client Agent (initiates premium task)
- `demo/a2a/resource-server-express/` — x402‑protected premium HTTP endpoint
- `demo/a2a/facilitator-amoy/` — x402 Facilitator configured for Polygon Amoy
- `demo/a2a/frontend/` (optional) — Minimal UI to trigger and visualize the flow
- `demo/a2a/scripts/` — Helper scripts to run all services locally
- `demo/a2a/.env.*` — Environment files for each component
- `demo/a2a/AGENT_CARD.json` — AgentCard for the Service Agent

---

## Prerequisites and environment

- Tooling
  - [ ] Node.js 18+ and `pnpm`
  - [ ] `jq` (for shell scripts parsing JSON)
  - [ ] Python 3.11+ (optional for utilities)
- Keys and funding (testnet only)
  - [ ] Test private key for payer (Client Agent) funded with small Amoy MATIC for gas
  - [ ] Test private key for facilitator signer (settlement)
  - [ ] Resource server `payTo` address
- Network
  - [ ] Access to Amoy RPC endpoints (e.g., `https://rpc-amoy.polygon.technology`)
  - [ ] EIP‑3009 compatible test token on Amoy (address, name, version) or deploy a minimal EIP‑3009 token

---

## Global repo setup

- Submodule and branches
  - [x] Ensure A2A submodule exists at `external/A2A` (remote: `https://github.com/a2aproject/A2A`)
  - [ ] `git submodule update --init --recursive`
- Workspace packages (if needed by demo code)
  - [ ] Install dependencies at repo root: `pnpm install`
  - [ ] Verify TypeScript build where applicable: `pnpm -w build` (optional)

---

## x402 network adaptation (Polygon Amoy)

If first‑class Amoy support is required in the local x402 library, complete these tasks; otherwise, use per‑demo overrides in code.

- Types and enums
  - [ ] Add `"polygon-amoy"` to network schema/enums
  - [ ] Map `EvmNetworkToChainId.set("polygon-amoy", 80002)`
- EVM config
  - [ ] Add chain ID `80002` config with `usdcAddress` (or test EIP‑3009 token), `usdcName`, `usdcVersion`
- Wallet helpers
  - [ ] Implement `createClientAmoy()` and `createSignerAmoy(privateKey)` with `viem` Amoy chain
- Tests
  - [ ] Unit tests for network mapping and wallet creation
  - [ ] Smoke test `verify`/`settle` happy path with mocked RPC

If NOT modifying shared packages, ensure demo code sets `network: "polygon-amoy"`, `asset` (token address), and constructs viem clients directly.

---

## Component 1: Facilitator (Amoy)

Directory: `demo/a2a/facilitator-amoy/`

- Files
  - [x] `index.ts` — Express (or Hono) app implementing `/verify`, `/settle`, `/supported` (placeholder created)
  - [ ] `viem.ts` — Chain and wallet helpers for Amoy
  - [ ] `types.ts` — Request/response DTOs for facilitator endpoints
  - [x] `.env.sample` — `PRIVATE_KEY`, `AMOY_RPC_URL` (created)
  - [x] `package.json` + `tsconfig.json` + `pnpm-lock.yaml` (package.json placeholder created)
  - [x] `README.md` — how to run (created)
- Implementation
  - [ ] `/supported` returns capabilities with `network: "polygon-amoy"`
  - [ ] `/verify` validates `X-PAYMENT` payload (EIP‑3009 `transferWithAuthorization` intent)
  - [ ] `/settle` sends on‑chain tx via facilitator signer; returns tx hash
  - [ ] Logging: request ID, payer, network, tx hash
- Scripts
  - [ ] `pnpm dev` and `pnpm start`
- Validation
  - [ ] Local run prints health and supported networks

---

## Component 2: Resource Server (Express + x402)

Directory: `demo/a2a/resource-server-express/`

- Files
  - [x] `index.ts` — Express server with `x402-express` middleware (placeholder created)
  - [ ] `premium/summarize.ts` — premium handler (dummy summarization)
  - [ ] `x402.ts` — middleware wiring, facilitator client
  - [x] `.env.sample` — `ADDRESS` (payTo), `FACILITATOR_URL`, `AMOY_USDC_ADDRESS` (created)
  - [x] `package.json` + `tsconfig.json` (package.json placeholder created)
  - [x] `README.md` (created)
- Implementation
  - [ ] Protect `POST /premium/summarize` with x402 middleware
  - [ ] On 402: respond with `PaymentRequirements` containing:
        `scheme: "exact"`, `network: "polygon-amoy"`, `asset: AMOY_USDC_ADDRESS`,
        `payTo: ADDRESS`, `maxAmountRequired`, `extra: { name: "USDC", version: "2" }`,
        and `outputSchema`
  - [ ] After verify/settle, add `X-PAYMENT-RESPONSE` to response
  - [ ] CORS: expose `X-PAYMENT-RESPONSE`
- Scripts
  - [ ] `pnpm dev` and `pnpm start`
- Validation
  - [ ] First call returns 402 with `accepts` payload
  - [ ] Paid retry returns result + `X-PAYMENT-RESPONSE`

---

## Component 3: Service Agent (A2A server)

Directory: `demo/a2a/service-agent/`

- Files
  - [x] `index.ts` — HTTP JSON‑RPC router implementing `message/send` (and optional `tasks/get`) (placeholder created)
  - [x] `agent-card.json` — `preferredTransport: JSONRPC`, `capabilities.streaming: false`, `securitySchemes` (demo) (created)
  - [ ] `client/http.ts` — Axios client with `withPaymentInterceptor` for calling Resource Server
  - [x] `.env.sample` — `RESOURCE_SERVER_URL`, `ENDPOINT_PATH=/premium/summarize` (created)
  - [x] `package.json` + `tsconfig.json` (package.json placeholder created)
  - [x] `README.md` (created)
- Implementation
  - [ ] `message/send` accepts `{ skill, input }`
  - [ ] If `skill === "premium.summarize"`, call Resource Server over HTTP using payment‑aware client
  - [ ] Return JSON‑RPC `result` with downstream response
  - [ ] Optional `tasks/get` returns simple status for prior requests
- Validation
  - [ ] Direct JSON‑RPC call returns success for non‑premium skills
  - [ ] Premium path triggers x402 payment flow via client agent

---

## Component 4: Client Agent (A2A client)

Directory: `demo/a2a/client-agent/`

- Files
  - [x] `index.ts` — CLI entry (placeholder created)
  - [ ] `a2a.ts` — JSON‑RPC client for Service Agent (`message/send`)
  - [ ] `payment.ts` — Local account wallet + Axios `withPaymentInterceptor`
  - [x] `.env.sample` — `PRIVATE_KEY`, `SERVICE_AGENT_URL`, `AGENT_CARD_PATH` (created)
  - [x] `package.json` + `tsconfig.json` (package.json placeholder created)
  - [x] `README.md` (created)
- Implementation
  - [ ] Load AgentCard file or URL to discover Service Agent
  - [ ] Send `message/send` with `{ skill: "premium.summarize", input: { text } }`
  - [ ] Log initial 402 response details
  - [ ] On retry, log decoded `X-PAYMENT-RESPONSE` (transaction, network, payer)
- Validation
  - [ ] End‑to‑end run prints tx hash and result

---

## Optional Component: Frontend dashboard

Directory: `demo/a2a/frontend/`

- Scope: minimal dashboard to trigger the flow and display status + tx link
- Files
  - [x] `pages/index.tsx` or `vite` app entry (placeholder created)
  - [ ] `components/StatusCard.tsx`
  - [ ] `lib/api.ts` — invokes Client Agent or Service Agent HTTP façade
  - [x] `.env.local.sample` (placeholder created)
  - [x] `package.json` (created)
- Features
  - [ ] Button to start premium request
  - [ ] Live status (pending → paying → settled)
  - [ ] Show tx hash with link to `https://amoy.polygonscan.com/tx/<hash>`

---

## Cross‑cutting concerns

- Configuration and secrets
  - [x] `.env.sample` for each component; document required variables (placeholders added)
  - [ ] Never commit real keys; use testnet only
- Logging and observability
  - [ ] Correlation IDs across components
  - [ ] Structured logs (JSON) with minimal PII
- Error handling
  - [ ] Clear messages for verify/settle failures and timeouts
- DX
  - [x] `demo/a2a/scripts/dev.sh` to start all services in tmux or background (created placeholder)
  - [ ] Postman/Bruno collection for manual calls (optional)

---

## Run book (local)

- [ ] Terminal 1 — Facilitator
  - `cd demo/a2a/facilitator-amoy && pnpm start`
- [ ] Terminal 2 — Resource Server
  - `cd demo/a2a/resource-server-express && pnpm start`
- [ ] Terminal 3 — Service Agent
  - `cd demo/a2a/service-agent && pnpm start`
- [ ] Terminal 4 — Client Agent
  - `cd demo/a2a/client-agent && pnpm start`

Expected output:
- [ ] Initial 402 with `accepts` including `network: "polygon-amoy"`
- [ ] Retry with `X-PAYMENT` and success response
- [ ] `X-PAYMENT-RESPONSE` decodes to `{ success, transaction, network, payer }`
- [ ] View tx on Amoy explorer

---

## Validation checklist

- [ ] A2A JSON‑RPC contract conforms to minimal methods in docs
- [ ] AgentCard served or readable by client
- [ ] x402 `verify` and `settle` called with correct payloads
- [ ] Transaction submitted on Amoy; explorer link resolves
- [ ] End‑to‑end flow completes without manual intervention after starting services

---

## Deliverables

- [ ] All code under `demo/a2a/*` with `README.md` per component
- [ ] `demo/a2a_demo.md` (this plan)
- [ ] `.env.sample` files and run scripts
- [ ] Short screencast or GIF (optional)

---

## Appendix: File scaffolding (to create)

```
demo/
  a2a/
    facilitator-amoy/
      index.ts
      viem.ts
      types.ts
      .env.sample
      package.json
      tsconfig.json
      README.md
    resource-server-express/
      index.ts
      premium/summarize.ts
      x402.ts
      .env.sample
      package.json
      tsconfig.json
      README.md
    service-agent/
      index.ts
      agent-card.json
      client/http.ts
      .env.sample
      package.json
      tsconfig.json
      README.md
    client-agent/
      index.ts
      a2a.ts
      payment.ts
      .env.sample
      package.json
      tsconfig.json
      README.md
    frontend/ (optional)
      pages/index.tsx
      components/StatusCard.tsx
      lib/api.ts
      .env.local.sample
      package.json
    scripts/
      dev.sh
```

---

## Notes

- The A2A upstream repository is available under `external/A2A` for reference and spec alignment. See: https://github.com/a2aproject/A2A
- Keep demo surface minimal but production‑like for the payment path; avoid real funds; use testnet only. 

## Standards alignment: A2A compliance checklist

- Protocol and transport
  - [ ] Use JSON-RPC 2.0 over HTTP(S); requests include `jsonrpc: "2.0"`, `id`, `method`, `params`
  - [ ] Responses return JSON-RPC `result` or `error` object; HTTP status 200 for JSON-RPC errors is acceptable per common practice
  - [ ] Content-Type: `application/json`
- Minimal methods (server)
  - [ ] Implement `message/send`
  - [ ] Provide optional `tasks/get` for simple polling
  - [ ] Defer `message/stream` (SSE) and push notifications for future enhancement
- AgentCard
  - [ ] Publish `AgentCard` containing: `url`, `preferredTransport: "JSONRPC"`, `capabilities.streaming: false`
  - [ ] Include `securitySchemes` (demo-only Bearer optional) and any `additionalInterfaces` for documentation
  - [ ] Make AgentCard discoverable by file path or URL
- Data model
  - [ ] Support core A2A types: `Task`, `TaskStatus`, `Message`, `Part` (Text/Data/File), `Artifact`
  - [ ] Validate incoming `message/send` payload shapes against minimal schema
- Authentication
  - [ ] Support HTTP-layer auth as declared in `AgentCard.securitySchemes` (disabled or static for demo)
- Interoperability
  - [ ] Keep wire-compatible method names and JSON shapes for cross-agent interoperability
  - [ ] Document version alignment with the A2A specification

## Standards alignment: x402 compliance checklist

- Challenge and retry flow
  - [ ] First request returns HTTP 402 with body containing `accepts: PaymentRequirements[]`
  - [ ] Client retries with `X-PAYMENT` header containing base64-encoded `PaymentPayload`
  - [ ] On success, server includes `X-PAYMENT-RESPONSE` (base64) in final response
  - [ ] CORS exposes `X-PAYMENT-RESPONSE`
- PaymentRequirements (402 body)
  - [ ] `scheme: "exact"` (EIP-3009 `transferWithAuthorization`)
  - [ ] `network: "polygon-amoy"` (chainId 80002)
  - [ ] `resource` (full URL), `description`, `mimeType`
  - [ ] `payTo` (resource receiver address)
  - [ ] `maxAmountRequired` (e.g., 0.1 USDC in 6 decimals)
  - [ ] `maxTimeoutSeconds`
  - [ ] `asset` (EIP-3009-compatible token address on Amoy)
  - [ ] `extra` with domain info (e.g., `{ name: "USDC", version: "2" }`)
  - [ ] `outputSchema`
- PaymentPayload (client header)
  - [ ] Construct EIP-712 typed data for EIP-3009 `transferWithAuthorization`
  - [ ] Include `from`, `to`, `value`, `validAfter`, `validBefore`, `nonce`, `verifyingContract`, `chainId`, and `signature`
  - [ ] Encode as base64 JSON and set in `X-PAYMENT`
- Verification and settlement
  - [ ] Server calls Facilitator `/verify` prior to serving premium content
  - [ ] After serving, server calls Facilitator `/settle` to broadcast on-chain transaction
  - [ ] Facilitator `/supported` lists `polygon-amoy` and `exact` scheme
  - [ ] `X-PAYMENT-RESPONSE` encodes `{ success, transaction, network, payer }`
- Security and correctness
  - [ ] Validate `network`, `asset`, and amount bounds
  - [ ] Enforce time window (`validAfter`/`validBefore`) and nonce uniqueness
  - [ ] Verify signature recovery matches `from`
  - [ ] Handle replay protection and idempotency where applicable
- Errors and observability
  - [ ] Clear error codes/messages for invalid payments (400/401) and facilitator errors (5xx)
  - [ ] Structured logs with tx hash, payer, network, and request correlation ID

## Acceptance criteria (standards)

- [ ] A2A: `message/send` and AgentCard interoperability validated against the A2A specification
- [ ] x402: 402 challenge, `X-PAYMENT` retry, facilitator `/verify` + `/settle`, and `X-PAYMENT-RESPONSE` verified end-to-end on Polygon Amoy
- [ ] Documentation explicitly maps demo behaviors to the relevant parts of the A2A and x402 specs 

## Execution progress (work in workspace, not committed)

Completed (files created, not committed):

- [x] Scaffolding: created directories and placeholder files under `demo/a2a/*` (facilitator-amoy, resource-server-express, service-agent, client-agent, frontend, scripts).
- [x] Facilitator (demo implementation): `demo/a2a/facilitator-amoy/src/index.ts`, `demo/a2a/facilitator-amoy/src/types.ts`, `demo/a2a/facilitator-amoy/package.json`, `demo/a2a/facilitator-amoy/tsconfig.json`, `demo/a2a/facilitator-amoy/README.md` — implemented `/supported`, `/verify`, `/settle` (demo verification and optional real settle via env).
- [x] Resource Server (demo implementation): `demo/a2a/resource-server-express/src/index.ts`, `demo/a2a/resource-server-express/src/x402.ts`, `demo/a2a/resource-server-express/src/premium/summarize.ts`, `demo/a2a/resource-server-express/package.json`, `demo/a2a/resource-server-express/tsconfig.json`, `demo/a2a/resource-server-express/README.md` — x402 flow handlers created.
- [x] Service Agent (demo implementation): `demo/a2a/service-agent/src/index.ts`, `demo/a2a/service-agent/src/client/http.ts`, `demo/a2a/service-agent/agent-card.json`, `demo/a2a/service-agent/package.json`, `demo/a2a/service-agent/tsconfig.json`, `demo/a2a/service-agent/README.md` — minimal JSON-RPC `message/send` implemented and forwards to resource server.
- [x] Client Agent (demo implementation): `demo/a2a/client-agent/src/index.ts`, `demo/a2a/client-agent/src/a2a.ts`, `demo/a2a/client-agent/src/payment.ts`, `demo/a2a/client-agent/package.json`, `demo/a2a/client-agent/tsconfig.json`, `demo/a2a/client-agent/README.md` — Axios-based client and demo payment payload generator implemented.

Notes and next steps (waiting for your instruction to run or commit):
- No changes have been committed; everything exists in the working tree.
- I can run local smoke tests for the demo (start facilitator, resource server, service agent, client agent) and record outputs if you want — or I can implement additional items (e.g., unit tests, frontend, improved EIP-712 signing) before running tests. 