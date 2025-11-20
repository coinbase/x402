# X402 TypeScript Examples

This directory contains a collection of TypeScript examples demonstrating how to use the X402 protocol in various contexts. These examples are designed to work with the X402 npm packages and share a workspace with the main X402 packages.

## Setup

Before running any examples, you need to install dependencies and build the packages:

```bash
# From the examples/typescript directory
pnpm install
pnpm build
```

## Example Structure

The examples are organized into several categories:

### Clients

Examples of different client implementations for interacting with X402 services:

- `clients/axios/` - Axios client with x402 payment interceptor from `x402-axios`.
- `clients/fetch/` - Client using the `x402-fetch` wrapper around the native fetch API.

### Facilitator

- `facilitator/` - Example implementation of an x402 payment facilitator exposing `/verify` and `/settle`.

### Servers

Examples of different server implementations:

- `servers/express/` - Express.js server using `x402-express` middleware.
- `servers/hono/` - Hono server using `x402-hono` middleware.
- `servers/advanced/` - Express server without middleware: delayed settlement, dynamic pricing, multiple requirements.

## Running Examples

Each example directory contains its own README with specific instructions for running that example. Navigate to the desired example directory and follow its instructions.

## Development

This workspace uses:

- pnpm for package management
- Turborepo for monorepo management
- TypeScript for type safety

The examples are designed to work with the main X402 packages, so they must be built before running any examples.
