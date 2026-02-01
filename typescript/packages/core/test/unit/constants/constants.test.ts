import { describe, it, expect } from "vitest";
import {
    EVM_NETWORKS,
    SOLANA_NETWORKS,
    SUPPORTED_NETWORKS,
    DEFAULT_SCHEME,
    X402_HEADERS,
    HTTP_STATUS,
    USDC_ADDRESSES,
} from "../../../src/constants";

describe("Constants", () => {
    describe("EVM_NETWORKS", () => {
        it("should have correct CAIP-2 identifiers", () => {
            expect(EVM_NETWORKS.ETHEREUM).toBe("eip155:1");
            expect(EVM_NETWORKS.BASE).toBe("eip155:8453");
            expect(EVM_NETWORKS.BASE_SEPOLIA).toBe("eip155:84532");
            expect(EVM_NETWORKS.POLYGON).toBe("eip155:137");
            expect(EVM_NETWORKS.ARBITRUM).toBe("eip155:42161");
            expect(EVM_NETWORKS.OPTIMISM).toBe("eip155:10");
        });

        it("should be readonly", () => {
            expect(Object.isFrozen(EVM_NETWORKS)).toBe(false); // as const doesn't freeze
            expect(EVM_NETWORKS.BASE).toBeDefined();
        });
    });

    describe("SOLANA_NETWORKS", () => {
        it("should have correct Solana network identifiers", () => {
            expect(SOLANA_NETWORKS.MAINNET).toBe("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");
            expect(SOLANA_NETWORKS.DEVNET).toBe("solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1");
        });
    });

    describe("SUPPORTED_NETWORKS", () => {
        it("should include all EVM networks", () => {
            expect(SUPPORTED_NETWORKS.BASE).toBe(EVM_NETWORKS.BASE);
            expect(SUPPORTED_NETWORKS.ETHEREUM).toBe(EVM_NETWORKS.ETHEREUM);
        });

        it("should include Solana networks", () => {
            expect(SUPPORTED_NETWORKS.SOLANA).toBe(SOLANA_NETWORKS.MAINNET);
            expect(SUPPORTED_NETWORKS.SOLANA_DEVNET).toBe(SOLANA_NETWORKS.DEVNET);
        });
    });

    describe("DEFAULT_SCHEME", () => {
        it("should be exact", () => {
            expect(DEFAULT_SCHEME).toBe("exact");
        });
    });

    describe("X402_HEADERS", () => {
        it("should have correct header names", () => {
            expect(X402_HEADERS.PAYMENT_REQUIRED).toBe("x-payment-required");
            expect(X402_HEADERS.PAYMENT_SIGNATURE).toBe("x-payment-signature");
            expect(X402_HEADERS.PAYMENT_RESPONSE).toBe("x-payment-response");
        });
    });

    describe("HTTP_STATUS", () => {
        it("should have correct status codes", () => {
            expect(HTTP_STATUS.PAYMENT_REQUIRED).toBe(402);
            expect(HTTP_STATUS.OK).toBe(200);
            expect(HTTP_STATUS.BAD_REQUEST).toBe(400);
            expect(HTTP_STATUS.UNAUTHORIZED).toBe(401);
            expect(HTTP_STATUS.FORBIDDEN).toBe(403);
        });
    });

    describe("USDC_ADDRESSES", () => {
        it("should have addresses for supported networks", () => {
            expect(USDC_ADDRESSES["eip155:1"]).toBeDefined();
            expect(USDC_ADDRESSES["eip155:8453"]).toBeDefined();
            expect(USDC_ADDRESSES["eip155:84532"]).toBeDefined();
        });

        it("should have valid Ethereum addresses", () => {
            const baseAddress = USDC_ADDRESSES["eip155:8453"];
            expect(baseAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
        });
    });
});
