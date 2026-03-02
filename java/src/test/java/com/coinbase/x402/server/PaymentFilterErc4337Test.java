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
