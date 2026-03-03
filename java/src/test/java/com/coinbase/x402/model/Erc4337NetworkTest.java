package com.coinbase.x402.model;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class Erc4337NetworkTest {

    /* -------- getByChainId -------------------------------------------------- */

    @Test
    void getByChainIdReturnsBase() {
        Erc4337Network.ChainInfo chain = Erc4337Network.getByChainId(8453);
        assertNotNull(chain);
        assertEquals(8453, chain.chainId);
        assertEquals("Base", chain.name);
        assertEquals("base", chain.v1Name);
        assertEquals("eip155:8453", chain.caip2);
        assertFalse(chain.testnet);
        assertNotNull(chain.usdcAddress);
    }

    @Test
    void getByChainIdReturnsBaseSepolia() {
        Erc4337Network.ChainInfo chain = Erc4337Network.getByChainId(84532);
        assertNotNull(chain);
        assertEquals(84532, chain.chainId);
        assertEquals("Base Sepolia", chain.name);
        assertEquals("base-sepolia", chain.v1Name);
        assertTrue(chain.testnet);
    }

    @Test
    void getByChainIdReturnsOptimism() {
        Erc4337Network.ChainInfo chain = Erc4337Network.getByChainId(10);
        assertNotNull(chain);
        assertEquals("Optimism", chain.name);
        assertEquals("optimism", chain.v1Name);
        assertFalse(chain.testnet);
    }

    @Test
    void getByChainIdReturnsOptimismSepolia() {
        Erc4337Network.ChainInfo chain = Erc4337Network.getByChainId(11155420);
        assertNotNull(chain);
        assertEquals("Optimism Sepolia", chain.name);
        assertTrue(chain.testnet);
    }

    @Test
    void getByChainIdReturnsArbitrumOne() {
        Erc4337Network.ChainInfo chain = Erc4337Network.getByChainId(42161);
        assertNotNull(chain);
        assertEquals("Arbitrum One", chain.name);
        assertEquals("arbitrum", chain.v1Name);
        assertFalse(chain.testnet);
    }

    @Test
    void getByChainIdReturnsArbitrumSepolia() {
        Erc4337Network.ChainInfo chain = Erc4337Network.getByChainId(421614);
        assertNotNull(chain);
        assertEquals("Arbitrum Sepolia", chain.name);
        assertTrue(chain.testnet);
    }

    @Test
    void getByChainIdReturnsNullForUnknown() {
        assertNull(Erc4337Network.getByChainId(999999));
    }

    /* -------- isSupported --------------------------------------------------- */

    @Test
    void isSupportedReturnsTrueForKnownChain() {
        assertTrue(Erc4337Network.isSupported(8453));
        assertTrue(Erc4337Network.isSupported(84532));
        assertTrue(Erc4337Network.isSupported(10));
        assertTrue(Erc4337Network.isSupported(42161));
    }

    @Test
    void isSupportedReturnsFalseForUnknownChain() {
        assertFalse(Erc4337Network.isSupported(999999));
        assertFalse(Erc4337Network.isSupported(0));
        assertFalse(Erc4337Network.isSupported(-1));
    }

    /* -------- getByV1Name --------------------------------------------------- */

    @Test
    void getByV1NameReturnsCorrectChain() {
        Erc4337Network.ChainInfo chain = Erc4337Network.getByV1Name("base");
        assertNotNull(chain);
        assertEquals(8453, chain.chainId);

        chain = Erc4337Network.getByV1Name("base-sepolia");
        assertNotNull(chain);
        assertEquals(84532, chain.chainId);

        chain = Erc4337Network.getByV1Name("optimism");
        assertNotNull(chain);
        assertEquals(10, chain.chainId);

        chain = Erc4337Network.getByV1Name("arbitrum");
        assertNotNull(chain);
        assertEquals(42161, chain.chainId);
    }

    @Test
    void getByV1NameReturnsOptimismSepolia() {
        Erc4337Network.ChainInfo chain = Erc4337Network.getByV1Name("optimism-sepolia");
        assertNotNull(chain);
        assertEquals(11155420, chain.chainId);
        assertEquals("Optimism Sepolia", chain.name);
        assertTrue(chain.testnet);
    }

    @Test
    void getByV1NameReturnsArbitrumSepolia() {
        Erc4337Network.ChainInfo chain = Erc4337Network.getByV1Name("arbitrum-sepolia");
        assertNotNull(chain);
        assertEquals(421614, chain.chainId);
        assertEquals("Arbitrum Sepolia", chain.name);
        assertTrue(chain.testnet);
    }

    @Test
    void getByV1NameReturnsNullForUnknown() {
        assertNull(Erc4337Network.getByV1Name("unknown-network"));
        assertNull(Erc4337Network.getByV1Name(""));
    }

    /* -------- resolveChainId ------------------------------------------------ */

    @Test
    void resolveChainIdFromCaip2() {
        assertEquals(8453, Erc4337Network.resolveChainId("eip155:8453"));
        assertEquals(84532, Erc4337Network.resolveChainId("eip155:84532"));
        assertEquals(10, Erc4337Network.resolveChainId("eip155:10"));
    }

    @Test
    void resolveChainIdFromV1Name() {
        assertEquals(8453, Erc4337Network.resolveChainId("base"));
        assertEquals(84532, Erc4337Network.resolveChainId("base-sepolia"));
        assertEquals(10, Erc4337Network.resolveChainId("optimism"));
        assertEquals(42161, Erc4337Network.resolveChainId("arbitrum"));
    }

    @Test
    void resolveChainIdFromNumericString() {
        assertEquals(8453, Erc4337Network.resolveChainId("8453"));
        assertEquals(1, Erc4337Network.resolveChainId("1"));
    }

    @Test
    void resolveChainIdThrowsForNull() {
        assertThrows(IllegalArgumentException.class, () ->
                Erc4337Network.resolveChainId(null));
    }

    @Test
    void resolveChainIdThrowsForEmpty() {
        assertThrows(IllegalArgumentException.class, () ->
                Erc4337Network.resolveChainId(""));
    }

    @Test
    void resolveChainIdThrowsForUnknownName() {
        assertThrows(IllegalArgumentException.class, () ->
                Erc4337Network.resolveChainId("unknown-network"));
    }

    @Test
    void resolveChainIdThrowsForInvalidCaip2() {
        assertThrows(IllegalArgumentException.class, () ->
                Erc4337Network.resolveChainId("eip155:notanumber"));
    }

    /* -------- USDC addresses are set ---------------------------------------- */

    @Test
    void allChainsHaveUsdcAddress() {
        for (Erc4337Network.ChainInfo chain : Erc4337Network.SUPPORTED_CHAINS.values()) {
            assertNotNull(chain.usdcAddress,
                    "Chain " + chain.name + " should have a USDC address");
            assertTrue(chain.usdcAddress.startsWith("0x"),
                    "USDC address for " + chain.name + " should start with 0x");
        }
    }

    @Test
    void sixChainsAreSupported() {
        assertEquals(6, Erc4337Network.SUPPORTED_CHAINS.size());
    }

    /* -------- getByV1Name(null) returns null -------------------------------- */

    @Test
    void getByV1NameReturnsNullForNull() {
        assertNull(Erc4337Network.getByV1Name(null));
    }

    /* -------- SUPPORTED_CHAINS unmodifiability ------------------------------ */

    @Test
    void supportedChainsIsUnmodifiable() {
        assertThrows(UnsupportedOperationException.class, () ->
                Erc4337Network.SUPPORTED_CHAINS.put(1, new Erc4337Network.ChainInfo(
                        1, "Ethereum", "ethereum", "eip155:1",
                        "https://mainnet.infura.io", "https://etherscan.io",
                        "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
                        null, false)));
    }

    /* -------- safeTransactionServiceUrl: null for testnets, non-null for mainnets */

    @Test
    void safeTransactionServiceUrlNullForOptimismSepolia() {
        Erc4337Network.ChainInfo chain = Erc4337Network.getByChainId(11155420);
        assertNotNull(chain);
        assertNull(chain.safeTransactionServiceUrl,
                "Optimism Sepolia should have null safeTransactionServiceUrl");
    }

    @Test
    void safeTransactionServiceUrlNullForArbitrumSepolia() {
        Erc4337Network.ChainInfo chain = Erc4337Network.getByChainId(421614);
        assertNotNull(chain);
        assertNull(chain.safeTransactionServiceUrl,
                "Arbitrum Sepolia should have null safeTransactionServiceUrl");
    }

    @Test
    void safeTransactionServiceUrlNonNullForMainnets() {
        // Base mainnet
        Erc4337Network.ChainInfo base = Erc4337Network.getByChainId(8453);
        assertNotNull(base);
        assertNotNull(base.safeTransactionServiceUrl,
                "Base mainnet should have non-null safeTransactionServiceUrl");

        // Optimism mainnet
        Erc4337Network.ChainInfo optimism = Erc4337Network.getByChainId(10);
        assertNotNull(optimism);
        assertNotNull(optimism.safeTransactionServiceUrl,
                "Optimism mainnet should have non-null safeTransactionServiceUrl");

        // Arbitrum mainnet
        Erc4337Network.ChainInfo arbitrum = Erc4337Network.getByChainId(42161);
        assertNotNull(arbitrum);
        assertNotNull(arbitrum.safeTransactionServiceUrl,
                "Arbitrum mainnet should have non-null safeTransactionServiceUrl");
    }

    /* -------- rpcUrl and blockExplorerUrl non-null/non-empty for all chains - */

    @Test
    void allChainsHaveNonEmptyRpcUrl() {
        for (Erc4337Network.ChainInfo chain : Erc4337Network.SUPPORTED_CHAINS.values()) {
            assertNotNull(chain.rpcUrl,
                    "Chain " + chain.name + " should have a non-null rpcUrl");
            assertFalse(chain.rpcUrl.isEmpty(),
                    "Chain " + chain.name + " should have a non-empty rpcUrl");
        }
    }

    /* -------- caip2 field verification for all chains ----------------------- */

    @Test
    void baseCaip2IsCorrect() {
        assertEquals("eip155:8453", Erc4337Network.getByChainId(8453).caip2);
    }

    @Test
    void baseSepoliaCaip2IsCorrect() {
        assertEquals("eip155:84532", Erc4337Network.getByChainId(84532).caip2);
    }

    @Test
    void optimismCaip2IsCorrect() {
        assertEquals("eip155:10", Erc4337Network.getByChainId(10).caip2);
    }

    @Test
    void optimismSepoliaCaip2IsCorrect() {
        assertEquals("eip155:11155420", Erc4337Network.getByChainId(11155420).caip2);
    }

    @Test
    void arbitrumOneCaip2IsCorrect() {
        assertEquals("eip155:42161", Erc4337Network.getByChainId(42161).caip2);
    }

    @Test
    void arbitrumSepoliaCaip2IsCorrect() {
        assertEquals("eip155:421614", Erc4337Network.getByChainId(421614).caip2);
    }

    /* -------- safeTransactionServiceUrl for Base Sepolia ------------------- */

    @Test
    void safeTransactionServiceUrlNonNullForBaseSepolia() {
        Erc4337Network.ChainInfo chain = Erc4337Network.getByChainId(84532);
        assertNotNull(chain);
        assertNotNull(chain.safeTransactionServiceUrl,
                "Base Sepolia should have non-null safeTransactionServiceUrl");
        assertTrue(chain.safeTransactionServiceUrl.contains("safe"),
                "Base Sepolia safeTransactionServiceUrl should contain 'safe'");
    }

    @Test
    void allChainsHaveNonEmptyBlockExplorerUrl() {
        for (Erc4337Network.ChainInfo chain : Erc4337Network.SUPPORTED_CHAINS.values()) {
            assertNotNull(chain.blockExplorerUrl,
                    "Chain " + chain.name + " should have a non-null blockExplorerUrl");
            assertFalse(chain.blockExplorerUrl.isEmpty(),
                    "Chain " + chain.name + " should have a non-empty blockExplorerUrl");
        }
    }
}
