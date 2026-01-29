/**
 * Tests for 8004-Reputation Extension
 */

import { describe, it, expect, vi } from "vitest";
import {
  REPUTATION,
  declareReputationExtension,
  createAttestation,
  verifyAttestation,
  createTaskRef,
  extractNetworkFromTaskRef,
  extractTxHashFromTaskRef,
  createFeedbackSubmission,
  determineEvidenceTag,
  validateReputationExtension,
  hasReputationExtension,
  findRegistrationForNetwork,
  extractNetworkFromCaip10,
  extractAddressFromCaip10,
} from "../src/reputation";
import type {
  FacilitatorAttestation,
  FacilitatorSigner,
  ReputationRequiredExtension,
} from "../src/reputation";

describe("REPUTATION constant", () => {
  it("should equal '8004-reputation'", () => {
    expect(REPUTATION).toBe("8004-reputation");
  });
});

describe("declareReputationExtension", () => {
  it("should create a valid extension declaration", () => {
    const extension = declareReputationExtension({
      registrations: [
        {
          agentRegistry: "eip155:8453:0x8004A818BFB912233c491871b3d84c89A494BD9e",
          agentId: "42",
          reputationRegistry: "eip155:8453:0x8004B663C4a7e45d78F2D05C8e4A5a3D3D5e7890",
        },
      ],
    });

    expect(extension.info.version).toBe("1.0.0");
    expect(extension.info.registrations).toHaveLength(1);
    expect(extension.info.registrations[0].agentId).toBe("42");
    expect(extension.schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
  });

  it("should include feedbackAggregator when provided", () => {
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
      },
    });

    expect(extension.info.feedbackAggregator).toBeDefined();
    expect(extension.info.feedbackAggregator?.endpoint).toBe("https://x402.dexter.cash/feedback");
    expect(extension.info.feedbackAggregator?.gasSponsored).toBe(true);
  });

  it("should support multi-chain registrations", () => {
    const extension = declareReputationExtension({
      registrations: [
        {
          agentRegistry: "eip155:8453:0x8004A818...",
          agentId: "42",
          reputationRegistry: "eip155:8453:0x8004B663...",
        },
        {
          agentRegistry: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:satiRkx...",
          agentId: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
          reputationRegistry: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:satiRkx...",
        },
      ],
    });

    expect(extension.info.registrations).toHaveLength(2);
  });
});

describe("taskRef utilities", () => {
  const sampleTaskRef = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:5A2CSREGntKZu8f2abc123";

  it("should extract network from taskRef", () => {
    const network = extractNetworkFromTaskRef(sampleTaskRef);
    expect(network).toBe("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");
  });

  it("should extract txHash from taskRef", () => {
    const txHash = extractTxHashFromTaskRef(sampleTaskRef);
    expect(txHash).toBe("5A2CSREGntKZu8f2abc123");
  });

  it("should create taskRef from components", () => {
    const taskRef = createTaskRef("eip155:8453", "0x1234567890abcdef");
    expect(taskRef).toBe("eip155:8453:0x1234567890abcdef");
  });

  it("should handle EVM taskRef", () => {
    const evmTaskRef = "eip155:8453:0x1234567890abcdef1234567890abcdef12345678";
    const network = extractNetworkFromTaskRef(evmTaskRef);
    const txHash = extractTxHashFromTaskRef(evmTaskRef);

    expect(network).toBe("eip155:8453");
    expect(txHash).toBe("0x1234567890abcdef1234567890abcdef12345678");
  });
});

describe("createAttestation", () => {
  it("should create a valid attestation", async () => {
    const mockSign = vi.fn().mockResolvedValue("0xmocksignature123");

    const attestation = await createAttestation(
      {
        taskRef: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:5A2CSREG...",
        settledAmount: "1000",
        settledAsset: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        payTo: "CKPKJWNdJEqa81x7CkZ14BVPiY6y16Sxs7owznqtWYp5",
        payer: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
      },
      {
        facilitatorId: "eip155:8453:0x8004F123...",
        sign: mockSign,
      },
    );

    expect(attestation.facilitatorId).toBe("eip155:8453:0x8004F123...");
    expect(attestation.settledAmount).toBe("1000");
    expect(attestation.settledAsset).toBe("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
    expect(attestation.payTo).toBe("CKPKJWNdJEqa81x7CkZ14BVPiY6y16Sxs7owznqtWYp5");
    expect(attestation.payer).toBe("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM");
    expect(attestation.attestationSignature).toBe("0xmocksignature123");
    expect(attestation.settledAt).toBeDefined();
    expect(mockSign).toHaveBeenCalled();
  });

  it("should use provided settledAt timestamp", async () => {
    const mockSign = vi.fn().mockResolvedValue("0xsig");
    const timestamp = 1737763200;

    const attestation = await createAttestation(
      {
        taskRef: "eip155:8453:0x123...",
        settledAmount: "1000",
        settledAsset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: "0xAgentWallet...",
        payer: "0xPayerWallet...",
        settledAt: timestamp,
      },
      {
        facilitatorId: "eip155:8453:0xFacilitator...",
        sign: mockSign,
      },
    );

    expect(attestation.settledAt).toBe(timestamp);
  });
});

describe("verifyAttestation", () => {
  const validSigner: FacilitatorSigner = {
    publicKey: "04abc123...",
    algorithm: "secp256k1",
    role: "owner",
    validFrom: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
    validUntil: null,
  };

  const expiredSigner: FacilitatorSigner = {
    publicKey: "04expired...",
    algorithm: "secp256k1",
    role: "owner",
    validFrom: Math.floor(Date.now() / 1000) - 7200, // 2 hours ago
    validUntil: Math.floor(Date.now() / 1000) - 3600, // expired 1 hour ago
  };

  it("should verify valid attestation", async () => {
    const attestation: FacilitatorAttestation = {
      facilitatorId: "eip155:8453:0x...",
      settledAt: Math.floor(Date.now() / 1000),
      settledAmount: "1000",
      settledAsset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      payTo: "0xAgent...",
      payer: "0xPayer...",
      attestationSignature: "0xvalidsig",
    };

    const mockVerify = vi.fn().mockResolvedValue(true);

    const result = await verifyAttestation({
      attestation,
      taskRef: "eip155:8453:0x123...",
      signers: [validSigner],
      verify: mockVerify,
    });

    expect(result.valid).toBe(true);
    expect(result.signer).toEqual(validSigner);
  });

  it("should reject with no valid signers", async () => {
    const attestation: FacilitatorAttestation = {
      facilitatorId: "eip155:8453:0x...",
      settledAt: Math.floor(Date.now() / 1000),
      settledAmount: "1000",
      settledAsset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      payTo: "0xAgent...",
      payer: "0xPayer...",
      attestationSignature: "0xsig",
    };

    const result = await verifyAttestation({
      attestation,
      taskRef: "eip155:8453:0x123...",
      signers: [expiredSigner], // Only expired signer
      verify: vi.fn(),
    });

    expect(result.valid).toBe(false);
    expect(result.error).toContain("No valid signers");
  });

  it("should reject invalid signature", async () => {
    const attestation: FacilitatorAttestation = {
      facilitatorId: "eip155:8453:0x...",
      settledAt: Math.floor(Date.now() / 1000),
      settledAmount: "1000",
      settledAsset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      payTo: "0xAgent...",
      payer: "0xPayer...",
      attestationSignature: "0xinvalid",
    };

    const mockVerify = vi.fn().mockResolvedValue(false);

    const result = await verifyAttestation({
      attestation,
      taskRef: "eip155:8453:0x123...",
      signers: [validSigner],
      verify: mockVerify,
    });

    expect(result.valid).toBe(false);
    expect(result.error).toContain("Signature verification failed");
  });
});

describe("createFeedbackSubmission", () => {
  it("should create a signed feedback submission", async () => {
    const mockSign = vi.fn().mockResolvedValue("0xclientsig123");

    const submission = await createFeedbackSubmission({
      taskRef: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:5A2CSREG...",
      agentId: "42",
      reputationRegistry: "eip155:8453:0x8004B663...",
      value: 95,
      valueDecimals: 0,
      tag1: "x402-delivered",
      tag2: "proof-of-settlement",
      clientAddress: "eip155:8453:0x857b0651...",
      sign: mockSign,
    });

    expect(submission.taskRef).toBe("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:5A2CSREG...");
    expect(submission.agentId).toBe("42");
    expect(submission.value).toBe(95);
    expect(submission.tag1).toBe("x402-delivered");
    expect(submission.tag2).toBe("proof-of-settlement");
    expect(submission.clientSignature).toBe("0xclientsig123");
    expect(mockSign).toHaveBeenCalled();
  });

  it("should include facilitator attestation when provided", async () => {
    const attestation: FacilitatorAttestation = {
      facilitatorId: "eip155:8453:0xFac...",
      settledAt: 1737763200,
      settledAmount: "1000",
      settledAsset: "0x833589...",
      payTo: "0xAgent...",
      payer: "0xPayer...",
      attestationSignature: "0xfacsig",
    };

    const submission = await createFeedbackSubmission({
      taskRef: "eip155:8453:0x123...",
      facilitatorAttestation: attestation,
      agentId: "42",
      reputationRegistry: "eip155:8453:0x8004B663...",
      value: 100,
      clientAddress: "eip155:8453:0x857b0651...",
      sign: vi.fn().mockResolvedValue("0xsig"),
    });

    expect(submission.facilitatorAttestation).toEqual(attestation);
  });
});

describe("determineEvidenceTag", () => {
  it("should return proof-of-settlement when facilitator attestation exists", () => {
    const tag = determineEvidenceTag(true, true);
    expect(tag).toBe("proof-of-settlement");
  });

  it("should return proof-of-service when only agent signature exists", () => {
    const tag = determineEvidenceTag(true, false);
    expect(tag).toBe("proof-of-service");
  });

  it("should return proof-of-payment when neither exists", () => {
    const tag = determineEvidenceTag(false, false);
    expect(tag).toBe("proof-of-payment");
  });
});

describe("validateReputationExtension", () => {
  it("should validate a correct extension", () => {
    const extension = declareReputationExtension({
      registrations: [
        {
          agentRegistry: "eip155:8453:0x8004A818...",
          agentId: "42",
          reputationRegistry: "eip155:8453:0x8004B663...",
        },
      ],
    });

    const result = validateReputationExtension(extension as ReputationRequiredExtension);
    expect(result.valid).toBe(true);
  });
});

describe("hasReputationExtension", () => {
  it("should return true when extension exists", () => {
    const payload = {
      x402Version: 2,
      resource: { url: "https://example.com", description: "", mimeType: "" },
      accepted: {} as any,
      payload: {},
      extensions: {
        [REPUTATION]: { info: {}, schema: {} },
      },
    };

    expect(hasReputationExtension(payload)).toBe(true);
  });

  it("should return false when no extensions", () => {
    const payload = {
      x402Version: 2,
      resource: { url: "https://example.com", description: "", mimeType: "" },
      accepted: {} as any,
      payload: {},
    };

    expect(hasReputationExtension(payload)).toBe(false);
  });
});

describe("findRegistrationForNetwork", () => {
  const registrations = [
    {
      agentRegistry: "eip155:8453:0x8004A818...",
      agentId: "42",
      reputationRegistry: "eip155:8453:0x8004B663...",
    },
    {
      agentRegistry: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:satiRkx...",
      agentId: "7xKXtg...",
      reputationRegistry: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:satiRkx...",
    },
  ];

  it("should find EVM registration", () => {
    const reg = findRegistrationForNetwork(registrations, "eip155:8453");
    expect(reg?.agentId).toBe("42");
  });

  it("should find Solana registration", () => {
    const reg = findRegistrationForNetwork(registrations, "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");
    expect(reg?.agentId).toBe("7xKXtg...");
  });

  it("should return undefined for unknown network", () => {
    const reg = findRegistrationForNetwork(registrations, "eip155:1");
    expect(reg).toBeUndefined();
  });
});

describe("CAIP utilities", () => {
  it("should extract network from CAIP-10", () => {
    const network = extractNetworkFromCaip10("eip155:8453:0x8004A818...");
    expect(network).toBe("eip155:8453");
  });

  it("should extract address from CAIP-10", () => {
    const address = extractAddressFromCaip10("eip155:8453:0x8004A818...");
    expect(address).toBe("0x8004A818...");
  });

  it("should handle Solana CAIP-10", () => {
    const caip10 = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
    const network = extractNetworkFromCaip10(caip10);
    const address = extractAddressFromCaip10(caip10);

    expect(network).toBe("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");
    expect(address).toBe("7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU");
  });
});
