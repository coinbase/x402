# x402 Client Examples

This directory contains TypeScript client examples demonstrating how to make HTTP requests to x402-protected endpoints.

## Directory Structure

| Directory | Description |
| --- | --- |
| [`fetch/`](./fetch/) | Using `@x402/fetch` with the native Fetch API |
| [`axios/`](./axios/) | Using `@x402/axios` with Axios |
| [`advanced/`](./advanced/) | Advanced patterns: lifecycle hooks, network preferences |
| [`custom/`](./custom/) | Manual implementation using only `@x402/core` |
| [`who-lookup/`](./who-lookup/) | The only mainnet example; opt-in — pays a real, live endpoint on Base mainnet so you can try the flow with no local server |

## Framework Examples

The **fetch** and **axios** directories showcase the minimal approach to integrating x402 payments into your HTTP client. These use our client interceptors that automatically handle the 402 payment flow:

1. Intercept 402 responses
2. Parse payment requirements
3. Create and sign payment
4. Retry request with payment header

Pick the example that matches your HTTP client of choice.

## Advanced Examples

The **advanced** directory demonstrates advanced features supported by our client interceptors:

- **Lifecycle Hooks** — Run custom logic before/after payment creation
- **Network Preferences** — Configure preferred payment networks with fallbacks

These patterns are useful for production applications that need observability, custom validation, or user preference handling.

## Custom Implementation

The **custom** directory shows how to implement x402 payment handling manually using only `@x402/core`, without any client interceptors. Use this approach when:

- You need complete control over the payment flow
- You're integrating with an HTTP client we don't have a package for
- You want to understand how x402 works under the hood

## Try It Against a Live Endpoint

Every example above defaults to `http://localhost:4021` and expects you to
run a [server](../servers/) yourself. If you'd rather see a real payment go
through first, [`who-lookup/`](./who-lookup/) points at a live, cheap
($0.05 USDC on Base mainnet) third-party endpoint instead — no local server,
no signup, just a funded EVM wallet.

**It's the only mainnet example here, and it's opt-in.** It spends real
money and has no testnet twin, so it refuses to run unless you set
`X402_ALLOW_MAINNET=1` — see its README before running it.

## Getting Started

1. Pick an example directory
2. Follow the README in that directory
3. Make sure you have a [server](../servers/) running to test against (or use [`who-lookup/`](./who-lookup/) to try a live endpoint instead)

