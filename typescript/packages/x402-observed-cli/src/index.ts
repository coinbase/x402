/**
 * x402-observed CLI
 *
 * Zero-configuration dashboard for x402 payment workflows.
 * Starts an Express server on port 4402 that serves the dashboard
 * and provides REST API + SSE for workflow data.
 */

import { createServer } from "./server";

const PORT = 4402;

/**
 * Main entry point for the CLI.
 */
async function main(): Promise<void> {
  const server = createServer();

  server.listen(PORT, () => {
    console.log(`\n✨ x402-observed dashboard running at http://localhost:${PORT}\n`);
  });

  // Graceful shutdown
  process.on("SIGINT", () => {
    console.log("\n\nShutting down x402-observed...");
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    console.log("\n\nShutting down x402-observed...");
    process.exit(0);
  });
}

main().catch((error) => {
  console.error("Failed to start x402-observed:", error);
  process.exit(1);
});
