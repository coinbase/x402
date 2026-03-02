package com.coinbase.x402.model;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class Erc4337ErrorParserTest {

    @Test
    void parsesKnownAAError() {
        Erc4337ErrorParser.AAError err = Erc4337ErrorParser.parseAAError(
                "execution reverted: AA21 insufficient funds");
        assertNotNull(err);
        assertEquals("AA21", err.code);
        assertEquals("Insufficient funds for gas prefund", err.reason);
    }

    @Test
    void parsesAA24SignatureError() {
        Erc4337ErrorParser.AAError err = Erc4337ErrorParser.parseAAError(
                "AA24 signature mismatch");
        assertNotNull(err);
        assertEquals("AA24", err.code);
        assertEquals("Signature validation failed", err.reason);
    }

    @Test
    void parsesAA31PaymasterError() {
        Erc4337ErrorParser.AAError err = Erc4337ErrorParser.parseAAError(
                "FailedOp: AA31");
        assertNotNull(err);
        assertEquals("AA31", err.code);
        assertEquals("Paymaster deposit too low", err.reason);
    }

    @Test
    void parsesUnknownAACode() {
        Erc4337ErrorParser.AAError err = Erc4337ErrorParser.parseAAError(
                "error AA99 unknown");
        assertNotNull(err);
        assertEquals("AA99", err.code);
        assertEquals("Unknown AA error", err.reason);
    }

    @Test
    void returnsNullForNull() {
        assertNull(Erc4337ErrorParser.parseAAError(null));
    }

    @Test
    void returnsNullForEmpty() {
        assertNull(Erc4337ErrorParser.parseAAError(""));
    }

    @Test
    void returnsNullForNoAACode() {
        assertNull(Erc4337ErrorParser.parseAAError("execution reverted: insufficient funds"));
    }

    @Test
    void returnsNullForPartialMatch() {
        // "AA" without two digits should not match
        assertNull(Erc4337ErrorParser.parseAAError("error AA happened"));
    }

    @Test
    void findsFirstAACodeInMultipleMatches() {
        Erc4337ErrorParser.AAError err = Erc4337ErrorParser.parseAAError(
                "AA21 then AA24");
        assertNotNull(err);
        assertEquals("AA21", err.code);
    }

    @Test
    void handlesAACodeInMiddleOfText() {
        Erc4337ErrorParser.AAError err = Erc4337ErrorParser.parseAAError(
                "UserOperation reverted during simulation with reason: AA25");
        assertNotNull(err);
        assertEquals("AA25", err.code);
        assertEquals("Nonce validation failed", err.reason);
    }
}
