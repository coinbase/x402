package com.coinbase.x402.model;

import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

/**
 * ERC-4337 network registry.
 * Contains supported chains for ERC-4337 account abstraction.
 */
public final class Erc4337Network {
    private Erc4337Network() {} // Prevent instantiation

    /** Chain information for an ERC-4337 supported network. */
    public static class ChainInfo {
        public final int chainId;
        public final String name;
        public final String v1Name;
        public final String caip2;
        public final String rpcUrl;
        public final String blockExplorerUrl;
        public final String usdcAddress;
        public final String safeTransactionServiceUrl;
        public final boolean testnet;

        /**
         * Creates chain info for an ERC-4337 supported network.
         *
         * @param chainId the numeric chain ID
         * @param name human-readable chain name
         * @param v1Name v1 network name (e.g. "base", "optimism")
         * @param caip2 CAIP-2 identifier (e.g. "eip155:8453")
         * @param rpcUrl default RPC endpoint URL
         * @param blockExplorerUrl block explorer URL
         * @param usdcAddress USDC token contract address
         * @param safeTransactionServiceUrl Safe transaction service URL, or null
         * @param testnet whether this is a testnet
         */
        public ChainInfo(int chainId, String name, String v1Name, String caip2,
                         String rpcUrl, String blockExplorerUrl, String usdcAddress,
                         String safeTransactionServiceUrl, boolean testnet) {
            this.chainId = chainId;
            this.name = name;
            this.v1Name = v1Name;
            this.caip2 = caip2;
            this.rpcUrl = rpcUrl;
            this.blockExplorerUrl = blockExplorerUrl;
            this.usdcAddress = usdcAddress;
            this.safeTransactionServiceUrl = safeTransactionServiceUrl;
            this.testnet = testnet;
        }
    }

    /** Supported chains indexed by chain ID. */
    public static final Map<Integer, ChainInfo> SUPPORTED_CHAINS;

    /** V1 name index for reverse lookup. */
    private static final Map<String, ChainInfo> V1_NAME_INDEX;

    static {
        Map<Integer, ChainInfo> chains = new HashMap<>();

        chains.put(8453, new ChainInfo(
                8453, "Base", "base", "eip155:8453",
                "https://mainnet.base.org", "https://basescan.org",
                "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
                "https://safe-transaction-base.safe.global", false));

        chains.put(84532, new ChainInfo(
                84532, "Base Sepolia", "base-sepolia", "eip155:84532",
                "https://sepolia.base.org", "https://sepolia.basescan.org",
                "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
                "https://safe-transaction-base-sepolia.safe.global", true));

        chains.put(10, new ChainInfo(
                10, "Optimism", "optimism", "eip155:10",
                "https://mainnet.optimism.io", "https://optimistic.etherscan.io",
                "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
                "https://safe-transaction-optimism.safe.global", false));

        chains.put(11155420, new ChainInfo(
                11155420, "Optimism Sepolia", "optimism-sepolia", "eip155:11155420",
                "https://sepolia.optimism.io", "https://sepolia-optimistic.etherscan.io",
                "0x5fd84259d66Cd46123540766Be93DFE6D43130D7",
                null, true));

        chains.put(42161, new ChainInfo(
                42161, "Arbitrum One", "arbitrum", "eip155:42161",
                "https://arb1.arbitrum.io/rpc", "https://arbiscan.io",
                "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
                "https://safe-transaction-arbitrum.safe.global", false));

        chains.put(421614, new ChainInfo(
                421614, "Arbitrum Sepolia", "arbitrum-sepolia", "eip155:421614",
                "https://sepolia-rollup.arbitrum.io/rpc", "https://sepolia.arbiscan.io",
                "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
                null, true));

        SUPPORTED_CHAINS = Collections.unmodifiableMap(chains);

        Map<String, ChainInfo> nameIndex = new HashMap<>();
        for (ChainInfo chain : chains.values()) {
            nameIndex.put(chain.v1Name, chain);
        }
        V1_NAME_INDEX = Collections.unmodifiableMap(nameIndex);
    }

    /**
     * Get chain info by chain ID.
     *
     * @param chainId the numeric chain ID
     * @return the chain info, or null if not found
     */
    public static ChainInfo getByChainId(int chainId) {
        return SUPPORTED_CHAINS.get(chainId);
    }

    /**
     * Check if a chain ID is supported.
     *
     * @param chainId the numeric chain ID
     * @return true if the chain is supported
     */
    public static boolean isSupported(int chainId) {
        return SUPPORTED_CHAINS.containsKey(chainId);
    }

    /**
     * Get chain info by v1 name.
     *
     * @param v1Name the v1 network name (e.g., "base", "optimism")
     * @return the chain info, or null if not found
     */
    public static ChainInfo getByV1Name(String v1Name) {
        return V1_NAME_INDEX.get(v1Name);
    }

    /**
     * Resolve a network input to a numeric chain ID.
     * Handles CAIP-2 format, v1 names, and numeric strings.
     *
     * @param network the network identifier
     * @return the numeric chain ID
     * @throws IllegalArgumentException if the network cannot be resolved
     */
    public static int resolveChainId(String network) {
        if (network == null || network.isEmpty()) {
            throw new IllegalArgumentException("Network identifier cannot be null or empty");
        }

        // Try CAIP-2 format
        if (network.startsWith("eip155:")) {
            String chainIdStr = network.substring(7);
            try {
                return Integer.parseInt(chainIdStr);
            } catch (NumberFormatException e) {
                throw new IllegalArgumentException("Invalid CAIP-2 chain ID: " + network);
            }
        }

        // Try v1 name
        ChainInfo chain = V1_NAME_INDEX.get(network);
        if (chain != null) {
            return chain.chainId;
        }

        // Try numeric
        try {
            return Integer.parseInt(network);
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException(
                    "Unknown network: " + network + ". Expected CAIP-2 (eip155:chainId), a known v1 name, or a numeric chain ID.");
        }
    }
}
