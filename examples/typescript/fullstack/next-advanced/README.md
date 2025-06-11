# [WIP] Native Next.js example

This is an example of integrating x402 deeply into an existing next.js codebase. We will provide helpers that simply this in the next release of `x402-next`.

## Setup

1. Install and build all packages

```bash
cd ../../../../typescript
pnpm install
pnpm build
cd ../examples/typescript/fullstack/next-advanced
```

2. `pnpm run dev`

3. Visit `http://localhost:3000/protected`

## How this works

This approach has 3 parts:

1. a middleware (`middleware.ts`) that checks for a session cookie representing payment. If not present, it returns the `app/paywall/page.tsx` page.

2. `app/paywall/page.tsx` contains client side code for creating a payment

3. a server action that receives the signed payment (typically included in an `x-payment` header). It then verifies and settles payment, before setting a cookie to auth the session, and redirecting to the proper `/protected` endpoints.
