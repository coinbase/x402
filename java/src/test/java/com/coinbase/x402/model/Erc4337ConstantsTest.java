package com.coinbase.x402.model;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class Erc4337ConstantsTest {

    /* -------- address constants are valid hex -------------------------------- */

    private static final List<String> ALL_ADDRESSES = List.of(
            Erc4337Constants.ENTRY_POINT_07_ADDRESS,
            Erc4337Constants.SAFE_4337_MODULE_ADDRESS,
            Erc4337Constants.SAFE_WEBAUTHN_SHARED_SIGNER,
            Erc4337Constants.FCL_P256_VERIFIER,
            Erc4337Constants.P256_OWNER_FACTORY,
            Erc4337Constants.WEBAUTHN_SIGNER_FACTORY
    );

    @Test
    void allAddressConstantsAreValidHex() {
        for (String address : ALL_ADDRESSES) {
            assertNotNull(address, "Address constant should not be null");
            assertEquals(42, address.length(),
                    "Address should be 42 characters (0x + 40 hex digits): " + address);
            assertTrue(address.startsWith("0x"),
                    "Address should start with 0x: " + address);
            assertTrue(address.substring(2).matches("[0-9a-fA-F]{40}"),
                    "Address should contain only hex digits after 0x: " + address);
        }
    }

    @Test
    void entryPointAddressIsValid() {
        assertEquals(42, Erc4337Constants.ENTRY_POINT_07_ADDRESS.length());
        assertTrue(Erc4337Constants.ENTRY_POINT_07_ADDRESS.startsWith("0x"));
    }

    @Test
    void safeModuleAddressIsValid() {
        assertEquals(42, Erc4337Constants.SAFE_4337_MODULE_ADDRESS.length());
        assertTrue(Erc4337Constants.SAFE_4337_MODULE_ADDRESS.startsWith("0x"));
    }

    @Test
    void webAuthnSharedSignerAddressIsValid() {
        assertEquals(42, Erc4337Constants.SAFE_WEBAUTHN_SHARED_SIGNER.length());
        assertTrue(Erc4337Constants.SAFE_WEBAUTHN_SHARED_SIGNER.startsWith("0x"));
    }

    @Test
    void fclP256VerifierAddressIsValid() {
        assertEquals(42, Erc4337Constants.FCL_P256_VERIFIER.length());
        assertTrue(Erc4337Constants.FCL_P256_VERIFIER.startsWith("0x"));
    }

    @Test
    void p256OwnerFactoryAddressIsValid() {
        assertEquals(42, Erc4337Constants.P256_OWNER_FACTORY.length());
        assertTrue(Erc4337Constants.P256_OWNER_FACTORY.startsWith("0x"));
    }

    @Test
    void webAuthnSignerFactoryAddressIsValid() {
        assertEquals(42, Erc4337Constants.WEBAUTHN_SIGNER_FACTORY.length());
        assertTrue(Erc4337Constants.WEBAUTHN_SIGNER_FACTORY.startsWith("0x"));
    }

    /* -------- AA_ERROR_MESSAGES ---------------------------------------------- */

    @Test
    void aaErrorMessagesIsNonNull() {
        assertNotNull(Erc4337Constants.AA_ERROR_MESSAGES);
    }

    @Test
    void aaErrorMessagesIsUnmodifiable() {
        assertThrows(UnsupportedOperationException.class, () ->
                Erc4337Constants.AA_ERROR_MESSAGES.put("AA99", "should fail"));
    }

    @Test
    void aaErrorMessagesHasExpectedEntryCount() {
        assertEquals(20, Erc4337Constants.AA_ERROR_MESSAGES.size());
    }

    @Test
    void allExpectedAACodesArePresent() {
        List<String> expectedCodes = List.of(
                "AA10", "AA13", "AA14", "AA15",
                "AA20", "AA21", "AA22", "AA23", "AA24", "AA25", "AA26",
                "AA30", "AA31", "AA32", "AA33", "AA34",
                "AA40", "AA41",
                "AA50", "AA51"
        );

        for (String code : expectedCodes) {
            assertTrue(Erc4337Constants.AA_ERROR_MESSAGES.containsKey(code),
                    "AA_ERROR_MESSAGES should contain code: " + code);
            String message = Erc4337Constants.AA_ERROR_MESSAGES.get(code);
            assertNotNull(message, "Message for " + code + " should not be null");
            assertFalse(message.isEmpty(), "Message for " + code + " should not be empty");
        }
    }

    @Test
    void aa10MessageIsCorrect() {
        assertEquals("Sender already constructed", Erc4337Constants.AA_ERROR_MESSAGES.get("AA10"));
    }

    @Test
    void aa21MessageIsCorrect() {
        assertEquals("Insufficient funds for gas prefund", Erc4337Constants.AA_ERROR_MESSAGES.get("AA21"));
    }

    @Test
    void aa24MessageIsCorrect() {
        assertEquals("Signature validation failed", Erc4337Constants.AA_ERROR_MESSAGES.get("AA24"));
    }

    @Test
    void aa51MessageIsCorrect() {
        assertEquals("Prefund below actualGasCost", Erc4337Constants.AA_ERROR_MESSAGES.get("AA51"));
    }

    @Test
    void allMessagesAreNonEmpty() {
        for (Map.Entry<String, String> entry : Erc4337Constants.AA_ERROR_MESSAGES.entrySet()) {
            assertNotNull(entry.getValue(), "Message for " + entry.getKey() + " should not be null");
            assertFalse(entry.getValue().isEmpty(),
                    "Message for " + entry.getKey() + " should not be empty");
        }
    }
}
