#!/usr/bin/env node

/**
 * CLI utility for debugging x402 discovery refresh issues.
 *
 * This tool helps diagnose issues like the one described in:
 * https://github.com/coinbase/x402/issues/1659
 *
 * "Bazaar discovery does not refresh seller metadata or canonical resource after route update"
 *
 * Usage:
 *   npx tsx src/bazaar/cli-debug.ts <facilitator-url> <resource-url>
 *
 * Example:
 *   npx tsx src/bazaar/cli-debug.ts \
 *     https://api.cdp.coinbase.com/platform/v2/x402 \
 *     https://restricted-party-screen.vercel.app/api/ofac-sanctions-screening/SBERBANK
 */

import { cliDebugDiscovery } from "./debug";

const USAGE = `
Usage: npx tsx src/bazaar/cli-debug.ts <facilitator-url> <resource-url>

Arguments:
  facilitator-url  The x402 facilitator discovery endpoint URL
  resource-url     The resource URL to debug (will be canonicalized)

Examples:
  # Debug Coinbase facilitator
  npx tsx src/bazaar/cli-debug.ts \\
    https://api.cdp.coinbase.com/platform/v2/x402 \\
    https://my-api.com/endpoint

  # Debug custom facilitator
  npx tsx src/bazaar/cli-debug.ts \\
    https://my-facilitator.com \\
    https://my-api.com/endpoint?param=value

Common facilitator URLs:
  - Coinbase CDP: https://api.cdp.coinbase.com/platform/v2/x402
  - x402.org:     https://x402.org/facilitator

The tool will:
  1. Query the facilitator's discovery endpoint
  2. Find the resource by canonical URL (strips query params/fragments)
  3. Analyze freshness, metadata, and potential refresh issues
  4. Provide specific recommendations for resolving issues

Exit codes:
  0 - Success (resource found and analyzed)
  1 - Error (invalid arguments, network error, etc.)
  2 - Resource not found in discovery
`;

/**
 * Main CLI entry point function.
 * Parses command line arguments and executes the discovery debug workflow.
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2 || args.includes("--help") || args.includes("-h")) {
    console.log(USAGE);
    process.exit(args.includes("--help") || args.includes("-h") ? 0 : 1);
  }

  const [facilitatorUrl, resourceUrl] = args;

  if (!facilitatorUrl.startsWith("http")) {
    console.error("❌ Error: Facilitator URL must start with http:// or https://");
    console.error("");
    console.log(USAGE);
    process.exit(1);
  }

  if (!resourceUrl.includes("://")) {
    console.error("❌ Error: Resource URL must include protocol (http:// or https://)");
    console.error("");
    console.log(USAGE);
    process.exit(1);
  }

  try {
    await cliDebugDiscovery(facilitatorUrl, resourceUrl);
  } catch (error) {
    console.error("❌ Unexpected error:", error);
    process.exit(1);
  }
}

// Handle SIGINT gracefully
process.on("SIGINT", () => {
  console.log("\n👋 Discovery debug cancelled");
  process.exit(0);
});

// Run if this script is executed directly
if (require.main === module) {
  main();
}
