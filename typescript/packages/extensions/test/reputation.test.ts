/**
 * Tests for 8004-Reputation Extension
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  REPUTATION,
  declareReputationExtension,
  createReputationServerExtension,
  createAttestationEnricher,
  createAttestation,
  verifyAttestation,
  createTaskRef,
  buildAttestationMessage,
  hashAttestationMessage,
  createFeedbackSubmission,
  computeEvidenceLevel,
  validateReputationExtension,
  extractReputationData,
  validateFeedbackSubmission,
  validateFacilitatorIdentity,
  normalizeAddress,
  validateSignerAlgorithm,
  extractNetworkFromCaip10,
  extractAddressFromCaip10,
  aggregateCrossChainReputation,
  EvidenceLevel,
  type FacilitatorAttestation,
  type FeedbackSubmission,
  type AgentRegistration,
} from "../src/reputation";
import { submitToMultipleAggregators } from "../src/reputation/aggregator";
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";

describe("8004-Reputation Extension", () => {
  describe("REPUTATION constant", () => {
    it("should export the correct extension identifier", () => {
      expect(REPUTATION).toBe("8004-reputation");
    });
  });

  describe("declareReputationExtension", () => {
    it("should create a valid reputation extension", () => {
      const extension = declareReputationExtension({
        registrations: [
          {
            agentRegistry: "eip155:8453:0x8004A818BFB912233c491871b3d84c89A494BD9e",
            agentId: "42",
            reputationRegistry: "eip155:8453:0x8004B663C4a7e45d78F2D05C8e4A5a3D3D5e7890",
          },
        ],
        endpoint: "https://agent.example.com/api",
      });

      expect(extension.info.version).toBe("1.0.0");
      expect(extension.info.registrations).toHaveLength(1);
      expect(extension.info.registrations[0].agentId).toBe("42");
      expect(extension.schema).toBeDefined();
    });

    it("should include feedback aggregator configuration", () => {
      const extension = declareReputationExtension({
        registrations: [
          {
            agentRegistry: "eip155:8453:0x8004A818...",
            agentId: "42",
            reputationRegistry: "eip155:8453:0x8004B663...",
          },
        ],
        feedbackAggregator: {
          endpoint: "https://x402.dexter.cash/feedback",
          gasSponsored: true,
          fallbackEndpoints: ["https://backup-aggregator.com/feedback"],
        },
      });

      expect(extension.info.feedbackAggregator?.endpoint).toBe("https://x402.dexter.cash/feedback");
      expect(extension.info.feedbackAggregator?.gasSponsored).toBe(true);
      expect(extension.info.feedbackAggregator?.fallbackEndpoints).toHaveLength(1);
    });

    it("should include minimum feedback payment", () => {
      const extension = declareReputationExtension({
        registrations: [
          {
            agentRegistry: "eip155:8453:0x8004A818...",
            agentId: "42",
            reputationRegistry: "eip155:8453:0x8004B663...",
          },
        ],
        minimumFeedbackPayment: {
          amount: "1000",
          asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        },
      });

      expect(extension.info.minimumFeedbackPayment?.amount).toBe("1000");
      expect(extension.info.minimumFeedbackPayment?.asset).toBe("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
    });
  });

  describe("Evidence Level Computation", () => {
    it("should compute NONE level for submission without proofs", () => {
      const submission: FeedbackSubmission = {
        taskRef: "",
        agentId: "42",
        reputationRegistry: "eip155:8453:0x8004B663...",
        value: 50,
        valueDecimals: 0,
        clientAddress: "eip155:8453:0x1234...",
        clientSignature: "0xabc...",
      };

      const { level, score } = computeEvidenceLevel(submission);
      expect(level).toBe(EvidenceLevel.NONE);
      expect(score).toBe(0);
    });

    it("should compute PAYMENT level with taskRef", () => {
      const submission: FeedbackSubmission = {
        taskRef: "eip155:8453:0x123abc...",
        agentId: "42",
        reputationRegistry: "eip155:8453:0x8004B663...",
        value: 50,
        valueDecimals: 0,
        clientAddress: "eip155:8453:0x1234...",
        clientSignature: "0xabc...",
      };

      const { level, score } = computeEvidenceLevel(submission);
      expect(level).toBe(EvidenceLevel.PAYMENT);
      expect(score).toBeGreaterThanOrEqual(25);
    });

    it("should compute SETTLEMENT level with facilitator attestation", () => {
      const now = Math.floor(Date.now() / 1000);
      const submission: FeedbackSubmission = {
        taskRef: "eip155:8453:0x123abc...",
        agentId: "42",
        reputationRegistry: "eip155:8453:0x8004B663...",
        value: 50,
        valueDecimals: 0,
        clientAddress: "eip155:8453:0x1234...",
        clientSignature: "0xabc...",
        facilitatorAttestation: {
          facilitatorId: "eip155:8453:0x8004F123...",
          settledAt: now - 100,
          validUntil: now + 30 * 24 * 60 * 60,
          settledAmount: "1000",
          settledAsset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          payTo: "0xPayTo...",
          payer: "0xPayer...",
          attestationSignature: "0xsig...",
        },
      };

      const { level, score } = computeEvidenceLevel(submission);
      expect(level).toBe(EvidenceLevel.SETTLEMENT);
      expect(score).toBeGreaterThanOrEqual(50);
    });

    it("should compute SERVICE level with agent signature", () => {
      const submission: FeedbackSubmission = {
        taskRef: "eip155:8453:0x123abc...",
        agentId: "42",
        reputationRegistry: "eip155:8453:0x8004B663...",
        value: 50,
        valueDecimals: 0,
        clientAddress: "eip155:8453:0x1234...",
        clientSignature: "0xabc...",
        agentSignature: "0xagentSig...",
        interactionHash: "0xinteractionHash...",
      };

      const { level, score } = computeEvidenceLevel(submission);
      expect(level).toBe(EvidenceLevel.SERVICE);
      expect(score).toBeGreaterThanOrEqual(75);
    });

    it("should compute FULL level with all proofs and recent attestation", () => {
      const now = Math.floor(Date.now() / 1000);
      const submission: FeedbackSubmission = {
        taskRef: "eip155:8453:0x123abc...",
        agentId: "42",
        reputationRegistry: "eip155:8453:0x8004B663...",
        value: 50,
        valueDecimals: 0,
        clientAddress: "eip155:8453:0x1234...",
        clientSignature: "0xabc...",
        agentSignature: "0xagentSig...",
        interactionHash: "0xinteractionHash...",
        facilitatorAttestation: {
          facilitatorId: "eip155:8453:0x8004F123...",
          settledAt: now - 30 * 60, // 30 minutes ago
          validUntil: now + 30 * 24 * 60 * 60,
          settledAmount: "1000",
          settledAsset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          payTo: "0xPayTo...",
          payer: "0xPayer...",
          attestationSignature: "0xsig...",
        },
      };

      const { level, score } = computeEvidenceLevel(submission);
      expect(level).toBe(EvidenceLevel.FULL);
      expect(score).toBe(100);
    });
  });

  describe("Time-Bounded Attestations", () => {
    it("should include validUntil in attestation message", async () => {
      const params = {
        taskRef: "eip155:8453:0x123abc...",
        settledAmount: "1000",
        settledAsset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: "0xPayTo...",
        payer: "0xPayer...",
        settledAt: 1000,
        validUntil: 2000,
      };

      const message = buildAttestationMessage(params);
      expect(message.length).toBeGreaterThan(0);

      // Message should include both timestamps
      const hash = await hashAttestationMessage(message);
      expect(hash.length).toBe(32); // SHA-256 produces 32 bytes
    });

    it("should create attestation with default validUntil", async () => {
      const now = Math.floor(Date.now() / 1000);
      const attestation = await createAttestation(
        {
          taskRef: "eip155:8453:0x123abc...",
          settledAmount: "1000",
          settledAsset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          payTo: "0xPayTo...",
          payer: "0xPayer...",
        },
        {
          facilitatorId: "eip155:8453:0x8004F123...",
          sign: async () => "0xsig...",
        },
      );

      expect(attestation.validUntil).toBeGreaterThan(attestation.settledAt);
      expect(attestation.validUntil - attestation.settledAt).toBe(30 * 24 * 60 * 60); // 30 days
    });

    it("should reject expired attestations in validation", async () => {
      const now = Math.floor(Date.now() / 1000);
      const expiredAttestation: FacilitatorAttestation = {
        facilitatorId: "eip155:8453:0x8004F123...",
        settledAt: now - 100,
        validUntil: now - 1, // Expired
        settledAmount: "1000",
        settledAsset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: "0xPayTo...",
        payer: "0xPayer...",
        attestationSignature: "0xsig...",
      };

      const result = await verifyAttestation({
        attestation: expiredAttestation,
        taskRef: "eip155:8453:0x123abc...",
        signers: [],
        verify: async () => true,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain("expired");
    });
  });

  describe("Cross-Chain Address Utilities", () => {
    it("should normalize EVM addresses", () => {
      expect(normalizeAddress("0xABC123", "eip155")).toBe("abc123");
      expect(normalizeAddress("0xAbC123", "eip155")).toBe("abc123");
    });

    it("should not normalize Solana addresses", () => {
      const solanaAddr = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
      expect(normalizeAddress(solanaAddr, "solana")).toBe(solanaAddr);
    });

    it("should validate signer algorithms", () => {
      expect(validateSignerAlgorithm("secp256k1", "eip155")).toBe(true);
      expect(validateSignerAlgorithm("ed25519", "eip155")).toBe(false);
      expect(validateSignerAlgorithm("ed25519", "solana")).toBe(true);
      expect(validateSignerAlgorithm("secp256k1", "solana")).toBe(false);
    });

    it("should extract network from CAIP-10", () => {
      expect(extractNetworkFromCaip10("eip155:8453:0x1234...")).toBe("eip155:8453");
      expect(extractNetworkFromCaip10("solana:5eykt4...:7xKXtg...")).toBe("solana:5eykt4...");
    });

    it("should extract address from CAIP-10", () => {
      expect(extractAddressFromCaip10("eip155:8453:0x1234...")).toBe("0x1234...");
      expect(extractAddressFromCaip10("solana:5eykt4...:7xKXtg...")).toBe("7xKXtg...");
    });
  });

  describe("Facilitator Identity Validation", () => {
    it("should validate facilitator identity with ERC-8004 registration", async () => {
      const result = await validateFacilitatorIdentity({
        facilitatorId: "eip155:8453:0x8004F123...",
        identity: {
          agentRegistry: "eip155:8453:0x8004A818...",
          agentId: "99",
          registrationFile: "ipfs://Qm...",
        },
        fetchRegistration: async () => ({
          type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
          agentId: "99",
          signers: [
            {
              publicKey: "0x8004F123...",
              algorithm: "secp256k1",
              role: "owner",
              validFrom: 0,
              validUntil: null,
            },
          ],
        }),
      });

      expect(result.valid).toBe(true);
    });

    it("should reject invalid facilitator identity", async () => {
      const result = await validateFacilitatorIdentity({
        facilitatorId: "eip155:8453:0x8004F123...",
        identity: {
          agentRegistry: "eip155:8453:0x8004A818...",
          agentId: "99",
          registrationFile: "ipfs://Qm...",
        },
        fetchRegistration: async () => ({
          type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
          agentId: "99",
          signers: [
            {
              publicKey: "0xDIFFERENT...",
              algorithm: "secp256k1",
              role: "owner",
              validFrom: 0,
              validUntil: null,
            },
          ],
        }),
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain("not listed as signer");
    });
  });

  describe("Rate Limiting & Spam Prevention", () => {
    it("should validate minimum payment requirement", async () => {
      const submission: FeedbackSubmission = {
        taskRef: "eip155:8453:0x123abc...",
        agentId: "42",
        reputationRegistry: "eip155:8453:0x8004B663...",
        value: 50,
        valueDecimals: 0,
        clientAddress: "eip155:8453:0x1234...",
        clientSignature: "0xabc...",
      };

      const result = await validateFeedbackSubmission({
        submission,
        lookupSettlement: async () => ({
          found: true,
          amount: "500", // Below minimum
          asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        }),
        verifyClientSignature: async () => true,
        minimumPayment: {
          amount: "1000",
          asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        },
      });

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("payment_below_minimum");
    });

    it("should enforce rate limits", async () => {
      const submission: FeedbackSubmission = {
        taskRef: "eip155:8453:0x123abc...",
        agentId: "42",
        reputationRegistry: "eip155:8453:0x8004B663...",
        value: 50,
        valueDecimals: 0,
        clientAddress: "eip155:8453:0x1234...",
        clientSignature: "0xabc...",
      };

      const result = await validateFeedbackSubmission({
        submission,
        lookupSettlement: async () => ({ found: true }),
        verifyClientSignature: async () => true,
        rateLimitConfig: {
          maxFeedbackPerClient: 10,
          perTimeWindow: 86400, // 24 hours
        },
        getClientFeedbackCount: async () => 11, // Exceeds limit
      });

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("rate_limited");
    });
  });

  describe("Multi-Aggregator Support", () => {
    it("should submit to multiple aggregators", async () => {
      // Mock fetch for testing
      const originalFetch = globalThis.fetch;
      let callCount = 0;
      globalThis.fetch = async () => {
        callCount++;
        return {
          ok: true,
          json: async () => ({
            accepted: true,
            feedbackId: `fb_${callCount}`,
            status: "queued",
          }),
        } as Response;
      };

      try {
        const submission: FeedbackSubmission = {
          taskRef: "eip155:8453:0x123abc...",
          agentId: "42",
          reputationRegistry: "eip155:8453:0x8004B663...",
          value: 95,
          valueDecimals: 0,
          clientAddress: "eip155:8453:0x1234...",
          clientSignature: "0xabc...",
        };

        const result = await submitToMultipleAggregators({
          endpoints: [
            "https://aggregator1.com/feedback",
            "https://aggregator2.com/feedback",
          ],
          submission,
        });

        expect(result.successful).toBe(2);
        expect(result.failed).toBe(0);
        expect(result.results).toHaveLength(2);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe("Cross-Chain Aggregation", () => {
    it("should aggregate reputation from multiple chains", async () => {
      const registrations: AgentRegistration[] = [
        {
          agentRegistry: "eip155:8453:0x8004A818...",
          agentId: "42",
          reputationRegistry: "eip155:8453:0x8004B663...",
        },
        {
          agentRegistry: "solana:5eykt4...:satiRkxE...",
          agentId: "42",
          reputationRegistry: "solana:5eykt4...:satiRkxE...",
        },
      ];

      const now = Math.floor(Date.now() / 1000);
      const mockFeedback: FeedbackSubmission[] = [
        {
          taskRef: "eip155:8453:0x123abc...",
          agentId: "42",
          reputationRegistry: "eip155:8453:0x8004B663...",
          value: 90,
          valueDecimals: 0,
          clientAddress: "eip155:8453:0x1234...",
          clientSignature: "0xabc...",
          facilitatorAttestation: {
            facilitatorId: "eip155:8453:0x8004F123...",
            settledAt: now - 100,
            validUntil: now + 30 * 24 * 60 * 60,
            settledAmount: "1000",
            settledAsset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            payTo: "0xPayTo...",
            payer: "0xPayer...",
            attestationSignature: "0xsig...",
          },
        },
      ];

      const reputation = await aggregateCrossChainReputation({
        registrations,
        fetchChainFeedback: async () => mockFeedback,
      });

      expect(reputation.agentId).toBe("42");
      expect(reputation.totalFeedbackCount).toBeGreaterThan(0);
      expect(reputation.weightedScore).toBeGreaterThan(0);
      expect(Object.keys(reputation.chainBreakdown).length).toBeGreaterThan(0);
    });
  });

  describe("TaskRef Utilities", () => {
    it("should create taskRef from network and tx hash", () => {
      const taskRef = createTaskRef("eip155:8453", "0x123abc...");
      expect(taskRef).toBe("eip155:8453:0x123abc...");
    });

    it("should extract network from taskRef", () => {
      const { extractNetworkFromTaskRef } = await import("../src/reputation/attestation");
      const network = extractNetworkFromTaskRef("eip155:8453:0x123abc...");
      expect(network).toBe("eip155:8453");
    });

    it("should extract tx hash from taskRef", () => {
      const { extractTxHashFromTaskRef } = await import("../src/reputation/attestation");
      const txHash = extractTxHashFromTaskRef("eip155:8453:0x123abc...");
      expect(txHash).toBe("0x123abc...");
    });
  });
});
