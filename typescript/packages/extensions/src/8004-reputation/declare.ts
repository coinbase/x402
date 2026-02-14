import { ERC8004_REPUTATION, type DeclareReputationOptions, type ReputationExtension } from "./types";

/**
 * Creates an ERC-8004 reputation extension declaration for x402 resource servers.
 */
export function declareReputation(options: DeclareReputationOptions): ReputationExtension {
    return {
        info: {
            identity: options.identity,
            reputationRegistry: options.reputationRegistry,
            ...(options.endpoint ? { endpoint: options.endpoint } : {}),
        },
        schema: {
            $schema: "https://json-schema.org/draft/2020-12/schema",
            type: "object",
            properties: {
                identity: {
                    type: "object",
                    properties: {
                        agentRegistry: { type: "string" },
                        agentId: { type: "string" },
                    },
                    required: ["agentRegistry", "agentId"],
                },
                reputationRegistry: { type: "string" },
                endpoint: { type: "string" },
                client: {
                    type: "object",
                    properties: {
                        agentIdentity: {
                            type: "object",
                            properties: {
                                agentRegistry: { type: "string" },
                                agentId: { type: "string" },
                            },
                            required: ["agentRegistry", "agentId"],
                        },
                    },
                },
            },
            required: ["identity", "reputationRegistry"],
        },
    };
}
