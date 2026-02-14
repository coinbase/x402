import { z } from "zod";

/**
 * CAIP-220 format for task reference (e.g., eip155:1:tx/0x...)
 */
export const TaskReferenceSchema = z.string().regex(/^[a-z0-9]+:[a-z0-9]+:tx\/[a-zA-Z0-9]+$/);

/**
 * Proof of participation for verified interactions.
 */
export const ProofOfParticipationSchema = z.object({
    /**
     * Reference to the payment transaction.
     */
    taskRef: TaskReferenceSchema,
    /**
     * Optional signature from the agent to prove service was delivered.
     */
    agentSignature: z.string().optional(),
});

/**
 * Feedback file structure following ERC-8004.
 */
export const FeedbackFileSchema = z.object({
    agentRegistry: z.string(),
    agentId: z.string(),
    clientAddress: z.string(),
    createdAt: z.string(), // ISO 8601
    value: z.number(),
    valueDecimals: z.number().min(0).max(18),
    tag1: z.string().optional(),
    tag2: z.string().optional(),
    endpoint: z.string().optional(),
    proofOfPayment: z.object({
        fromAddress: z.string(),
        toAddress: z.string(),
        chainId: z.string(),
        txHash: z.string(),
    }).optional(),
    participation: ProofOfParticipationSchema.optional(),
});

export type FeedbackFile = z.infer<typeof FeedbackFileSchema>;
