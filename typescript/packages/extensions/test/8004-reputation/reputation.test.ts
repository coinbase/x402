import { describe, it, expect } from "vitest";
import { declareReputation } from "../../src/8004-reputation/declare";
import { ERC8004_REPUTATION } from "../../src/8004-reputation/types";

describe("ERC-8004 Reputation Extension", () => {
    const mockIdentity = {
        agentRegistry: "eip155:8453:0x123",
        agentId: "42",
    };
    const mockRegistry = "0xABC";

    it("should declare reputation extension correctly", () => {
        const extension = declareReputation({
            identity: mockIdentity,
            reputationRegistry: mockRegistry,
            endpoint: "https://agent.xyz",
        });

        expect(extension.info.identity).toEqual(mockIdentity);
        expect(extension.info.reputationRegistry).toBe(mockRegistry);
        expect(extension.info.endpoint).toBe("https://agent.xyz");
        expect(extension.schema.required).toContain("identity");
        expect(extension.schema.required).toContain("reputationRegistry");
    });

    it("should handle optional endpoint", () => {
        const extension = declareReputation({
            identity: mockIdentity,
            reputationRegistry: mockRegistry,
        });

        expect(extension.info.endpoint).toBeUndefined();
    });
});
