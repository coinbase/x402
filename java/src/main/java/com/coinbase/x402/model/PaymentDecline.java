package com.coinbase.x402.model;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.Map;

/**
 * Payment decline message sent by clients when they choose not to pay.
 * Includes optional intent trace to explain the reason for declining.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class PaymentDecline {
    /** Protocol version (must be 2). */
    public int x402Version;

    /** Must be true to indicate this is a decline message. */
    public boolean decline = true;

    /** Resource that was declined. */
    public Map<String, String> resource;

    /** Structured context for why the payment was declined. */
    public IntentTrace intentTrace;

    /** Default constructor for Jackson. */
    public PaymentDecline() {}

    /** Constructor with required fields. */
    public PaymentDecline(int x402Version, Map<String, String> resource) {
        this.x402Version = x402Version;
        this.decline = true;
        this.resource = resource;
    }

    /** Constructor with all fields. */
    public PaymentDecline(int x402Version, Map<String, String> resource, IntentTrace intentTrace) {
        this.x402Version = x402Version;
        this.decline = true;
        this.resource = resource;
        this.intentTrace = intentTrace;
    }
}
