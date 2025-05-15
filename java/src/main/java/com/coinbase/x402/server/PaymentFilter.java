package com.coinbase.x402.server;

import com.coinbase.x402.client.FacilitatorClient;
import com.coinbase.x402.client.VerificationResponse;
import com.coinbase.x402.model.PaymentPayload;
import com.coinbase.x402.model.PaymentRequirements;
import com.coinbase.x402.model.PaymentRequiredResponse;
import com.coinbase.x402.util.Json;

import javax.servlet.Filter;
import javax.servlet.FilterChain;
import javax.servlet.ServletException;
import javax.servlet.ServletRequest;
import javax.servlet.ServletResponse;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.math.BigInteger;
import java.util.Map;
import java.util.Objects;

/** Servlet/Spring filter that enforces x402 payments on selected paths. */
public class PaymentFilter implements Filter {

    private final String                       payTo;
    private final Map<String, BigInteger>      priceTable;   // path → amount
    private final FacilitatorClient            facilitator;

    public PaymentFilter(String payTo,
                         Map<String, BigInteger> priceTable,
                         FacilitatorClient facilitator) {
        this.payTo       = Objects.requireNonNull(payTo);
        this.priceTable  = Objects.requireNonNull(priceTable);
        this.facilitator = Objects.requireNonNull(facilitator);
    }

    /* ------------------------------------------------ core -------------- */

    @Override
    public void doFilter(ServletRequest req,
                         ServletResponse res,
                         FilterChain     chain)
            throws IOException, ServletException {

        if (!(req instanceof HttpServletRequest) ||
            !(res instanceof HttpServletResponse)) {
            chain.doFilter(req, res);          // non-HTTP
            return;
        }

        HttpServletRequest  request  = (HttpServletRequest)  req;
        HttpServletResponse response = (HttpServletResponse) res;
        String              path     = request.getRequestURI();

        /* -------- path is free? skip check ----------------------------- */
        if (!priceTable.containsKey(path)) {
            chain.doFilter(req, res);
            return;
        }

        String header = request.getHeader("X-PAYMENT");
        if (header == null || header.isEmpty()) {
            respond402(response, path, null);
            return;
        }

        VerificationResponse vr;
        try {
            PaymentPayload payload = PaymentPayload.fromHeader(header);

            // simple sanity: resource must match the URL path
            if (!Objects.equals(payload.payload.get("resource"), path)) {
                respond402(response, path, "resource mismatch");
                return;
            }

            vr = facilitator.verify(header, buildRequirements(path));
        } catch (Exception ex) {
            respond402(response, path, "malformed X-PAYMENT header");
            return;
        }

        if (!vr.isValid) {
            respond402(response, path, vr.invalidReason);
            return;
        }

        /* -------- payment verified → continue business logic ----------- */
        chain.doFilter(req, res);

        /* -------- best-effort async settlement (errors ignored) -------- */
        try {
            facilitator.settle(header, buildRequirements(path));
        } catch (Exception ignored) { }
    }

    /* ------------------------------------------------ helpers ---------- */

    /** Build a PaymentRequirements object for the given path and price. */
    private PaymentRequirements buildRequirements(String path) {
        PaymentRequirements pr = new PaymentRequirements();
        pr.scheme            = "exact";
        pr.network           = "base-sepolia";
        pr.maxAmountRequired = priceTable.get(path).toString();
        pr.asset             = "USDC";               // adjust for your token
        pr.resource          = path;
        pr.mimeType          = "application/json";
        pr.payTo             = payTo;
        pr.maxTimeoutSeconds = 30;
        return pr;
    }

    /** Write a JSON 402 response. */
    private void respond402(HttpServletResponse resp,
                            String             path,
                            String             error)
            throws IOException {

        resp.setStatus(HttpServletResponse.SC_PAYMENT_REQUIRED);
        resp.setContentType("application/json");

        PaymentRequiredResponse prr = new PaymentRequiredResponse();
        prr.x402Version = 1;
        prr.accepts.add(buildRequirements(path));
        prr.error = error;

        resp.getWriter().write(Json.MAPPER.writeValueAsString(prr));
    }
}
