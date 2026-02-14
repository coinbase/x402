import type { ResourceServerExtension } from "@x402/core/types";
import { ERC8004_REPUTATION } from "./types";

/**
 * Resource server extension for ERC-8004 Reputation.
 *
 * This extension allows agents to advertise their ERC-8004 identity
 * and reputation registry in 402 PaymentRequired responses.
 */
export const reputationResourceServerExtension: ResourceServerExtension = {
    key: ERC8004_REPUTATION,

    enrichPaymentRequiredResponse: async (declaration) => {
        // Return the extension declaration as-is.
        // The declaration is created via declareReputation() and contains info + schema.
        return declaration;
    },
};
