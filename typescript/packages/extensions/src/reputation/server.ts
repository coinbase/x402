/**
 * Server-side Reputation Extension
 *
 * Implements ResourceServerExtension for the 8004-reputation extension.
 * Adds facilitator attestation to settlement responses.
 */
import type { ResourceServerExtension } from "@x402/core/types";
import type { SettleResultContext } from "@x402/core/server";
import { REPUTATION } from "./types";
import type {
  FacilitatorAttestation,
  FacilitatorAttestationConfig,
  ReputationInfo,
  ReputationSettlementExtension,
} from "./types";
import { createAttestation, createTaskRef } from "./attestation";

// ============================================================================
// Server Extension Configuration
// ============================================================================

/**
 * Configuration for the reputation server extension
 */
export interface ReputationServerExtensionConfig {
  /**
   * Facilitator attestation configuration
   * If provided, attestations will be added to settlement responses
   */
  attestation?: FacilitatorAttestationConfig;
  /**
   * Whether to include attestation only when agent declares reputation extension
   *
   * @default true
   */
  requireAgentDeclaration?: boolean;
}

/**
 * Creates the reputation server extension with optional facilitator attestation
 *
 * @param config - Extension configuration
 * @returns ResourceServerExtension instance
 *
 * @example
 * ```typescript
 * // Basic usage - just pass through agent's reputation info
 * const extension = createReputationServerExtension();
 *
 * // With facilitator attestation
 * const extension = createReputationServerExtension({
 *   attestation: {
 *     facilitatorId: "eip155:8453:0x8004F123...",
 *     sign: async (msg) => wallet.signMessage(msg)
 *   }
 * });
 *
 * // Register with x402 server
 * server.registerExtension(extension);
 * ```
 */
/**
 * Creates a helper function to enrich settlement responses with facilitator attestation
 * This can be used in afterSettle hooks
 *
 * @param config - Extension configuration
 * @returns Function that can be used in onAfterSettle hooks
 */
export function createAttestationEnricher(
  config: ReputationServerExtensionConfig,
): (
  context: SettleResultContext,
  declaration?: unknown,
) => Promise<ReputationSettlementExtension | undefined> {
  const { attestation: attestationConfig, requireAgentDeclaration = true } = config;

  return async (
    context: SettleResultContext,
    declaration?: unknown,
  ): Promise<ReputationSettlementExtension | undefined> => {
    const { result, requirements } = context;

    // Only add to successful settlements
    if (!result.success) {
      return undefined;
    }

    // Check if agent declared reputation extension
    if (requireAgentDeclaration) {
      const agentDeclaration = declaration as ReputationInfo | undefined;
      if (!agentDeclaration?.registrations?.length) {
        return undefined;
      }
    }

    // If no attestation config, return undefined (no facilitator attestation)
    if (!attestationConfig) {
      return undefined;
    }

    // Build taskRef from settlement result
    const taskRef = createTaskRef(result.network, result.transaction);

    // Create facilitator attestation
    let facilitatorAttestation: FacilitatorAttestation | undefined;
    try {
      facilitatorAttestation = await createAttestation(
        {
          taskRef,
          settledAmount: requirements.amount,
          settledAsset: requirements.asset,
          payTo: requirements.payTo,
          payer: result.payer ?? "",
        },
        attestationConfig,
      );
    } catch (error) {
      // Log but don't fail the settlement
      console.warn("[8004-reputation] Failed to create attestation:", error);
      return undefined;
    }

    // Return extension data for settlement response
    return {
      facilitatorAttestation,
    };
  };
}

/**
 * Creates the reputation server extension with optional facilitator attestation
 *
 * @param config - Extension configuration
 * @returns ResourceServerExtension instance
 *
 * @example
 * ```typescript
 * // Basic usage - just pass through agent's reputation info
 * const extension = createReputationServerExtension();
 *
 * // With facilitator attestation
 * const extension = createReputationServerExtension({
 *   attestation: {
 *     facilitatorId: "eip155:8453:0x8004F123...",
 *     sign: async (msg) => wallet.signMessage(msg)
 *   }
 * });
 *
 * // Register with x402 server
 * server.registerExtension(extension);
 *
 * // Also register the attestation enricher as a hook
 * if (config.attestation) {
 *   const enricher = createAttestationEnricher(config);
 *   server.onAfterSettle(async (context) => {
 *     const extension = await enricher(context);
 *     // Add extension to settlement response extensions
 *   });
 * }
 * ```
 */
export function createReputationServerExtension(
  config: ReputationServerExtensionConfig = {},
): ResourceServerExtension {
  return {
    key: REPUTATION,
    // enrichDeclaration can be used to pass through agent's reputation info
    enrichDeclaration: (declaration) => declaration,
  };
}

/**
 * Default reputation server extension without attestation
 *
 * Use this when you want to support the reputation extension
 * but don't want to provide facilitator attestations.
 */
export const reputationServerExtension: ResourceServerExtension =
  createReputationServerExtension();

// ============================================================================
// Declaration Helpers
// ============================================================================

/**
 * Configuration for declaring reputation support in PaymentRequired
 */
export interface DeclareReputationConfig {
  /**
   * Extension version
   */
  version?: string;
  /**
   * Agent registrations on ERC-8004 compliant registries
   */
  registrations: Array<{
    agentRegistry: string;
    agentId: string;
    reputationRegistry: string;
  }>;
  /**
   * Service endpoint URL
   */
  endpoint?: string;
  /**
   * Feedback aggregator configuration
   */
  feedbackAggregator?: {
    endpoint: string;
    networks?: string[];
    gasSponsored?: boolean;
    fallbackEndpoints?: string[];
  };
  /**
   * Minimum payment required to leave feedback
   */
  minimumFeedbackPayment?: {
    amount: string;
    asset: string;
  };
}

/**
 * Creates a reputation extension declaration for PaymentRequired
 *
 * @param config - Declaration configuration
 * @returns Extension object with info and schema
 *
 * @example
 * ```typescript
 * const extension = declareReputationExtension({
 *   registrations: [{
 *     agentRegistry: "eip155:8453:0x8004A818...",
 *     agentId: "42",
 *     reputationRegistry: "eip155:8453:0x8004B663..."
 *   }],
 *   feedbackAggregator: {
 *     endpoint: "https://x402.dexter.cash/feedback",
 *     gasSponsored: true
 *   }
 * });
 *
 * // Use in route config
 * const routes = {
 *   "POST /api": {
 *     price: "$0.01",
 *     extensions: {
 *       [REPUTATION]: extension
 *     }
 *   }
 * };
 * ```
 */
export function declareReputationExtension(config: DeclareReputationConfig) {
  const { version = "1.0.0", registrations, endpoint, feedbackAggregator, minimumFeedbackPayment } =
    config;

  const info: ReputationInfo = {
    version,
    registrations: registrations.map(r => ({
      agentRegistry: r.agentRegistry,
      agentId: r.agentId,
      reputationRegistry: r.reputationRegistry,
    })),
  };

  if (endpoint) {
    info.endpoint = endpoint;
  }

  if (feedbackAggregator) {
    info.feedbackAggregator = {
      endpoint: feedbackAggregator.endpoint,
    };
    if (feedbackAggregator.networks) {
      info.feedbackAggregator.networks = feedbackAggregator.networks;
    }
    if (feedbackAggregator.gasSponsored !== undefined) {
      info.feedbackAggregator.gasSponsored = feedbackAggregator.gasSponsored;
    }
    if (feedbackAggregator.fallbackEndpoints) {
      info.feedbackAggregator.fallbackEndpoints = feedbackAggregator.fallbackEndpoints;
    }
  }

  if (minimumFeedbackPayment) {
    info.minimumFeedbackPayment = {
      amount: minimumFeedbackPayment.amount,
      asset: minimumFeedbackPayment.asset,
    };
  }

  return {
    info,
    schema: {
      $schema: "https://json-schema.org/draft/2020-12/schema" as const,
      type: "object" as const,
      properties: {
        version: {
          type: "string" as const,
          pattern: "^\\d+\\.\\d+\\.\\d+$",
        },
        registrations: {
          type: "array" as const,
          minItems: 1,
          items: {
            type: "object" as const,
            properties: {
              agentRegistry: { type: "string" as const },
              agentId: { type: "string" as const },
              reputationRegistry: { type: "string" as const },
            },
            required: ["agentRegistry", "agentId", "reputationRegistry"] as const,
          },
        },
        endpoint: {
          type: "string" as const,
          format: "uri",
        },
        feedbackAggregator: {
          type: "object" as const,
          properties: {
            endpoint: { type: "string" as const, format: "uri" },
            networks: { type: "array" as const, items: { type: "string" as const } },
            gasSponsored: { type: "boolean" as const },
            fallbackEndpoints: {
              type: "array" as const,
              items: { type: "string" as const },
            },
          },
          required: ["endpoint"] as const,
        },
        minimumFeedbackPayment: {
          type: "object" as const,
          properties: {
            amount: { type: "string" as const },
            asset: { type: "string" as const },
          },
          required: ["amount", "asset"] as const,
        },
      },
      required: ["version", "registrations"] as const,
    },
  };
}
