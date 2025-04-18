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
- `agent/` - Example using an Anthropic agent implementation using `x402-fetch`
- `axios/` - Example using the Axios interceptor from `x402-axios`
- `fetch/` - Example using the fetch wrapper from `x402-fetch`
- `mcp/` - Example using MCP (Multi-Chain Protocol) as a client using `x402-axios`

### Facilitator
- `facilitator/` - Example implementation of an X402 payment facilitator

### Fullstack
- `next/` - Example Next.js application demonstrating full-stack X402 integration using `x402-next`

### Servers
Examples of different server implementations:
- `express/` - Example using Express.js with `x402-express`
- `hono/` - Example using Hono framework with `x402-hono`

## Running Examples

Each example directory contains its own README with specific instructions for running that example. Navigate to the desired example directory and follow its instructions.

## Development

This workspace uses:
- pnpm for package management
- Turborepo for monorepo management
- TypeScript for type safety

The examples are designed to work with the main X402 packages, so they must be built before running any examples.
