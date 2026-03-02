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
}
