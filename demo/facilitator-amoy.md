# Hosting guide — facilitator-amoy

Goal: Host the demo `facilitator-amoy` service so it is reachable at a public TLS URL and can be used as the `facilitator` URL in `x402-express`'s `paymentMiddleware` configuration. This guide provides a complete plan and commands to build, run, secure, and operate the facilitator for Polygon Amoy.

Contents
- Overview
- Required repository files
- Environment variables
- Docker image and Dockerfile
- Quick deploy to a Linux VM (systemd + Docker)
- Docker Compose option
- GitHub Actions CI for building & pushing image
- TLS (Let's Encrypt) via Caddy or certbot + nginx
- Health, logs and monitoring
- Integration: how to wire with `paymentMiddleware`
- Security and operational notes

---

Overview
--------
`facilitator-amoy` is an Express-based Node service under `demo/a2a/facilitator-amoy/`. It implements `/supported`, `/verify`, `/settle`, and `/healthz`. To be usable by `paymentMiddleware` for Polygon Amoy, it must be reachable over HTTPS and have an account funded for gas (if REAL_SETTLE=true).

Required repository files (in this repo)
- `demo/a2a/facilitator-amoy/src/index.ts` — main app (already present)
- `demo/a2a/facilitator-amoy/package.json` — run/build scripts
- `demo/a2a/facilitator-amoy/dist/` — optional prebuilt dist if you prefer not to build inside container
- `demo/.env.local` (local only) — contains PRIVATE_KEYs and AMOY_RPC_URL

Files this guide will create (examples)
- `demo/orchestrator-stub/` (already added) — optional remote orchestrator
- `demo/facilitator-amoy.Dockerfile` — Dockerfile for facilitator image
- `.github/workflows/facilitator-build.yml` — CI to build/push the image (optional)

Environment variables (required)
- FACILITATOR_PRIVATE_KEY (or PRIVATE_KEY) — private key for facilitator to sign/submit txs (keep secret)
- AMOY_RPC_URL — JSON-RPC endpoint for Polygon Amoy
- AMOY_USDC_ADDRESS — EIP-3009-compatible token contract address used for verification/settle
- PORT — listening port (default 5401)
- REAL_SETTLE=true|false — whether to broadcast transactions
- NODE_ENV=production

Note: Do not set these as public Vercel envs. Use server-side secrets only on the host.

Dockerfile (place at `demo/facilitator-amoy.Dockerfile`)
```
# Stage 1: build
FROM node:20-alpine AS build
WORKDIR /app
COPY demo/a2a/facilitator-amoy/package*.json ./
RUN npm ci --only=production
COPY demo/a2a/facilitator-amoy/ .
RUN npm run build || true

# Stage 2: runtime
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app .
# expose port
EXPOSE 5401
CMD ["node", "dist/index.js"]
```

Build & run locally (Docker)

1. Build:
```bash
cd /path/to/repo
docker build -f demo/facilitator-amoy.Dockerfile -t x402/facilitator-amoy:latest .
```

2. Run with secrets injected (example using host networking or port mapping):
```bash
docker run -d --name facilitator-amoy \
  -e FACILITATOR_PRIVATE_KEY="<PRIVATE_KEY>" \
  -e AMOY_RPC_URL="https://your-amoy-rpc" \
  -e AMOY_USDC_ADDRESS="0x..." \
  -e REAL_SETTLE=true \
  -p 5401:5401 x402/facilitator-amoy:latest
```

Quick deploy to Ubuntu VM (systemd + Docker)

1. Provision a small VPS (e.g., 1 vCPU, 1GB+ RAM), Ubuntu 22.04.
2. Install Docker & docker-compose (or use apt + get.docker.com script).
3. Copy `demo/facilitator-amoy.Dockerfile` to the server or build via GitHub Container Registry.
4. Create a `systemd` unit to run the container via docker run, or use `docker-compose.yml` (example below).

Docker Compose example (`/srv/facilitator/docker-compose.yml`):
```
version: '3.8'
services:
  facilitator:
    image: x402/facilitator-amoy:latest
    build:
      context: /srv/facilitator
      dockerfile: demo/facilitator-amoy.Dockerfile
    restart: unless-stopped
    environment:
      - FACILITATOR_PRIVATE_KEY=${FACILITATOR_PRIVATE_KEY}
      - AMOY_RPC_URL=${AMOY_RPC_URL}
      - AMOY_USDC_ADDRESS=${AMOY_USDC_ADDRESS}
      - REAL_SETTLE=${REAL_SETTLE}
    ports:
      - "5401:5401"
    volumes:
      - /var/log/facilitator:/app/logs
```

TLS & domain (recommended)
- Use a reverse proxy that obtains and renews TLS automatically (Caddy is easiest, or nginx + certbot).
- Caddy example Caddyfile:
```
your-facilitator.example.com {
  reverse_proxy localhost:5401
}
```
- Run Caddy on the VM and it will auto-issue Let’s Encrypt certs.

GitHub Actions CI (build & push image)
- Create `.github/workflows/facilitator-build.yml` with steps to build and push to Docker Hub or GitHub Packages.
- Export image name `GHCR_HOST/x402/facilitator-amoy:tag` and reference that in docker-compose on server.

Monitoring & health
- The app exposes `/healthz` → use this in uptime monitors (UptimeRobot / Pingdom) to alert when offline.
- Tail logs (container logs or `/var/log/facilitator/*`) for errors.

Integration with `x402-express` paymentMiddleware
- In your resource server config, set the facilitator URL to your hosted endpoint:
```js
app.use(paymentMiddleware('0xPayToAddress', { 'GET /weather': { price: '$0.001', network: 'polygon-amoy' } }, { url: 'https://your-facilitator.example.com' }));
```
- Ensure your facilitator supports `polygon-amoy` (it does in this demo) by having `AMOY_RPC_URL` and `AMOY_USDC_ADDRESS` configured.

Security & operational notes
- Keep `FACILITATOR_PRIVATE_KEY` on the host only. Use a secrets manager (HashiCorp Vault, AWS Secrets Manager, or Docker secrets) in production.
- Rotate keys and monitor transactions broadcasting & balances; the facilitator must have funds for gas.
- Use firewall rules to restrict admin ports; only expose public HTTPS endpoint.

Optional: Kubernetes deployment
- Create a Deployment + Service + Ingress with TLS (cert-manager) if you use k8s.
- Mount secrets using Kubernetes Secret resources.

Files referenced in this guide (exact paths in repo)
- `demo/a2a/facilitator-amoy/src/index.ts`
- `demo/a2a/facilitator-amoy/package.json`
- `demo/a2a/facilitator-amoy/tsconfig.json`
- `demo/facilitator-amoy.Dockerfile` (this guide creates it)

Checklist before public use
- [ ] Ensure `AMOY_RPC_URL` points to a reliable Amoy RPC provider
- [ ] Fund facilitator signer account with test MATIC for gas
- [ ] Configure TLS and domain
- [ ] Configure monitoring & alerts

---

If you want, I will:
- Add the Dockerfile to the repo now (`demo/facilitator-amoy.Dockerfile`) and commit it.
- Add a sample `docker-compose.yml` and GitHub Actions workflow for building/pushing the image.
- Provide exact `systemd` unit and `Caddyfile` snippets.

Which of these do you want me to do next? (I can start by adding the Dockerfile and a simple `docker-compose.yml`.) 

---

## Progress log and next steps (context for a fresh chat)

### What I completed for `facilitator-amoy`
- Created a Dockerfile: `demo/facilitator-amoy.Dockerfile` to build a reproducible image that includes the compiled `dist/` output.
- Added a `build` script to the facilitator package so TypeScript is compiled during image build: `demo/a2a/facilitator-amoy/package.json` (`npm run build` → tsc).
- Added a Docker Compose sample: `demo/docker-compose.facilitator.yml` for easy single‑host deployments.
- Implemented a GitHub Actions workflow: `.github/workflows/facilitator-build.yml` to build multi‑arch images and push to GHCR (image name: `ghcr.io/<owner-lowercase>/x402-facilitator-amoy:latest`).
- Added a short orchestrator stub for local/remote orchestration testing: `demo/orchestrator-stub/index.js`.
- Built the Docker image locally and tested running it; verified `/healthz` responsed correctly.
- Pulled the published GHCR image and ran it locally; then started the full demo (resource + service + client) with `REAL_SETTLE=true` using secrets in `demo/.env.local` and verified the facilitator submitted a settlement transaction to Polygon Amoy: `0x29742b8b3f62cfd3cad4b2ab70838e351e9097a6d0d6654fc0ccea8910726446`.

### Key files I created/modified
- `demo/facilitator-amoy.Dockerfile`
- `demo/docker-compose.facilitator.yml`
- `.github/workflows/facilitator-build.yml`
- `demo/facilitator-amoy.md` (this file)
- `demo/orchestrator-stub/index.js`
- `demo/.env.example` (replaced tracked .env.local with example and untracked .env.local locally)
- `demo/a2a/facilitator-amoy/package.json` (added build script)

### Important notes you must keep in mind
- The facilitator must hold testnet funds to pay gas when REAL_SETTLE=true. Only enable REAL_SETTLE in secure, controlled environments.
- Never commit private keys or RPC URLs to the repo. Use local `demo/.env.local` (untracked) or a secret manager for production.
- After publishing, ensure the published GHCR image is used in production deployments and set your Resource Server `FACILITATOR_URL` to the HTTPS endpoint.

### Next steps I recommend (pick or I can do sequentially)
1. (CI) Confirm GHCR image is published and public/private settings are correct.
2. (Deploy) Deploy the container to a VPS with Docker Compose and Caddy for TLS; add a systemd unit to manage the compose stack.
3. (Monitor) Add uptime checks and balance-monitoring alerts for the facilitator key.
4. (Integrate) Configure `FACILITATOR_URL` in the Resource Server and `ORCHESTRATOR_BASE_URL` in the dashboard for remote orchestration.
5. (Harden) Replace in-memory nonce store with Redis or a persistent DB and secure secrets in a vault.

I recommend you now: (A) confirm the GHCR published image accessibility and then (B) deploy to a small VPS and point a domain at it with TLS. If you want I can proceed to create the systemd + Caddy configuration and provide exact deploy commands for a chosen host provider.

---

Next I will create `demo/facilitator-guide.md` containing a short developer guide to pull the facilitator image and run it locally with `x402-express` paymentMiddleware. 