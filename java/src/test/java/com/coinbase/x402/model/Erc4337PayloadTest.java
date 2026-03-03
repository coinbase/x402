package com.coinbase.x402.model;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class Erc4337PayloadTest {

    /* -------- isErc4337Payload ---------------------------------------------- */

    @Test
    void isErc4337PayloadReturnsTrueForValidPayload() {
        Map<String, Object> payload = new HashMap<>();
        payload.put("userOperation", Map.of("sender", "0xAbc", "nonce", "0x1"));
        payload.put("entryPoint", "0x0000000071727De22E5E9d8BAf0edAc6f37da032");

        assertTrue(Erc4337Payload.isErc4337Payload(payload));
    }

    @Test
    void isErc4337PayloadReturnsFalseForNull() {
        assertFalse(Erc4337Payload.isErc4337Payload(null));
    }

    @Test
    void isErc4337PayloadReturnsFalseWithoutUserOperation() {
        Map<String, Object> payload = Map.of(
                "entryPoint", "0x0000000071727De22E5E9d8BAf0edAc6f37da032"
        );
        assertFalse(Erc4337Payload.isErc4337Payload(payload));
    }

    @Test
    void isErc4337PayloadReturnsFalseWithoutEntryPoint() {
        Map<String, Object> payload = new HashMap<>();
        payload.put("userOperation", Map.of("sender", "0xAbc"));
        assertFalse(Erc4337Payload.isErc4337Payload(payload));
    }

    @Test
    void isErc4337PayloadReturnsFalseWhenUserOperationIsNotMap() {
        Map<String, Object> payload = new HashMap<>();
        payload.put("userOperation", "not-a-map");
        payload.put("entryPoint", "0x0000000071727De22E5E9d8BAf0edAc6f37da032");
        assertFalse(Erc4337Payload.isErc4337Payload(payload));
    }

    @Test
    void isErc4337PayloadReturnsFalseForEip3009Payload() {
        Map<String, Object> payload = Map.of(
                "authorization", Map.of("from", "0xAbc"),
                "signature", "0x123"
        );
        assertFalse(Erc4337Payload.isErc4337Payload(payload));
    }

    /* -------- fromMap ------------------------------------------------------- */

    @Test
    void fromMapConvertsValidPayload() {
        Map<String, Object> userOp = new HashMap<>();
        userOp.put("sender", "0xSender");
        userOp.put("nonce", "0x1");
        userOp.put("callData", "0xabcdef");
        userOp.put("callGasLimit", "0x5208");
        userOp.put("verificationGasLimit", "0x10000");
        userOp.put("preVerificationGas", "0x5208");
        userOp.put("maxFeePerGas", "0x3B9ACA00");
        userOp.put("maxPriorityFeePerGas", "0x3B9ACA00");
        userOp.put("signature", "0xSig");

        Map<String, Object> payload = new HashMap<>();
        payload.put("type", "erc4337");
        payload.put("entryPoint", "0x0000000071727De22E5E9d8BAf0edAc6f37da032");
        payload.put("userOperation", userOp);

        Erc4337Payload result = Erc4337Payload.fromMap(payload);

        assertEquals("erc4337", result.type);
        assertEquals("0x0000000071727De22E5E9d8BAf0edAc6f37da032", result.entryPoint);
        assertNotNull(result.userOperation);
        assertEquals("0xSender", result.userOperation.sender);
        assertEquals("0x1", result.userOperation.nonce);
        assertEquals("0xabcdef", result.userOperation.callData);
        assertEquals("0xSig", result.userOperation.signature);
    }

    @Test
    void fromMapWithOptionalFields() {
        Map<String, Object> userOp = new HashMap<>();
        userOp.put("sender", "0xSender");
        userOp.put("nonce", "0x1");
        userOp.put("callData", "0xabcdef");
        userOp.put("callGasLimit", "0x5208");
        userOp.put("verificationGasLimit", "0x10000");
        userOp.put("preVerificationGas", "0x5208");
        userOp.put("maxFeePerGas", "0x3B9ACA00");
        userOp.put("maxPriorityFeePerGas", "0x3B9ACA00");
        userOp.put("signature", "0xSig");
        // Optional fields
        userOp.put("factory", "0xFactory");
        userOp.put("factoryData", "0xFactoryData");
        userOp.put("paymaster", "0xPaymaster");
        userOp.put("paymasterData", "0xPmData");
        userOp.put("paymasterVerificationGasLimit", "0x5000");
        userOp.put("paymasterPostOpGasLimit", "0x3000");

        Map<String, Object> payload = new HashMap<>();
        payload.put("type", "erc4337");
        payload.put("entryPoint", "0x0000000071727De22E5E9d8BAf0edAc6f37da032");
        payload.put("bundlerRpcUrl", "https://bundler.example.com");
        payload.put("userOperation", userOp);

        Erc4337Payload result = Erc4337Payload.fromMap(payload);

        assertEquals("https://bundler.example.com", result.bundlerRpcUrl);
        assertEquals("0xFactory", result.userOperation.factory);
        assertEquals("0xFactoryData", result.userOperation.factoryData);
        assertEquals("0xPaymaster", result.userOperation.paymaster);
        assertEquals("0xPmData", result.userOperation.paymasterData);
        assertEquals("0x5000", result.userOperation.paymasterVerificationGasLimit);
        assertEquals("0x3000", result.userOperation.paymasterPostOpGasLimit);
    }

    @Test
    void fromMapWithMissingUserOperationFieldsHasNulls() {
        Map<String, Object> userOp = new HashMap<>();
        userOp.put("sender", "0xSender");
        // Only sender — other fields are null

        Map<String, Object> payload = new HashMap<>();
        payload.put("entryPoint", "0xEntryPoint");
        payload.put("userOperation", userOp);

        Erc4337Payload result = Erc4337Payload.fromMap(payload);

        assertNotNull(result.userOperation);
        assertEquals("0xSender", result.userOperation.sender);
        assertNull(result.userOperation.nonce);
        assertNull(result.userOperation.callData);
        assertNull(result.userOperation.factory);
        assertNull(result.type);
        assertNull(result.bundlerRpcUrl);
    }

    @Test
    void fromMapWithEmptyPayloadReturnsEmptyObject() {
        Map<String, Object> payload = new HashMap<>();

        Erc4337Payload result = Erc4337Payload.fromMap(payload);

        assertNull(result.type);
        assertNull(result.entryPoint);
        assertNull(result.userOperation);
    }

    /* -------- fromMap(null) behavior ---------------------------------------- */

    @Test
    void fromMapWithNullReturnsNull() {
        // Jackson's convertValue(null, ...) returns null without throwing
        assertNull(Erc4337Payload.fromMap(null));
    }

    /* -------- fromMap with unconvertible data ------------------------------- */

    @Test
    void fromMapWithUnconvertibleDataThrowsIllegalArgumentException() {
        Map<String, Object> payload = new HashMap<>();
        // userOperation should be a Map, not a String
        payload.put("userOperation", "not-a-map-of-fields");

        assertThrows(IllegalArgumentException.class, () ->
                Erc4337Payload.fromMap(payload));
    }

    /* -------- isErc4337Payload with explicit null value for userOperation --- */

    @Test
    void isErc4337PayloadReturnsFalseWhenUserOperationIsExplicitlyNull() {
        Map<String, Object> payload = new HashMap<>();
        payload.put("userOperation", null);
        payload.put("entryPoint", "0x0000000071727De22E5E9d8BAf0edAc6f37da032");

        assertFalse(Erc4337Payload.isErc4337Payload(payload));
    }

    /* -------- isErc4337Payload with List userOperation ---------------------- */

    @Test
    void isErc4337PayloadReturnsFalseWhenUserOperationIsList() {
        Map<String, Object> payload = new HashMap<>();
        payload.put("userOperation", new ArrayList<>(List.of("item1", "item2")));
        payload.put("entryPoint", "0x0000000071727De22E5E9d8BAf0edAc6f37da032");

        assertFalse(Erc4337Payload.isErc4337Payload(payload));
    }

    /* -------- isErc4337Payload with Integer userOperation ----------------- */

    @Test
    void isErc4337PayloadReturnsFalseWhenUserOperationIsInteger() {
        Map<String, Object> payload = new HashMap<>();
        payload.put("userOperation", 42);
        payload.put("entryPoint", "0x0000000071727De22E5E9d8BAf0edAc6f37da032");

        assertFalse(Erc4337Payload.isErc4337Payload(payload));
    }

    /* -------- isErc4337Payload with empty map ------------------------------- */

    @Test
    void isErc4337PayloadReturnsFalseForEmptyMap() {
        Map<String, Object> payload = new HashMap<>();

        assertFalse(Erc4337Payload.isErc4337Payload(payload));
    }
}
