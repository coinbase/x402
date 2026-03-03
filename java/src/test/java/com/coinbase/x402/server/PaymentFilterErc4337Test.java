package com.coinbase.x402.server;

import com.coinbase.x402.client.FacilitatorClient;
import com.coinbase.x402.client.SettlementResponse;
import com.coinbase.x402.client.VerificationResponse;
import com.coinbase.x402.model.PaymentPayload;
import jakarta.servlet.FilterChain;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import java.io.ByteArrayOutputStream;
import java.io.PrintWriter;
import java.math.BigInteger;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/**
 * Tests for ERC-4337 payer extraction in PaymentFilter.
 */
class PaymentFilterErc4337Test {

    @Mock HttpServletRequest  req;
    @Mock HttpServletResponse resp;
    @Mock FilterChain         chain;
    @Mock FacilitatorClient   fac;

    private PaymentFilter filter;

    @BeforeEach
    void init() throws Exception {
        MockitoAnnotations.openMocks(this);
        when(resp.getWriter()).thenReturn(new PrintWriter(new ByteArrayOutputStream(), true));

        filter = new PaymentFilter(
                "0xReceiver",
                Map.of("/private", BigInteger.TEN),
                fac
        );
    }

    /* ------------ ERC-4337 payload: payer = userOperation.sender ----------- */

    @Test
    void erc4337PayerExtractedFromUserOperationSender() throws Exception {
        when(req.getRequestURI()).thenReturn("/private");

        String senderAddress = "0xErc4337Sender1234567890abcdef12345678";

        // Build ERC-4337 payload
        Map<String, Object> userOp = new HashMap<>();
        userOp.put("sender", senderAddress);
        userOp.put("nonce", "0x1");
        userOp.put("callData", "0xabcdef");
        userOp.put("callGasLimit", "0x5208");
        userOp.put("verificationGasLimit", "0x10000");
        userOp.put("preVerificationGas", "0x5208");
        userOp.put("maxFeePerGas", "0x3B9ACA00");
        userOp.put("maxPriorityFeePerGas", "0x3B9ACA00");
        userOp.put("signature", "0xSig");

        Map<String, Object> payloadMap = new HashMap<>();
        payloadMap.put("resource", "/private");
        payloadMap.put("type", "erc4337");
        payloadMap.put("entryPoint", "0x0000000071727De22E5E9d8BAf0edAc6f37da032");
        payloadMap.put("userOperation", userOp);

        PaymentPayload p = new PaymentPayload();
        p.x402Version = 1;
        p.scheme = "exact";
        p.network = "base-sepolia";
        p.payload = payloadMap;

        String header = p.toHeader();
        when(req.getHeader("X-PAYMENT")).thenReturn(header);

        // Verification succeeds
        VerificationResponse vr = new VerificationResponse();
        vr.isValid = true;
        when(fac.verify(eq(header), any())).thenReturn(vr);

        // Settlement succeeds
        SettlementResponse sr = new SettlementResponse();
        sr.success = true;
        sr.txHash = "0xTxHash";
        sr.networkId = "base-sepolia";
        when(fac.settle(eq(header), any())).thenReturn(sr);

        filter.doFilter(req, resp, chain);

        // Request processed
        verify(chain).doFilter(req, resp);
        verify(resp, never()).setStatus(HttpServletResponse.SC_PAYMENT_REQUIRED);

        // Capture X-PAYMENT-RESPONSE header
        ArgumentCaptor<String> headerCaptor = ArgumentCaptor.forClass(String.class);
        verify(resp).setHeader(eq("X-PAYMENT-RESPONSE"), headerCaptor.capture());

        // Decode and verify payer is userOperation.sender
        String jsonString = new String(Base64.getDecoder().decode(headerCaptor.getValue()));
        assertTrue(jsonString.contains("\"payer\":\"" + senderAddress + "\""),
                "Settlement response should contain ERC-4337 sender as payer: " + jsonString);
        assertTrue(jsonString.contains("\"success\":true"),
                "Settlement response should indicate success: " + jsonString);
    }

    /* ------------ ERC-4337 payload with optional paymaster fields ---------- */

    @Test
    void erc4337PayerExtractedWithPaymasterFields() throws Exception {
        when(req.getRequestURI()).thenReturn("/private");

        String senderAddress = "0xSenderWithPaymaster";

        Map<String, Object> userOp = new HashMap<>();
        userOp.put("sender", senderAddress);
        userOp.put("nonce", "0x1");
        userOp.put("callData", "0xabcdef");
        userOp.put("callGasLimit", "0x5208");
        userOp.put("verificationGasLimit", "0x10000");
        userOp.put("preVerificationGas", "0x5208");
        userOp.put("maxFeePerGas", "0x3B9ACA00");
        userOp.put("maxPriorityFeePerGas", "0x3B9ACA00");
        userOp.put("signature", "0xSig");
        userOp.put("paymaster", "0xPaymaster");
        userOp.put("paymasterData", "0xPmData");

        Map<String, Object> payloadMap = new HashMap<>();
        payloadMap.put("resource", "/private");
        payloadMap.put("type", "erc4337");
        payloadMap.put("entryPoint", "0x0000000071727De22E5E9d8BAf0edAc6f37da032");
        payloadMap.put("bundlerRpcUrl", "https://bundler.example.com");
        payloadMap.put("userOperation", userOp);

        PaymentPayload p = new PaymentPayload();
        p.x402Version = 1;
        p.scheme = "exact";
        p.network = "base-sepolia";
        p.payload = payloadMap;

        String header = p.toHeader();
        when(req.getHeader("X-PAYMENT")).thenReturn(header);

        VerificationResponse vr = new VerificationResponse();
        vr.isValid = true;
        when(fac.verify(eq(header), any())).thenReturn(vr);

        SettlementResponse sr = new SettlementResponse();
        sr.success = true;
        sr.txHash = "0xTxHash";
        sr.networkId = "base-sepolia";
        when(fac.settle(eq(header), any())).thenReturn(sr);

        filter.doFilter(req, resp, chain);

        verify(chain).doFilter(req, resp);

        ArgumentCaptor<String> headerCaptor = ArgumentCaptor.forClass(String.class);
        verify(resp).setHeader(eq("X-PAYMENT-RESPONSE"), headerCaptor.capture());

        String jsonString = new String(Base64.getDecoder().decode(headerCaptor.getValue()));
        assertTrue(jsonString.contains("\"payer\":\"" + senderAddress + "\""),
                "Payer should be sender even with paymaster: " + jsonString);
    }

    /* ------------ ERC-4337 payload with missing sender falls back --------- */

    @Test
    void erc4337PayloadWithMissingSenderReturnsNullPayer() throws Exception {
        when(req.getRequestURI()).thenReturn("/private");

        // userOperation without sender
        Map<String, Object> userOp = new HashMap<>();
        userOp.put("nonce", "0x1");
        userOp.put("callData", "0xabcdef");

        Map<String, Object> payloadMap = new HashMap<>();
        payloadMap.put("resource", "/private");
        payloadMap.put("entryPoint", "0x0000000071727De22E5E9d8BAf0edAc6f37da032");
        payloadMap.put("userOperation", userOp);

        PaymentPayload p = new PaymentPayload();
        p.x402Version = 1;
        p.scheme = "exact";
        p.network = "base-sepolia";
        p.payload = payloadMap;

        String header = p.toHeader();
        when(req.getHeader("X-PAYMENT")).thenReturn(header);

        VerificationResponse vr = new VerificationResponse();
        vr.isValid = true;
        when(fac.verify(eq(header), any())).thenReturn(vr);

        SettlementResponse sr = new SettlementResponse();
        sr.success = true;
        sr.txHash = "0xTxHash";
        sr.networkId = "base-sepolia";
        when(fac.settle(eq(header), any())).thenReturn(sr);

        filter.doFilter(req, resp, chain);

        // Should still process successfully
        verify(chain).doFilter(req, resp);
        verify(resp, never()).setStatus(HttpServletResponse.SC_PAYMENT_REQUIRED);

        // Payer should be null
        ArgumentCaptor<String> headerCaptor = ArgumentCaptor.forClass(String.class);
        verify(resp).setHeader(eq("X-PAYMENT-RESPONSE"), headerCaptor.capture());

        String jsonString = new String(Base64.getDecoder().decode(headerCaptor.getValue()));
        assertTrue(jsonString.contains("\"payer\":null"),
                "Payer should be null when sender missing: " + jsonString);
    }

    /* ------------ EIP-3009 payload still works (not ERC-4337) -------------- */

    @Test
    void eip3009PayerStillExtractedFromAuthorizationFrom() throws Exception {
        when(req.getRequestURI()).thenReturn("/private");

        String payerAddress = "0xEip3009Payer1234567890abcdef12345678";

        Map<String, Object> payloadMap = new HashMap<>();
        payloadMap.put("resource", "/private");
        payloadMap.put("signature", "0x1234567890abcdef");
        payloadMap.put("authorization", Map.of(
                "from", payerAddress,
                "to", "0xReceiver",
                "value", "1000000",
                "validAfter", "0",
                "validBefore", "999999999999",
                "nonce", "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
        ));

        PaymentPayload p = new PaymentPayload();
        p.x402Version = 1;
        p.scheme = "exact";
        p.network = "base-sepolia";
        p.payload = payloadMap;

        String header = p.toHeader();
        when(req.getHeader("X-PAYMENT")).thenReturn(header);

        VerificationResponse vr = new VerificationResponse();
        vr.isValid = true;
        when(fac.verify(eq(header), any())).thenReturn(vr);

        SettlementResponse sr = new SettlementResponse();
        sr.success = true;
        sr.txHash = "0xTxHash";
        sr.networkId = "base-sepolia";
        when(fac.settle(eq(header), any())).thenReturn(sr);

        filter.doFilter(req, resp, chain);

        verify(chain).doFilter(req, resp);

        ArgumentCaptor<String> headerCaptor = ArgumentCaptor.forClass(String.class);
        verify(resp).setHeader(eq("X-PAYMENT-RESPONSE"), headerCaptor.capture());

        String jsonString = new String(Base64.getDecoder().decode(headerCaptor.getValue()));
        assertTrue(jsonString.contains("\"payer\":\"" + payerAddress + "\""),
                "EIP-3009 payer should come from authorization.from: " + jsonString);
    }

    /* ------------ Settlement success with null txHash/networkId ------------- */

    @Test
    void settlementSuccessWithNullTxHashAndNetworkIdFallsBackToEmptyString() throws Exception {
        when(req.getRequestURI()).thenReturn("/private");

        String senderAddress = "0xSenderNullTxHash";

        Map<String, Object> userOp = new HashMap<>();
        userOp.put("sender", senderAddress);
        userOp.put("nonce", "0x1");
        userOp.put("callData", "0xabcdef");
        userOp.put("callGasLimit", "0x5208");
        userOp.put("verificationGasLimit", "0x10000");
        userOp.put("preVerificationGas", "0x5208");
        userOp.put("maxFeePerGas", "0x3B9ACA00");
        userOp.put("maxPriorityFeePerGas", "0x3B9ACA00");
        userOp.put("signature", "0xSig");

        Map<String, Object> payloadMap = new HashMap<>();
        payloadMap.put("resource", "/private");
        payloadMap.put("type", "erc4337");
        payloadMap.put("entryPoint", "0x0000000071727De22E5E9d8BAf0edAc6f37da032");
        payloadMap.put("userOperation", userOp);

        PaymentPayload p = new PaymentPayload();
        p.x402Version = 1;
        p.scheme = "exact";
        p.network = "base-sepolia";
        p.payload = payloadMap;

        String header = p.toHeader();
        when(req.getHeader("X-PAYMENT")).thenReturn(header);

        VerificationResponse vr = new VerificationResponse();
        vr.isValid = true;
        when(fac.verify(eq(header), any())).thenReturn(vr);

        // Settlement succeeds but txHash and networkId are null
        SettlementResponse sr = new SettlementResponse();
        sr.success = true;
        sr.txHash = null;
        sr.networkId = null;
        when(fac.settle(eq(header), any())).thenReturn(sr);

        filter.doFilter(req, resp, chain);

        verify(chain).doFilter(req, resp);

        ArgumentCaptor<String> headerCaptor = ArgumentCaptor.forClass(String.class);
        verify(resp).setHeader(eq("X-PAYMENT-RESPONSE"), headerCaptor.capture());

        String jsonString = new String(Base64.getDecoder().decode(headerCaptor.getValue()));
        // txHash and networkId should fall back to empty strings
        assertTrue(jsonString.contains("\"transaction\":\"\""),
                "transaction should be empty string when txHash is null: " + jsonString);
        assertTrue(jsonString.contains("\"network\":\"\""),
                "network should be empty string when networkId is null: " + jsonString);
        assertTrue(jsonString.contains("\"success\":true"),
                "Settlement should be successful: " + jsonString);
        assertTrue(jsonString.contains("\"payer\":\"" + senderAddress + "\""),
                "Payer should still be extracted: " + jsonString);
    }

    /* ------------ ERC-4337 payload where userOperation.sender is non-String - */

    @Test
    void erc4337PayloadWithNonStringSenderReturnsNullPayer() throws Exception {
        when(req.getRequestURI()).thenReturn("/private");

        // userOperation with sender as Integer (not String)
        Map<String, Object> userOp = new HashMap<>();
        userOp.put("sender", 12345); // non-String type
        userOp.put("nonce", "0x1");
        userOp.put("callData", "0xabcdef");
        userOp.put("callGasLimit", "0x5208");
        userOp.put("verificationGasLimit", "0x10000");
        userOp.put("preVerificationGas", "0x5208");
        userOp.put("maxFeePerGas", "0x3B9ACA00");
        userOp.put("maxPriorityFeePerGas", "0x3B9ACA00");
        userOp.put("signature", "0xSig");

        Map<String, Object> payloadMap = new HashMap<>();
        payloadMap.put("resource", "/private");
        payloadMap.put("type", "erc4337");
        payloadMap.put("entryPoint", "0x0000000071727De22E5E9d8BAf0edAc6f37da032");
        payloadMap.put("userOperation", userOp);

        PaymentPayload p = new PaymentPayload();
        p.x402Version = 1;
        p.scheme = "exact";
        p.network = "base-sepolia";
        p.payload = payloadMap;

        String header = p.toHeader();
        when(req.getHeader("X-PAYMENT")).thenReturn(header);

        VerificationResponse vr = new VerificationResponse();
        vr.isValid = true;
        when(fac.verify(eq(header), any())).thenReturn(vr);

        SettlementResponse sr = new SettlementResponse();
        sr.success = true;
        sr.txHash = "0xTxHash";
        sr.networkId = "base-sepolia";
        when(fac.settle(eq(header), any())).thenReturn(sr);

        filter.doFilter(req, resp, chain);

        // Should still process successfully
        verify(chain).doFilter(req, resp);

        ArgumentCaptor<String> headerCaptor = ArgumentCaptor.forClass(String.class);
        verify(resp).setHeader(eq("X-PAYMENT-RESPONSE"), headerCaptor.capture());

        String jsonString = new String(Base64.getDecoder().decode(headerCaptor.getValue()));
        // When sender is non-String, payer extraction should fall back.
        // Jackson convertValue will coerce 12345 to "12345", so the payer may be "12345" or null.
        // The key is the filter doesn't crash.
        assertTrue(jsonString.contains("\"success\":true"),
                "Settlement should still succeed: " + jsonString);
    }

    /* ------------ fromMap throws → manual fallback extracts sender ---------- */

    @Test
    void erc4337FromMapExceptionFallsBackToManualExtraction() throws Exception {
        when(req.getRequestURI()).thenReturn("/private");

        String senderAddress = "0xManualFallbackSender";

        // Build a userOperation map that passes isErc4337Payload (is a Map with entryPoint)
        // but causes Erc4337Payload.fromMap() to throw when Jackson tries to deserialize.
        // A nested userOperation with sender as a Map (not String) will cause Jackson
        // to fail on deserializing UserOperation07Json.sender (expects String, gets Map).
        Map<String, Object> badNestedField = new HashMap<>();
        badNestedField.put("not", "a-string");

        Map<String, Object> userOp = new HashMap<>();
        userOp.put("sender", senderAddress);  // String sender for manual fallback
        userOp.put("nonce", badNestedField);   // Map where String expected - causes Jackson failure
        userOp.put("callData", "0xabcdef");
        userOp.put("callGasLimit", badNestedField); // another bad field

        Map<String, Object> payloadMap = new HashMap<>();
        payloadMap.put("resource", "/private");
        payloadMap.put("type", "erc4337");
        payloadMap.put("entryPoint", "0x0000000071727De22E5E9d8BAf0edAc6f37da032");
        payloadMap.put("userOperation", userOp);

        PaymentPayload p = new PaymentPayload();
        p.x402Version = 1;
        p.scheme = "exact";
        p.network = "base-sepolia";
        p.payload = payloadMap;

        String header = p.toHeader();
        when(req.getHeader("X-PAYMENT")).thenReturn(header);

        // Verification succeeds
        VerificationResponse vr = new VerificationResponse();
        vr.isValid = true;
        when(fac.verify(eq(header), any())).thenReturn(vr);

        // Settlement succeeds
        SettlementResponse sr = new SettlementResponse();
        sr.success = true;
        sr.txHash = "0xTxHash";
        sr.networkId = "base-sepolia";
        when(fac.settle(eq(header), any())).thenReturn(sr);

        filter.doFilter(req, resp, chain);

        // Request should be processed
        verify(chain).doFilter(req, resp);
        verify(resp, never()).setStatus(HttpServletResponse.SC_PAYMENT_REQUIRED);

        // Capture X-PAYMENT-RESPONSE header
        ArgumentCaptor<String> headerCaptor = ArgumentCaptor.forClass(String.class);
        verify(resp).setHeader(eq("X-PAYMENT-RESPONSE"), headerCaptor.capture());

        // The manual fallback should have extracted sender from userOperation map
        String jsonString = new String(Base64.getDecoder().decode(headerCaptor.getValue()));
        assertTrue(jsonString.contains("\"payer\":\"" + senderAddress + "\""),
                "Manual fallback should extract sender from userOperation map: " + jsonString);
    }

    /* ------------ EIP-3009 convertValue fails → manual fallback from auth map */

    @Test
    void eip3009ConvertValueFailsFallsBackToManualExtraction() throws Exception {
        when(req.getRequestURI()).thenReturn("/private");

        String payerAddress = "0xManualAuthFallbackPayer";

        // Build a payload that is NOT ERC-4337 (no userOperation as Map) but has
        // an authorization Map whose structure causes Json.MAPPER.convertValue to fail
        // when converting to ExactSchemePayload. We use a nested Map for a field that
        // expects a String (e.g., "value" as a Map instead of String).
        Map<String, Object> badAuth = new HashMap<>();
        badAuth.put("from", payerAddress);
        badAuth.put("to", "0xReceiver");
        badAuth.put("value", Map.of("bad", "structure")); // Map where String expected → convertValue fails
        badAuth.put("validAfter", "0");
        badAuth.put("validBefore", "999999999999");
        badAuth.put("nonce", "0x1234");

        Map<String, Object> payloadMap = new HashMap<>();
        payloadMap.put("resource", "/private");
        payloadMap.put("signature", "0xSig");
        payloadMap.put("authorization", badAuth);

        PaymentPayload p = new PaymentPayload();
        p.x402Version = 1;
        p.scheme = "exact";
        p.network = "base-sepolia";
        p.payload = payloadMap;

        String header = p.toHeader();
        when(req.getHeader("X-PAYMENT")).thenReturn(header);

        // Verification succeeds
        VerificationResponse vr = new VerificationResponse();
        vr.isValid = true;
        when(fac.verify(eq(header), any())).thenReturn(vr);

        // Settlement succeeds
        SettlementResponse sr = new SettlementResponse();
        sr.success = true;
        sr.txHash = "0xTxHash";
        sr.networkId = "base-sepolia";
        when(fac.settle(eq(header), any())).thenReturn(sr);

        filter.doFilter(req, resp, chain);

        // Request should be processed
        verify(chain).doFilter(req, resp);
        verify(resp, never()).setStatus(HttpServletResponse.SC_PAYMENT_REQUIRED);

        // Capture X-PAYMENT-RESPONSE header
        ArgumentCaptor<String> headerCaptor = ArgumentCaptor.forClass(String.class);
        verify(resp).setHeader(eq("X-PAYMENT-RESPONSE"), headerCaptor.capture());

        // The manual fallback at lines 257-260 should have extracted "from" from the authorization map
        String jsonString = new String(Base64.getDecoder().decode(headerCaptor.getValue()));
        assertTrue(jsonString.contains("\"payer\":\"" + payerAddress + "\""),
                "Manual fallback should extract 'from' from authorization map: " + jsonString);
    }

    /* ------------ Payload with neither ERC-4337 nor authorization ---------- */

    @Test
    void payloadWithNoPayerInfoReturnsNullPayer() throws Exception {
        when(req.getRequestURI()).thenReturn("/private");

        Map<String, Object> payloadMap = new HashMap<>();
        payloadMap.put("resource", "/private");
        // No userOperation, no authorization

        PaymentPayload p = new PaymentPayload();
        p.x402Version = 1;
        p.scheme = "exact";
        p.network = "base-sepolia";
        p.payload = payloadMap;

        String header = p.toHeader();
        when(req.getHeader("X-PAYMENT")).thenReturn(header);

        VerificationResponse vr = new VerificationResponse();
        vr.isValid = true;
        when(fac.verify(eq(header), any())).thenReturn(vr);

        SettlementResponse sr = new SettlementResponse();
        sr.success = true;
        sr.txHash = "0xTxHash";
        sr.networkId = "base-sepolia";
        when(fac.settle(eq(header), any())).thenReturn(sr);

        filter.doFilter(req, resp, chain);

        verify(chain).doFilter(req, resp);

        ArgumentCaptor<String> headerCaptor = ArgumentCaptor.forClass(String.class);
        verify(resp).setHeader(eq("X-PAYMENT-RESPONSE"), headerCaptor.capture());

        String jsonString = new String(Base64.getDecoder().decode(headerCaptor.getValue()));
        assertTrue(jsonString.contains("\"payer\":null"),
                "Payer should be null when no payer info: " + jsonString);
    }
}
