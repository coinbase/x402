package com.coinbase.x402.model;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

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

    /* -------- AA code at the very start of string --------------------------- */

    @Test
    void parsesAACodeAtStartOfString() {
        Erc4337ErrorParser.AAError err = Erc4337ErrorParser.parseAAError("AA10 sender already constructed");
        assertNotNull(err);
        assertEquals("AA10", err.code);
        assertEquals("Sender already constructed", err.reason);
    }

    /* -------- parameterized test covering additional AA codes --------------- */

    @ParameterizedTest
    @CsvSource({
            "AA13, InitCode failed or OOG",
            "AA14, InitCode must return sender",
            "AA15, InitCode must create sender",
            "AA20, Account not deployed",
            "AA22, Expired or not due",
            "AA23, Reverted (or OOG)",
            "AA26, Account accessed global state",
            "AA30, Paymaster not deployed",
            "AA32, Paymaster expired or not due",
            "AA33, Paymaster reverted (or OOG)",
            "AA34, Paymaster context reverted",
            "AA40, Over verification gas limit",
            "AA41, Over max fee per gas",
            "AA50, Over max priority fee per gas",
            "AA51, Prefund below actualGasCost"
    })
    void parsesAdditionalAACodes(String code, String expectedReason) {
        Erc4337ErrorParser.AAError err = Erc4337ErrorParser.parseAAError(
                "error " + code + " occurred");
        assertNotNull(err, "Should parse AA code: " + code);
        assertEquals(code, err.code);
        assertEquals(expectedReason, err.reason);
    }
}
