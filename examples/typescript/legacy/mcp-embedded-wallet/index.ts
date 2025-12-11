import { closeApp, launchApp } from "./electron";
import { launchMcp } from "./mcp";
import { logger } from "./logger";

// Handle process termination
process.on("disconnect", function () {
  closeApp();
  process.exit();
});

process.on("SIGTERM", () => {
  closeApp();
  process.exit(0);
});

process.on("SIGINT", () => {
  closeApp();
  process.exit(0);
});

// Prevent the Node.js process from exiting while MCP server is running
process.stdin.resume();

/**
 * Main entry point for the application. Launches both the Electron app and MCP server.
 * Handles any startup errors and exits the process if initialization fails.
 *
 * @returns {Promise<void>} Resolves when both app and MCP server are launched
 */
async function main() {
  try {
    logger.info("Starting app");
    await launchApp();
    logger.info("Starting MCP server");
    await launchMcp();
  } catch (error) {
    logger.error("Failed to start:", error);
    process.exit(1);
  }
}

main();
