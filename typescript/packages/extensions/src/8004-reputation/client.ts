import {
    ERC8004_REPUTATION,
    type AgentIdentity,
    type ReputationInfo,
} from "./types";

/**
 * Creates client-side reputation info to be included in PaymentPayload.
 * Allows the client (agent) to advertise their own identity to the server.
 */
export function createClientReputationInfo(
    serverInfo: ReputationInfo,
    clientIdentity: AgentIdentity
): ReputationInfo {
    return {
        ...serverInfo,
        client: {
            agentIdentity: clientIdentity,
        },
    };
}

/**
 * Helper to wrap the reputation info for inclusion in PaymentPayload extensions.
 */
export function withClientReputation(
    serverInfo: ReputationInfo,
    clientIdentity: AgentIdentity
) {
    return {
        [ERC8004_REPUTATION]: createClientReputationInfo(serverInfo, clientIdentity),
    };
}
