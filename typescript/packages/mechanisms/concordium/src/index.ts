/**
 * x402/concordium
 *
 * Concordium blockchain implementation of the x402 payment protocol using the Exact payment scheme.
 *
 * Unlike EVM which uses EIP-3009 TransferWithAuthorization (signed off-chain, executed by facilitator),
 * Concordium uses a simpler flow where the client broadcasts the transaction directly:
 *
 * 1. Client requests content
 * 2. Middleware returns 402 status with payment details (payTo, amount, asset, etc.)
 * 3. Client creates and broadcasts transaction from Concordium wallet
 * 4. Client sends payment payload (including txHash) to middleware
 * 5. Facilitator verifies transaction on-chain and confirms settlement
 * 6. Content is delivered
 *
 * ## Installation
 *
 * ```bash
 * npm install @x402/concordium
 * ```
 *
 * ## Quick Start
 *
 * ### Client Usage
 *
 * ```typescript
 * import { x402Client } from "@x402/core/client";
 * import { registerExactConcordiumScheme } from "@x402/concordium/exact/client";
 *
 * const client = new x402Client();
 * registerExactConcordiumScheme(client, {
 *   createAndBroadcastTransaction: async (payTo, amount, asset) => {
 *     // Use your Concordium wallet SDK to create and broadcast
 *     const txHash = await wallet.sendCCD(payTo, amount);
 *     return { txHash, sender: wallet.address };
 *   }
 * });
 * ```
 *
 * ### Server Usage
 *
 * ```typescript
 * import { x402ResourceServer } from "@x402/core/server";
 * import { registerExactConcordiumScheme } from "@x402/concordium/exact/server";
 *
 * const server = new x402ResourceServer(facilitatorClient);
 * registerExactConcordiumScheme(server, {});
 * ```
 *
 * ### Facilitator Usage
 *
 * ```typescript
 * import { x402Facilitator } from "@x402/core/facilitator";
 * import { registerExactConcordiumScheme } from "@x402/concordium/exact/facilitator";
 *
 * const facilitator = new x402Facilitator();
 * registerExactConcordiumScheme(facilitator, {
 *   client: concordiumClient
 * });
 * ```
 *
 * ## Networks
 *
 * Concordium networks use CAIP-2 format: `ccd:<truncated-genesis-hash>`
 *
 * - Mainnet: `ccd:9dd9ca4d19e9393877d2c44b70f89acb`
 * - Testnet: `ccd:4221332d34e1694168c2a0c0b3fd0f27`
 *
 * Use `ccd:*` wildcard to support all Concordium networks.
 */

// Export V2 implementations (default)
export { ExactConcordiumScheme } from "./exact";

export { ConcordiumClient } from "./client";

export * from "./config";

// Main types
export * from "./types";
