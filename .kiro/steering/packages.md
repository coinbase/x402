---
inclusion: always
---

# Package Structure & Dependency Rules

## Monorepo Overview

This is a fork of coinbase/x402. The original packages are NEVER modified.
All new code lives in new packages prefixed with `x402-observed-`.

## Original Packages (READ ONLY — never touch these)

```
typescript/packages/x402/              → @x402/core  (types, HTTPFacilitatorClient, shared logic)
typescript/packages/x402-express/      → @x402/express  (paymentMiddleware for Express)
typescript/packages/x402-next/         → @x402/next  (paymentMiddleware for Next.js)
typescript/packages/x402-fetch/        → @x402/fetch  (client-side fetch wrapper)
```

WHY: We must never modify upstream packages. Our observer packages import from them
as dependencies. If Coinbase ships an update, we pull it in cleanly.

## New Packages (our work)

```
typescript/packages/x402-observed-core/       → @x402-observed/core
typescript/packages/x402-observed-express/    → @x402-observed/express
typescript/packages/x402-observed-next/       → @x402-observed/next
typescript/packages/x402-observed-cli/        → x402-observed (the npx binary)
typescript/packages/x402-observed-dashboard/  → the local UI (not published to npm)
```

## Dependency Rules

- `@x402-observed/core` depends on: `@x402/core`, `better-sqlite3`
- `@x402-observed/express` depends on: `@x402-observed/core`, `@x402/express`
- `@x402-observed/next` depends on: `@x402-observed/core`, `@x402/next`
- `x402-observed` (CLI) depends on: `@x402-observed/core`, `@x402-observed/dashboard`, `express`
- Dashboard depends on: `@x402-observed/core` (reads SQLite directly)

NEVER create circular dependencies. Core must have zero knowledge of the dashboard or CLI.

## SQLite File Location

The SQLite database is written to `.x402-observed/events.db` in the ROOT of the
developer's project (wherever they ran `npx x402-observed`). Not in node_modules,
not in a temp folder. This makes it inspectable and version-ignorable via .gitignore.

## Import Pattern for Developers

A developer switches from official x402 to observed x402 by changing ONE import:

```ts
// Before
import { paymentMiddleware } from '@x402/express';

// After  
import { paymentMiddleware } from '@x402-observed/express';
```

The function signature is IDENTICAL. No other changes in their codebase.
If Kiro ever suggests changing anything else in the developer's server file, that is wrong.

## Dashboard: Where It Comes From

The dashboard is the existing Next.js frontend from the original x402-workflow-observer
project (the developer's previous codebase). It lives at:

```
typescript/packages/x402-observed-dashboard/
```

It is adapted, not rewritten. The only changes from the original:
1. Data source switches from Postgres/Prisma to SQLite via a local REST API
2. Polling endpoint changes from the old backend to `http://localhost:4402/api/workflows`
3. SSE endpoint added: `http://localhost:4402/api/events` for live updates

Do NOT rewrite the dashboard UI from scratch. Adapt the existing components.

## The npx Command

The CLI package (`x402-observed`) has a `bin` entry in package.json:

```json
"bin": {
  "x402-observed": "./dist/index.js"
}
```

When published to npm, `npx x402-observed` downloads and runs this binary.
It starts an Express server on port 4402 that:
1. Serves the dashboard static files
2. Exposes REST API over the SQLite file
3. Streams SSE for live updates

The developer never configures a port, a database path, or any environment variable.
Everything is zero-config by default.