# A2A x402 Demo Frontend — Implementation Plan (Next.js/Vercel)

Goal: Build a minimal, production-quality dashboard (Next.js) to orchestrate and visualize the A2A + x402 demo. The app should:
- Start the demo (locally or via a remote orchestrator)
- Show live progress (steps + loader)
- Surface key artifacts (X-PAYMENT header, AgentCard, decoded X-PAYMENT-RESPONSE)
- Link to Polygon Amoy explorer for settlement tx
- Be deployable on Vercel (read-only/demo mode) and fully functional in local dev

---

## Architecture overview

- App framework: Next.js 14+ (App Router)
- UI library: minimal (Tailwind optional). Keep dependencies light.
- Orchestration:
  - Local mode: call Next.js API routes that shell-out to `demo/scripts/start-all.sh` or call individual endpoints to start services and run client (dev only; not Vercel-compatible)
  - Remote mode: call a remote "orchestrator" webhook (self-hosted service on your machine/VM) that runs the same script; frontend polls for status/logs
- Data flow:
  - API routes expose: start, status, logs (tail), artifacts (agent card, last X-PAYMENT, last X-PAYMENT-RESPONSE)
  - Frontend polls `/api/status` and `/api/logs` every N seconds during run

---

## Pages and routes

- `app/page.tsx`: Dashboard with Start Demo button, progress stepper, panels for artifacts and logs
- `app/api/orchestrate/start/route.ts`: POST → starts demo (local shell-out or remote webhook)
- `app/api/orchestrate/status/route.ts`: GET → returns current step + timestamps + last tx hash if present
- `app/api/orchestrate/logs/route.ts`: GET → returns tails of `/tmp/fac.log`, `/tmp/res.log`, `/tmp/service.log`, `/tmp/client_run*.log` (local) or proxied logs (remote)
- `app/api/artifacts/agent-card/route.ts`: GET → loads `demo/a2a/service-agent/agent-card.json` (static) or via running service (`/a2a` URL)
- `app/api/artifacts/payment/route.ts`: GET → returns last seen `X-PAYMENT` payload (base64 + decoded) if available
- `app/api/artifacts/response/route.ts`: GET → returns last `X-PAYMENT-RESPONSE` (base64 + decoded)

---

## Components

- `components/StartDemoButton.tsx`: Button; disabled while running; triggers `/api/orchestrate/start`
- `components/ProgressStepper.tsx`: Steps: ["Compile", "Start services", "Verify", "Settle", "Done"] with spinner on current step
- `components/ArtifactPanel.tsx`: Tabs for:
  - X-PAYMENT (base64 + JSON decoded)
  - AgentCard (JSON with pretty-print)
  - X-PAYMENT-RESPONSE (base64 + JSON decoded + tx link)
- `components/LogViewer.tsx`: Collapsible tails for facilitator/resource/service/client logs

---

## Environment variables (frontend)

- `ORCHESTRATOR_MODE` = `local` | `remote`
- Local-only (not for Vercel):
  - `START_SCRIPT_PATH` = `demo/scripts/start-all.sh`
  - `LOCAL_LOG_DIR` = `/tmp` (tailing logs)
- Remote mode:
  - `ORCHESTRATOR_BASE_URL` = `https://your-runner.example.com` (exposes `/start`, `/status`, `/logs`)
- Shared for display/links:
  - `FACILITATOR_URL` = `http://localhost:5401`
  - `SERVICE_AGENT_URL` = `http://localhost:5402`
  - `RESOURCE_SERVER_URL` = `http://localhost:5403`
  - `AMOY_EXPLORER_BASE` = `https://amoy.polygonscan.com`

Notes:
- On Vercel, disable local shell-out. The dashboard is read-only (pulls artifacts/status from remote orchestrator).
- For local dev, shell-out is allowed (`child_process.spawn`) in Node runtime only.

---

## API semantics

- `POST /api/orchestrate/start`
  - local: `spawn(START_SCRIPT_PATH)` with inherited env; return `{ started: true, pid }`
  - remote: `POST ORCHESTRATOR_BASE_URL/start`; return passthrough JSON
- `GET /api/orchestrate/status`
  - local: parse last known step from structured markers placed by the script or by polling logs
  - remote: proxy `GET ORCHESTRATOR_BASE_URL/status`
- `GET /api/orchestrate/logs`
  - local: read and tail files from `LOCAL_LOG_DIR`
  - remote: `GET ORCHESTRATOR_BASE_URL/logs`
- `GET /api/artifacts/agent-card`
  - local: `fs.readFile('demo/a2a/service-agent/agent-card.json')`
  - remote: attempt `GET {SERVICE_AGENT_URL}/agent-card.json` (if served) else fixed file
- `GET /api/artifacts/payment`
  - local: search recent client log for `CLIENT: typed-data domain/types/message` (last run) and return JSON
  - remote: proxy orchestrator
- `GET /api/artifacts/response`
  - local: parse `X-PAYMENT-RESPONSE` base64 from client log tail and decode

---

## Visual design

- Top: Title + Start Demo button
- Left: Progress stepper (shows running step; spinner while in progress)
- Right: Key artifacts:
  - AgentCard JSON (expand/collapse)
  - X-PAYMENT (base64 + decoded JSON)
  - X-PAYMENT-RESPONSE (base64 + decoded JSON + link to `AMOY_EXPLORER_BASE/tx/<hash>` when available)
- Bottom: Logs (tabs): Facilitator, Resource, Service Agent, Client

---

## Implementation plan & checklists

1) Bootstrap Next.js app (App Router)
- [ ] Add minimal Next.js setup to `demo/a2a/frontend` (use existing folder)
- [ ] Configure `next.config.js` for runtime env reads
- [ ] Add `eslint`/`tsconfig` (optional) and basic Tailwind (optional)

2) API routes (local mode MVP)
- [ ] `app/api/orchestrate/start/route.ts` (Node runtime): spawn `bash START_SCRIPT_PATH`
- [ ] `app/api/orchestrate/status/route.ts`: parse step markers from logs
- [ ] `app/api/orchestrate/logs/route.ts`: tail logs from `/tmp`
- [ ] `app/api/artifacts/agent-card/route.ts`: read local `agent-card.json`
- [ ] `app/api/artifacts/payment/route.ts`: parse client log for typed-data block
- [ ] `app/api/artifacts/response/route.ts`: parse and decode base64 response

3) API routes (remote mode)
- [ ] Replace shell-out with proxies to `ORCHESTRATOR_BASE_URL`
- [ ] Add guard: disallow shell-out on Vercel (process.env.VERCEL)

4) UI components
- [ ] `StartDemoButton.tsx`: calls `/api/orchestrate/start`, disables while running
- [ ] `ProgressStepper.tsx`: displays steps and active state
- [ ] `ArtifactPanel.tsx`: tabs for AgentCard, X-PAYMENT, X-PAYMENT-RESPONSE
- [ ] `LogViewer.tsx`: tabs for logs; auto-scroll tail; refresh each 2-3s

5) Page wiring and polling
- [ ] `app/page.tsx`: orchestrate state; poll `/api/orchestrate/status` while running
- [ ] Load artifacts/logs on demand; copy-to-clipboard buttons for base64 JSON

6) Env & configuration
- [ ] `.env.local` for frontend (different from demo backend). Document variables above
- [ ] Document local vs Vercel modes; ensure secrets not exposed in the client bundle

7) QA checklist
- [ ] Local mode: click Start Demo → compiles, starts services, runs client; progress updates; artifacts render
- [ ] Settlement tx link works when `REAL_SETTLE=true`
- [ ] Remote mode: start works via orchestrator webhook; logs and artifacts load
- [ ] Vercel deploy: read-only mode, no shell-out; UI loads, artifacts from remote

8) Stretch tasks (optional)
- [ ] SSE or WebSocket for live log streaming instead of polling
- [ ] Persist run history (Lite DB or file-based)
- [ ] Theming + responsive layout

---

## Folder structure (proposed)

```
demo/a2a/frontend/
  app/
    api/
      artifacts/
        agent-card/route.ts
        payment/route.ts
        response/route.ts
      orchestrate/
        start/route.ts
        status/route.ts
        logs/route.ts
    page.tsx
  components/
    ArtifactPanel.tsx
    LogViewer.tsx
    ProgressStepper.tsx
    StartDemoButton.tsx
  lib/
    logs.ts
    artifacts.ts
    status.ts
  next.config.js
  package.json
  README.md (frontend-only)
```

---

## Acceptance criteria

- [ ] One-click "Start Demo" triggers real local orchestration (dev) or remote orchestrator (prod)
- [ ] Progress stepper reflects compile/start/verify/settle/done with spinners
- [ ] AgentCard and payment artifacts are viewable and copyable; explorer link opens tx
- [ ] Works in local dev; deployable to Vercel (read-only + remote orchestration)
- [ ] No secrets leaked to the client bundle; shell-out disabled on Vercel 