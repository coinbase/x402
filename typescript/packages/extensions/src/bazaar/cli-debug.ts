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
 *   npx tsx src/bazaar/cli-debug.ts --batch <facilitator-url> <resource-url-1> [resource-url-2] [...]
 *   npx tsx src/bazaar/cli-debug.ts --batch-file <facilitator-url> <file-path>
 *
 * Examples:
 *   # Single resource debug
 *   npx tsx src/bazaar/cli-debug.ts \
 *     https://api.cdp.coinbase.com/platform/v2/x402 \
 *     https://restricted-party-screen.vercel.app/api/ofac-sanctions-screening/SBERBANK
 *
 *   # Batch debug multiple resources
 *   npx tsx src/bazaar/cli-debug.ts --batch \
 *     https://api.cdp.coinbase.com/platform/v2/x402 \
 *     https://api1.example.com/endpoint \
 *     https://api2.example.com/endpoint
 *
 *   # Batch debug from file (one URL per line)
 *   npx tsx src/bazaar/cli-debug.ts --batch-file \
 *     https://api.cdp.coinbase.com/platform/v2/x402 \
 *     ./urls.txt
 */

import { readFileSync } from "fs";
import { cliDebugDiscovery, cliBatchDebugDiscovery } from "./debug";

const USAGE = `
Usage: 
  npx tsx src/bazaar/cli-debug.ts <facilitator-url> <resource-url>
  npx tsx src/bazaar/cli-debug.ts --batch [options] <facilitator-url> <resource-url-1> [resource-url-2] [...]
  npx tsx src/bazaar/cli-debug.ts --batch-file [options] <facilitator-url> <file-path>

Arguments:
  facilitator-url  The x402 facilitator discovery endpoint URL
  resource-url     The resource URL to debug (will be canonicalized)
  file-path        Path to text file with one URL per line

Options (batch mode only):
  --concurrency N     Maximum concurrent requests (default: 5)
  --domain DOMAIN     Only analyze URLs containing this domain
  --include-healthy   Include detailed output for healthy resources

Examples:
  # Debug single resource
  npx tsx src/bazaar/cli-debug.ts \\
    https://api.cdp.coinbase.com/platform/v2/x402 \\
    https://my-api.com/endpoint

  # Batch debug multiple resources
  npx tsx src/bazaar/cli-debug.ts --batch \\
    https://api.cdp.coinbase.com/platform/v2/x402 \\
    https://api1.example.com/endpoint \\
    https://api2.example.com/endpoint

  # Batch debug from file with options
  npx tsx src/bazaar/cli-debug.ts --batch-file --concurrency 10 --domain example.com \\
    https://api.cdp.coinbase.com/platform/v2/x402 \\
    ./urls.txt

Common facilitator URLs:
  - Coinbase CDP: https://api.cdp.coinbase.com/platform/v2/x402
  - x402.org:     https://x402.org/facilitator

The tool will:
  1. Query the facilitator's discovery endpoint
  2. Find resources by canonical URL (strips query params/fragments)
  3. Analyze freshness, metadata, and potential refresh issues
  4. Provide specific recommendations for resolving issues

Exit codes:
  0 - Success (resources found and analyzed)
  1 - Error (invalid arguments, network error, etc.)
  2 - Resource(s) not found in discovery
`;

/**
 * Parse command line arguments for batch debug options.
 *
 * @param args - Command line arguments array
 * @returns Parsed batch debug options
 */
function parseBatchOptions(args: string[]): {
  concurrency?: number;
  domainFilter?: string;
  includeHealthyDetails?: boolean;
} {
  const options: ReturnType<typeof parseBatchOptions> = {};

  const concurrencyIndex = args.indexOf("--concurrency");
  if (concurrencyIndex !== -1 && args[concurrencyIndex + 1]) {
    const value = parseInt(args[concurrencyIndex + 1], 10);
    if (!isNaN(value) && value > 0) {
      options.concurrency = value;
    }
  }

  const domainIndex = args.indexOf("--domain");
  if (domainIndex !== -1 && args[domainIndex + 1]) {
    options.domainFilter = args[domainIndex + 1];
  }

  if (args.includes("--include-healthy")) {
    options.includeHealthyDetails = true;
  }

  return options;
}

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

  const batchMode = args.includes("--batch");
  const batchFileMode = args.includes("--batch-file");

  if (batchMode || batchFileMode) {
    const options = parseBatchOptions(args);

    // Find facilitator URL (first non-option argument)
    const facilitatorUrl = args.find(arg => arg.startsWith("http"));
    if (!facilitatorUrl) {
      console.error("❌ Error: Facilitator URL must start with http:// or https://");
      console.error("");
      console.log(USAGE);
      process.exit(1);
    }

    let resourceUrls: string[] = [];

    if (batchFileMode) {
      // Find file path (argument after facilitator URL that doesn't start with http and isn't an option)
      const facilitatorIndex = args.indexOf(facilitatorUrl);
      let filePath: string | undefined;

      for (let i = facilitatorIndex + 1; i < args.length; i++) {
        const arg = args[i];
        if (!arg.startsWith("--") && !arg.startsWith("http") && !arg.match(/^\d+$/)) {
          filePath = arg;
          break;
        }
      }

      if (!filePath) {
        console.error("❌ Error: File path required for --batch-file mode");
        console.error("");
        console.log(USAGE);
        process.exit(1);
      }

      try {
        const fileContent = readFileSync(filePath, "utf-8");
        resourceUrls = fileContent
          .split("\n")
          .map(line => line.trim())
          .filter(line => line && !line.startsWith("#") && line.includes("://"));

        if (resourceUrls.length === 0) {
          console.error("❌ Error: No valid URLs found in file");
          process.exit(1);
        }
      } catch (error) {
        console.error(`❌ Error reading file ${filePath}:`, error);
        process.exit(1);
      }
    } else {
      // Batch mode - collect all URLs from command line
      resourceUrls = args.filter(arg => arg.includes("://") && arg !== facilitatorUrl);

      if (resourceUrls.length === 0) {
        console.error("❌ Error: At least one resource URL required for batch mode");
        console.error("");
        console.log(USAGE);
        process.exit(1);
      }
    }

    try {
      await cliBatchDebugDiscovery(facilitatorUrl, resourceUrls, options);
    } catch (error) {
      console.error("❌ Unexpected error:", error);
      process.exit(1);
    }
  } else {
    // Single resource mode
    const [facilitatorUrl, resourceUrl] = args;

    if (!facilitatorUrl || !facilitatorUrl.startsWith("http")) {
      console.error("❌ Error: Facilitator URL must start with http:// or https://");
      console.error("");
      console.log(USAGE);
      process.exit(1);
    }

    if (!resourceUrl || !resourceUrl.includes("://")) {
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
