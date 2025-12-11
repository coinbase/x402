# Agent Guidelines: x402 Site

## Package Identity
- **Scope**: Marketing & Demo site for x402.
- **Tech**: Next.js 16 (App Router), React 19, Tailwind CSS v4.
- **Location**: `site/`

## Setup & Run
- **Dev**: `pnpm dev` (Runs on localhost:3000)
- **Build**: `pnpm build` (Next.js build)
- **Lint**: `pnpm lint`

## Patterns & Conventions
### App Router Structure
- **Pages**: `app/**/page.tsx`
- **Layouts**: `app/**/layout.tsx`
- **Components**: Located in `app/components/` (NOT `src/components`)
    - ✅ DO: `app/components/FeatureCard.tsx`
- **Hooks**: `app/hooks/`
- **Styles**: Tailwind v4. Global styles in `app/globals.css`.

### React 19 & Next.js 16
- Use Server Components by default.
- Add `'use client'` at the top of interactive components.
- **Async Components**: `export default async function Page() { ... }`

### Key Files
- **Root Layout**: `app/layout.tsx`
- **Homepage**: `app/page.tsx`
- **Config**: `next.config.ts` (Note `.ts` extension)

## JIT Index Hints
- **Find Page**: `rg "export default function .*Page" app`
- **Find Component**: `ls -R app/components`
- **Find API Route**: `app/api/**/route.ts`

## Common Gotchas
- **Images**: Use `next/image`. Assets in `public/`.
- **Imports**: Use relative imports or configured aliases (check `tsconfig.json`).
- **Env**: `NEXT_PUBLIC_` for client-side env vars.
