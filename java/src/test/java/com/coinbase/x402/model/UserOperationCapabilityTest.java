package com.coinbase.x402.model;

import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class UserOperationCapabilityTest {

    @Test
    void extractReturnsCapabilityWhenPresent() {
        Map<String, Object> userOp = new HashMap<>();
        userOp.put("supported", true);
        userOp.put("bundlerUrl", "https://bundler.example.com");
        userOp.put("paymaster", "0xPaymaster");
        userOp.put("entrypoint", "0xEntryPoint");

        Map<String, Object> extra = Map.of("userOperation", userOp);

        UserOperationCapability cap = UserOperationCapability.extract(extra);

        assertNotNull(cap);
        assertTrue(cap.supported);
        assertEquals("https://bundler.example.com", cap.bundlerUrl);
        assertEquals("0xPaymaster", cap.paymaster);
        assertEquals("0xEntryPoint", cap.entrypoint);
    }

    @Test
    void extractReturnsNullWhenExtraIsNull() {
        assertNull(UserOperationCapability.extract(null));
    }

    @Test
    void extractReturnsNullWhenUserOperationMissing() {
        Map<String, Object> extra = Map.of("otherKey", "value");

        assertNull(UserOperationCapability.extract(extra));
    }

    @Test
    void extractReturnsNullWhenUserOperationNotMap() {
        Map<String, Object> extra = Map.of("userOperation", "not-a-map");

        assertNull(UserOperationCapability.extract(extra));
    }

    @Test
    void extractReturnsNullWhenSupportedIsFalse() {
        Map<String, Object> userOp = new HashMap<>();
        userOp.put("supported", false);
        userOp.put("bundlerUrl", "https://bundler.example.com");

        Map<String, Object> extra = Map.of("userOperation", userOp);

        assertNull(UserOperationCapability.extract(extra));
    }

    @Test
    void extractReturnsNullWhenSupportedMissing() {
        Map<String, Object> userOp = new HashMap<>();
        userOp.put("bundlerUrl", "https://bundler.example.com");

        Map<String, Object> extra = Map.of("userOperation", userOp);

        assertNull(UserOperationCapability.extract(extra));
    }

    @Test
    void extractWithMinimalFields() {
        Map<String, Object> userOp = new HashMap<>();
        userOp.put("supported", true);

        Map<String, Object> extra = Map.of("userOperation", userOp);

        UserOperationCapability cap = UserOperationCapability.extract(extra);

        assertNotNull(cap);
        assertTrue(cap.supported);
        assertNull(cap.bundlerUrl);
        assertNull(cap.paymaster);
        assertNull(cap.entrypoint);
    }

    @Test
    void extractIgnoresNonStringFields() {
        Map<String, Object> userOp = new HashMap<>();
        userOp.put("supported", true);
        userOp.put("bundlerUrl", 12345);    // not a String
        userOp.put("paymaster", true);       // not a String
        userOp.put("entrypoint", Map.of());  // not a String

        Map<String, Object> extra = Map.of("userOperation", userOp);

        UserOperationCapability cap = UserOperationCapability.extract(extra);

        assertNotNull(cap);
        assertTrue(cap.supported);
        assertNull(cap.bundlerUrl);
        assertNull(cap.paymaster);
        assertNull(cap.entrypoint);
    }

    /* -------- supported as String "true" instead of Boolean ---------------- */

    @Test
    void extractReturnsNullWhenSupportedIsStringTrue() {
        Map<String, Object> userOp = new HashMap<>();
        userOp.put("supported", "true"); // String, not Boolean
        userOp.put("bundlerUrl", "https://bundler.example.com");

        Map<String, Object> extra = Map.of("userOperation", userOp);

        assertNull(UserOperationCapability.extract(extra));
    }

    /* -------- supported as Integer 1 --------------------------------------- */

    @Test
    void extractReturnsNullWhenSupportedIsInteger() {
        Map<String, Object> userOp = new HashMap<>();
        userOp.put("supported", 1); // Integer, not Boolean
        userOp.put("bundlerUrl", "https://bundler.example.com");

        Map<String, Object> extra = Map.of("userOperation", userOp);

        assertNull(UserOperationCapability.extract(extra));
    }

    /* -------- explicit null userOperation value returns null --------------- */

    @Test
    void extractReturnsNullWhenUserOperationIsExplicitlyNull() {
        Map<String, Object> extra = new HashMap<>();
        extra.put("userOperation", null);

        assertNull(UserOperationCapability.extract(extra));
    }

    /* -------- empty extra map returns null ---------------------------------- */

    @Test
    void extractReturnsNullForEmptyExtraMap() {
        Map<String, Object> extra = new HashMap<>();

        assertNull(UserOperationCapability.extract(extra));
    }
}
