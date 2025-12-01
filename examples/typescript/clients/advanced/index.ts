import { config } from "dotenv";
import { runHooksExample } from "./hooks";

config();

const evmPrivateKey = process.env.EVM_PRIVATE_KEY as `0x${string}`;
const baseURL = process.env.SERVER_URL || "http://localhost:4021";
const endpointPath = "/weather";
const url = `${baseURL}${endpointPath}`;

/**
 * Main example runner for advanced x402 client patterns.
 *
 * This package demonstrates advanced patterns for production-ready x402 clients:
 *
 * - hooks: Payment lifecycle hooks for custom logic at different stages
 *
 * To run this example, you need to set the following environment variables:
 * - EVM_PRIVATE_KEY: The private key of the EVM signer
 *
 * Usage:
 *   npm start hooks
 */
async function main(): Promise<void> {
  const pattern = process.argv[2] || "hooks";

  console.log(`\n🚀 Running advanced example: ${pattern}\n`);

  if (!evmPrivateKey) {
    console.error("❌ EVM_PRIVATE_KEY environment variable is required");
    process.exit(1);
  }

  switch (pattern) {
    case "hooks":
      await runHooksExample(evmPrivateKey, url);
      break;

    default:
      console.error(`Unknown pattern: ${pattern}`);
      console.error("Available patterns: hooks");
      process.exit(1);
  }
}

main().catch(error => {
  console.error(error?.response?.data?.error ?? error);
  process.exit(1);
});
