package com.coinbase.x402.model;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Settlement response header that gets base64-encoded into X-PAYMENT-RESPONSE.
 * Matches the structure of Go SettleResponse and TypeScript SettleResponse.
 */
@JsonInclude(JsonInclude.Include.ALWAYS) // Always include all fields, even nulls
public class SettlementResponseHeader {
    /** Whether the settlement was successful. */
    public boolean success;

    /** Transaction hash of the settled payment. */
    public String transaction;

    /** Network ID where the settlement occurred. */
    public String network;

    /** Wallet address of the person who made the payment (can be null). */
    public String payer;

    /** Structured context for why settlement failed (can be null). */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public IntentTrace intentTrace;

    /** Default constructor for Jackson. */
    public SettlementResponseHeader() {}

    /** Constructor with all fields (without intentTrace). */
    public SettlementResponseHeader(boolean success, String transaction, String network, String payer) {
        this.success = success;
        this.transaction = transaction;
        this.network = network;
        this.payer = payer;
    }

    /** Constructor with all fields including intentTrace. */
    public SettlementResponseHeader(boolean success, String transaction, String network, String payer, IntentTrace intentTrace) {
        this.success = success;
        this.transaction = transaction;
        this.network = network;
        this.payer = payer;
        this.intentTrace = intentTrace;
    }
}
