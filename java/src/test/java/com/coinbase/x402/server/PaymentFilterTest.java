package com.coinbase.x402.server;

import com.coinbase.x402.client.FacilitatorClient;
import com.coinbase.x402.client.VerificationResponse;
import com.coinbase.x402.model.PaymentPayload;
import javax.servlet.FilterChain;
import javax.servlet.ServletRequest;
import javax.servlet.ServletResponse;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.PrintWriter;
import java.math.BigInteger;
import java.util.Map;

import static org.mockito.Mockito.*;

class PaymentFilterTest {

    @Mock HttpServletRequest  req;
    @Mock HttpServletResponse resp;
    @Mock FilterChain         chain;
    @Mock FacilitatorClient   fac;

    private PaymentFilter filter;

    @BeforeEach
    void init() throws Exception {
        MockitoAnnotations.openMocks(this);

        // writer stub
        when(resp.getWriter()).thenReturn(new PrintWriter(new ByteArrayOutputStream(), true));

        filter = new PaymentFilter(
                "0xReceiver",
                Map.of("/private", BigInteger.TEN),
                fac
        );
    }

    /* ------------ free endpoint passes straight through --------------- */
    @Test
    void freeEndpoint() throws Exception {
        when(req.getRequestURI()).thenReturn("/public");

        filter.doFilter(req, resp, chain);

        verify(chain).doFilter(req, resp);
        verify(resp, never()).setStatus(anyInt());
    }

    /* ------------ missing header => 402 -------------------------------- */
    @Test
    void missingHeader() throws Exception {
        when(req.getRequestURI()).thenReturn("/private");
        when(req.getHeader("X-PAYMENT")).thenReturn(null);

        filter.doFilter(req, resp, chain);

        verify(resp).setStatus(HttpServletResponse.SC_PAYMENT_REQUIRED);
        verify(chain, never()).doFilter(any(), any());
    }

    /* ------------ valid header => OK ----------------------------------- */
    @Test
    void validHeader() throws Exception {
        when(req.getRequestURI()).thenReturn("/private");

        // build a syntactically correct header whose resource matches the path
        PaymentPayload p = new PaymentPayload();
        p.x402Version = 1;
        p.scheme      = "exact";
        p.network     = "base-sepolia";
        p.payload     = Map.of("resource", "/private");
        String header = p.toHeader();
        when(req.getHeader("X-PAYMENT")).thenReturn(header);

        // facilitator says it's valid
        VerificationResponse vr = new VerificationResponse();
        vr.isValid = true;
        when(fac.verify(eq(header), any())).thenReturn(vr);

        filter.doFilter(req, resp, chain);

        verify(chain).doFilter(req, resp);
        verify(resp, never()).setStatus(HttpServletResponse.SC_PAYMENT_REQUIRED);
        verify(fac).verify(eq(header), any());
        verify(fac).settle(eq(header), any());
    }

    /* ------------ facilitator rejects payment → 402 ------------------- */
    @Test
    void facilitatorRejection() throws Exception {
        when(req.getRequestURI()).thenReturn("/private");

        // well-formed header for /private
        PaymentPayload p = new PaymentPayload();
        p.x402Version = 1;
        p.scheme      = "exact";
        p.network     = "base-sepolia";
        p.payload     = Map.of("resource", "/private");
        String header = p.toHeader();
        when(req.getHeader("X-PAYMENT")).thenReturn(header);

        // facilitator response: invalid
        VerificationResponse vr = new VerificationResponse();
        vr.isValid = false;
        vr.invalidReason = "insufficient funds";
        when(fac.verify(eq(header), any())).thenReturn(vr);

        filter.doFilter(req, resp, chain);

        verify(resp).setStatus(HttpServletResponse.SC_PAYMENT_REQUIRED);
        verify(chain, never()).doFilter(any(), any());
        // settle must NOT be called
        verify(fac, never()).settle(any(), any());
    }

    /* ------------ resource mismatch in header → 402 ------------------- */
    @Test
    void resourceMismatch() throws Exception {
        when(req.getRequestURI()).thenReturn("/private");

        // header says resource is /other
        PaymentPayload p = new PaymentPayload();
        p.x402Version = 1;
        p.scheme      = "exact";
        p.network     = "base-sepolia";
        p.payload     = Map.of("resource", "/other");
        String header = p.toHeader();
        when(req.getHeader("X-PAYMENT")).thenReturn(header);

        filter.doFilter(req, resp, chain);

        verify(resp).setStatus(HttpServletResponse.SC_PAYMENT_REQUIRED);
        verify(chain, never()).doFilter(any(), any());
        // facilitator should NOT have been called
        verify(fac, never()).verify(any(), any());
    }
    
    /* ------------ empty header (vs null) → 402 ---------------------------- */
    @Test
    void emptyHeader() throws Exception {
        when(req.getRequestURI()).thenReturn("/private");
        when(req.getHeader("X-PAYMENT")).thenReturn("");  // Empty string

        filter.doFilter(req, resp, chain);

        verify(resp).setStatus(HttpServletResponse.SC_PAYMENT_REQUIRED);
        verify(chain, never()).doFilter(any(), any());
    }

    /* ------------ non-HTTP request passes through without checks ---------- */
    @Test
    void nonHttpRequest() throws Exception {
        // Create non-HTTP servlet request and response
        ServletRequest nonHttpReq = mock(ServletRequest.class);
        ServletResponse nonHttpRes = mock(ServletResponse.class);
        
        filter.doFilter(nonHttpReq, nonHttpRes, chain);
        
        // Should pass through without any checks
        verify(chain).doFilter(nonHttpReq, nonHttpRes);
        verifyNoInteractions(fac);  // No facilitator interactions
    }

    /* ------------ exception parsing header → 402 -------------------------- */
    @Test
    void malformedHeader() throws Exception {
        when(req.getRequestURI()).thenReturn("/private");
        when(req.getHeader("X-PAYMENT")).thenReturn("invalid-json-format");

        filter.doFilter(req, resp, chain);

        verify(resp).setStatus(HttpServletResponse.SC_PAYMENT_REQUIRED);
        verify(chain, never()).doFilter(any(), any());
    }

    /* ------------ exception during verification → 402 --------------------- */
    @Test
    void verificationException() throws Exception {
        when(req.getRequestURI()).thenReturn("/private");
        
        // Create a valid header
        PaymentPayload p = new PaymentPayload();
        p.x402Version = 1;
        p.scheme      = "exact";
        p.network     = "base-sepolia";
        p.payload     = Map.of("resource", "/private");
        String header = p.toHeader();
        when(req.getHeader("X-PAYMENT")).thenReturn(header);
        
        // Make facilitator throw exception during verify
        when(fac.verify(any(), any())).thenThrow(new IOException("Network error"));
        
        filter.doFilter(req, resp, chain);
        
        verify(resp).setStatus(HttpServletResponse.SC_PAYMENT_REQUIRED);
        verify(chain, never()).doFilter(any(), any());
    }

    /* ------------ exception during settlement is ignored ------------------ */
    @Test
    void settlementException() throws Exception {
        when(req.getRequestURI()).thenReturn("/private");
        
        // Create a valid header
        PaymentPayload p = new PaymentPayload();
        p.x402Version = 1;
        p.scheme      = "exact";
        p.network     = "base-sepolia";
        p.payload     = Map.of("resource", "/private");
        String header = p.toHeader();
        when(req.getHeader("X-PAYMENT")).thenReturn(header);
        
        // Verification succeeds
        VerificationResponse vr = new VerificationResponse();
        vr.isValid = true;
        when(fac.verify(eq(header), any())).thenReturn(vr);
        
        // But settlement throws exception (should be ignored)
        doThrow(new IOException("Network error")).when(fac).settle(any(), any());
        
        filter.doFilter(req, resp, chain);
        
        // Request should still be processed successfully
        verify(chain).doFilter(req, resp);
        verify(resp, never()).setStatus(HttpServletResponse.SC_PAYMENT_REQUIRED);
        
        // Verify and settle were both called
        verify(fac).verify(eq(header), any());
        verify(fac).settle(eq(header), any());
    }
}
