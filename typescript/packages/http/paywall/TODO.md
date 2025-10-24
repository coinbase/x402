# @x402/paywall

## Overview

The `@x402/paywall` package builds and exports the latest configurable **x402 paywall**.

It replaces the baked-in paywall from v1 (previously exported as `x402/paywall` from the legacy npm package), creating a clearer separation of concerns and serving as a reference SDK for custom paywall implementations.

This package is leveraged by `@x402/next`, `@x402/express`, and `@x402/hono` when returning **402 Payment Required** responses to browser clients.

## Migration from Legacy Paywall

### Legacy Package Structure
The original paywall was part of the monolithic `x402` npm package at:
- **Location**: `typescript/packages/legacy/x402/src/paywall/`
- **Export**: Available as `x402/paywall` in the v1 package
- **Build Process**: Custom esbuild setup that generates a self-contained HTML template with inlined JS/CSS

### Current Legacy Implementation Details

#### Core Files
1. **index.ts** - Main entry point that exports `getPaywallHtml()` function
   - Accepts PaywallOptions (amount, paymentRequirements, URLs, config)
   - Injects configuration into the HTML template via script tags
   - Handles string escaping for safe injection

2. **index.tsx** - React app entry point
   - Initializes React root when window loads
   - Renders PaywallApp wrapped in Providers

3. **PaywallApp.tsx** - Main React component (~305 lines)
   - Wallet connection via OnchainKit (Coinbase Smart Wallet, EOA, MetaMask, Phantom, Rabby, Trust, Frame)
   - Payment processing using x402 exact scheme
   - Balance checking and display
   - Chain switching logic (Base/Base Sepolia)
   - Onramp integration for mainnet
   - Status management and error handling

4. **build.ts** - Build script
   - Uses esbuild with HTML plugin to bundle everything
   - Generates a single HTML file with inlined JS/CSS
   - Creates TypeScript constant (`PAYWALL_TEMPLATE`) for runtime use
   - Also generates Python template for cross-language support

#### Dependencies
- **UI/Wallet**: @coinbase/onchainkit, wagmi, viem
- **React**: react, react-dom
- **Build**: esbuild, @craftamap/esbuild-plugin-html
- **Styles**: OnchainKit styles + custom CSS

## TODO - Initial Migration (Direct Lift)

## Notes

- The build process generates a completely self-contained HTML file (no external dependencies)
- Has Python template generation to support Python middleware. Needs Go.
- Consider maintaining backwards compatibility with v1 API surface
