# Agent Guidelines: x402 Monorepo

## Project Snapshot
- **Type**: Monorepo (pnpm + Turbo)
- **Stack**: TypeScript, Next.js 16 (Site), Node.js SDKs (Packages)
- **Primary Goal**: x402 Payment Protocol implementation
- **Sub-Agents**: See [site/AGENTS.md](site/AGENTS.md) and [packages/AGENTS.md](packages/AGENTS.md)

## Root Setup
- **Install**: `pnpm install` (Root level)
- **Build All**: `pnpm build` (Uses Turbo)
- **Test All**: `pnpm test`
- **Lint/Format**: `pnpm lint && pnpm format`

## Universal Conventions
- **Style**: Strict TypeScript, Prettier for formatting.
- **Commits**: Conventional Commits (feat, fix, chore).
- **Git**: Commit locally, user pushes. Always check `git status`.

## JIT Index - Directory Map
### Applications
- **Marketing Site**: `site/` → [see site/AGENTS.md](site/AGENTS.md)

### SDK Packages (`packages/`) → [see packages/AGENTS.md](packages/AGENTS.md)
- **Core Protocol**: `packages/core` (The brain)
- **Chain Support**: `packages/mechanisms/*` (EVM, SVM)
- **Adapters**: `packages/http/*` (Express, Next, etc.)

### Quick Find Commands
- Find exported function: `rg "export function Name" packages/**`
- Find React component: `rg "export function .* = \(" site/app`
- Find interface def: `rg "export interface .* {" packages/core/src`

## Definition of Done
1. Code builds: `pnpm build`
2. Tests pass: `pnpm test`
3. Lint passes: `pnpm lint:check`
4. No secrets in diff.
