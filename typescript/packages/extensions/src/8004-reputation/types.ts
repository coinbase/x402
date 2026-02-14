import { z } from "zod";

/**
 * Extension identifier constant for ERC-8004 reputation.
 */
export const ERC8004_REPUTATION = "8004-reputation";

/**
 * Agent identity schema following CAIP-10 and ERC-8004.
 */
export const AgentIdentitySchema = z.object({
    /**
     * CAIP-10 format: {namespace}:{chainId}:{address}
     * e.g., "eip155:8453:0x742..." or "solana:5eyk...:AgentProgram..."
     */
    agentRegistry: z.string(),
    /**
     * The ID of the agent within the registry.
     * On EVM, this is the NFT tokenId. On Solana, this is the Account address.
     */
    agentId: z.string(),
});

/**
 * Reputation info schema for PaymentRequired extensions.
 */
export const ReputationInfoSchema = z.object({
    identity: AgentIdentitySchema,
    /**
     * Reputation registry address (EVM contract or Solana program).
     */
    reputationRegistry: z.string(),
    /**
     * Optional endpoint advertised by the agent.
     */
    endpoint: z.string().optional(),
    /**
     * Optional client identity advertised in PaymentPayload.
     */
    client: z
        .object({
            agentIdentity: AgentIdentitySchema,
        })
        .optional(),
});

/**
 * TypeScript types inferred from Zod schemas.
 */
export type AgentIdentity = z.infer<typeof AgentIdentitySchema>;
export type ReputationInfo = z.infer<typeof ReputationInfoSchema>;

/**
 * Complete ERC-8004 Reputation extension structure.
 */
export interface ReputationExtension {
    info: ReputationInfo;
    schema: {
        $schema: string;
        type: "object";
        properties: Record<string, unknown>;
        required: string[];
    };
}

/**
 * Options for declaring ERC-8004 reputation on a server.
 */
export interface DeclareReputationOptions {
    identity: AgentIdentity;
    reputationRegistry: string;
    endpoint?: string;
}
