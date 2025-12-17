package com.coinbase.x402.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.Map;

/**
 * Provides structured context for payment decisions.
 * Used to communicate why a payment was declined or failed.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class IntentTrace {
    /** Enumerated code identifying the primary reason. */
    @JsonProperty("reason_code")
    public String reasonCode;

    /** Human-readable summary (max 500 chars). */
    @JsonProperty("trace_summary")
    public String traceSummary;

    /** Flat key-value object for additional context. Values must be String, Number, or Boolean. */
    public Map<String, Object> metadata;

    /** Suggested action to resolve the issue. */
    public Remediation remediation;

    /** Default constructor for Jackson. */
    public IntentTrace() {}

    /** Constructor with required fields. */
    public IntentTrace(String reasonCode) {
        this.reasonCode = reasonCode;
    }

    /** Constructor with reason code and summary. */
    public IntentTrace(String reasonCode, String traceSummary) {
        this.reasonCode = reasonCode;
        this.traceSummary = traceSummary;
    }

    /** Constructor with all fields. */
    public IntentTrace(String reasonCode, String traceSummary, Map<String, Object> metadata, Remediation remediation) {
        this.reasonCode = reasonCode;
        this.traceSummary = traceSummary;
        this.metadata = metadata;
        this.remediation = remediation;
    }
}
