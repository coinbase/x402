package com.coinbase.x402.model;

import java.util.ArrayList;
import java.util.List;

/** HTTP 402 response body returned by an x402-enabled server. */
public class PaymentRequiredResponse {
    public int x402Version;
    public List<PaymentRequirements> accepts = new ArrayList<>();
    public String error;
    // Root-level resource metadata (moved out of PaymentRequirements)
    public String resource;
    public String description;
    public String mimeType;
    public Integer maxTimeoutSeconds;
}
