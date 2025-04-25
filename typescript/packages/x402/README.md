# x402

Core TypeScript implementation of the x402 Payment Protocol. This package provides the foundational types, schemas, and utilities that power all x402 integrations.

## Installation

```bash
npm install x402
```

## Overview

The x402 package provides the core building blocks for implementing the x402 Payment Protocol in TypeScript. It's designed to be used by:

- Middleware implementations (Express, Hono, Next.js)
- Client-side payment handlers (fetch wrapper)
- Facilitator services
- Custom integrations

## Integration Packages

This core package is used by the following integration packages:

- `x402-express`: Express.js middleware
- `x402-hono`: Hono middleware
- `x402-next`: Next.js middleware
- `x402-fetch`: Fetch API wrapper
- `x402-axios`: Axios interceptor

