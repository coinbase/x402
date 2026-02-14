import { ERC8004_REPUTATION, type AgentIdentity, type ReputationInfo } from "./types";

/**
 * Creates client-side reputation info to be included in PaymentPayload.
 * Allows the client (agent) to advertise their own identity to the server.
 *
 * @param serverInfo - The server's reputation info from the PaymentRequired response
 * @param clientIdentity - The client's own agent identity
 * @returns The consolidated reputation info
 */
export function createClientReputationInfo(
  serverInfo: ReputationInfo,
  clientIdentity: AgentIdentity,
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
 *
 * @param serverInfo - The server's reputation info from the PaymentRequired response
 * @param clientIdentity - The client's own agent identity
 * @returns An extension object containing the reputation info
 */
export function withClientReputation(serverInfo: ReputationInfo, clientIdentity: AgentIdentity) {
  return {
    [ERC8004_REPUTATION]: createClientReputationInfo(serverInfo, clientIdentity),
  };
}
