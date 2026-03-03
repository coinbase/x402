package com.coinbase.x402.model;

import com.coinbase.x402.util.Json;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class UserOperation07JsonTest {

    /* -------- round-trip serialization/deserialization ----------------------- */

    @Test
    void roundTripWithAllFields() throws Exception {
        UserOperation07Json original = new UserOperation07Json();
        original.sender = "0xSenderAddress";
        original.nonce = "0x1";
        original.factory = "0xFactory";
        original.factoryData = "0xFactoryData";
        original.callData = "0xCallData";
        original.callGasLimit = "0x5208";
        original.verificationGasLimit = "0x10000";
        original.preVerificationGas = "0x5208";
        original.maxFeePerGas = "0x3B9ACA00";
        original.maxPriorityFeePerGas = "0x3B9ACA00";
        original.paymaster = "0xPaymaster";
        original.paymasterData = "0xPmData";
        original.paymasterVerificationGasLimit = "0x5000";
        original.paymasterPostOpGasLimit = "0x3000";
        original.signature = "0xSignature";

        String json = Json.MAPPER.writeValueAsString(original);
        UserOperation07Json deserialized = Json.MAPPER.readValue(json, UserOperation07Json.class);

        assertEquals(original.sender, deserialized.sender);
        assertEquals(original.nonce, deserialized.nonce);
        assertEquals(original.factory, deserialized.factory);
        assertEquals(original.factoryData, deserialized.factoryData);
        assertEquals(original.callData, deserialized.callData);
        assertEquals(original.callGasLimit, deserialized.callGasLimit);
        assertEquals(original.verificationGasLimit, deserialized.verificationGasLimit);
        assertEquals(original.preVerificationGas, deserialized.preVerificationGas);
        assertEquals(original.maxFeePerGas, deserialized.maxFeePerGas);
        assertEquals(original.maxPriorityFeePerGas, deserialized.maxPriorityFeePerGas);
        assertEquals(original.paymaster, deserialized.paymaster);
        assertEquals(original.paymasterData, deserialized.paymasterData);
        assertEquals(original.paymasterVerificationGasLimit, deserialized.paymasterVerificationGasLimit);
        assertEquals(original.paymasterPostOpGasLimit, deserialized.paymasterPostOpGasLimit);
        assertEquals(original.signature, deserialized.signature);
    }

    @Test
    void roundTripWithMinimalFields() throws Exception {
        UserOperation07Json original = new UserOperation07Json();
        original.sender = "0xSender";
        original.nonce = "0x0";

        String json = Json.MAPPER.writeValueAsString(original);
        UserOperation07Json deserialized = Json.MAPPER.readValue(json, UserOperation07Json.class);

        assertEquals("0xSender", deserialized.sender);
        assertEquals("0x0", deserialized.nonce);
        assertNull(deserialized.factory);
        assertNull(deserialized.callData);
        assertNull(deserialized.paymaster);
        assertNull(deserialized.signature);
    }

    /* -------- @JsonInclude(NON_NULL) - null fields omitted ------------------- */

    @Test
    void nullFieldsAreOmittedInJson() throws Exception {
        UserOperation07Json op = new UserOperation07Json();
        op.sender = "0xSender";
        // All other fields are null

        String json = Json.MAPPER.writeValueAsString(op);

        assertTrue(json.contains("\"sender\""));
        assertFalse(json.contains("\"nonce\""), "null nonce should be omitted");
        assertFalse(json.contains("\"factory\""), "null factory should be omitted");
        assertFalse(json.contains("\"factoryData\""), "null factoryData should be omitted");
        assertFalse(json.contains("\"callData\""), "null callData should be omitted");
        assertFalse(json.contains("\"callGasLimit\""), "null callGasLimit should be omitted");
        assertFalse(json.contains("\"verificationGasLimit\""), "null verificationGasLimit should be omitted");
        assertFalse(json.contains("\"preVerificationGas\""), "null preVerificationGas should be omitted");
        assertFalse(json.contains("\"maxFeePerGas\""), "null maxFeePerGas should be omitted");
        assertFalse(json.contains("\"maxPriorityFeePerGas\""), "null maxPriorityFeePerGas should be omitted");
        assertFalse(json.contains("\"paymaster\""), "null paymaster should be omitted");
        assertFalse(json.contains("\"paymasterData\""), "null paymasterData should be omitted");
        assertFalse(json.contains("\"paymasterVerificationGasLimit\""),
                "null paymasterVerificationGasLimit should be omitted");
        assertFalse(json.contains("\"paymasterPostOpGasLimit\""),
                "null paymasterPostOpGasLimit should be omitted");
        assertFalse(json.contains("\"signature\""), "null signature should be omitted");
    }

    @Test
    void allNullFieldsProduceEmptyObject() throws Exception {
        UserOperation07Json op = new UserOperation07Json();

        String json = Json.MAPPER.writeValueAsString(op);
        assertEquals("{}", json);
    }

    /* -------- fields serialize with correct JSON names ----------------------- */

    @Test
    void allFieldsSerializeWithCorrectJsonNames() throws Exception {
        UserOperation07Json op = new UserOperation07Json();
        op.sender = "s";
        op.nonce = "n";
        op.factory = "f";
        op.factoryData = "fd";
        op.callData = "cd";
        op.callGasLimit = "cgl";
        op.verificationGasLimit = "vgl";
        op.preVerificationGas = "pvg";
        op.maxFeePerGas = "mfpg";
        op.maxPriorityFeePerGas = "mpfpg";
        op.paymaster = "pm";
        op.paymasterData = "pmd";
        op.paymasterVerificationGasLimit = "pmvgl";
        op.paymasterPostOpGasLimit = "pmpogl";
        op.signature = "sig";

        JsonNode node = Json.MAPPER.valueToTree(op);

        assertEquals("s", node.get("sender").asText());
        assertEquals("n", node.get("nonce").asText());
        assertEquals("f", node.get("factory").asText());
        assertEquals("fd", node.get("factoryData").asText());
        assertEquals("cd", node.get("callData").asText());
        assertEquals("cgl", node.get("callGasLimit").asText());
        assertEquals("vgl", node.get("verificationGasLimit").asText());
        assertEquals("pvg", node.get("preVerificationGas").asText());
        assertEquals("mfpg", node.get("maxFeePerGas").asText());
        assertEquals("mpfpg", node.get("maxPriorityFeePerGas").asText());
        assertEquals("pm", node.get("paymaster").asText());
        assertEquals("pmd", node.get("paymasterData").asText());
        assertEquals("pmvgl", node.get("paymasterVerificationGasLimit").asText());
        assertEquals("pmpogl", node.get("paymasterPostOpGasLimit").asText());
        assertEquals("sig", node.get("signature").asText());

        // Exactly 15 fields
        assertEquals(15, node.size());
    }

    /* -------- deserialization with unknown properties ------------------------ */

    @Test
    void deserializationIgnoresUnknownProperties() throws Exception {
        String json = "{\"sender\":\"0xAbc\",\"unknownField\":\"ignored\",\"anotherUnknown\":123}";

        UserOperation07Json op = Json.MAPPER.readValue(json, UserOperation07Json.class);

        assertEquals("0xAbc", op.sender);
        // No exception thrown, unknown fields silently ignored
    }

    @Test
    void deserializationFromEmptyObject() throws Exception {
        String json = "{}";

        UserOperation07Json op = Json.MAPPER.readValue(json, UserOperation07Json.class);

        assertNull(op.sender);
        assertNull(op.nonce);
        assertNull(op.callData);
        assertNull(op.signature);
    }
}
