package com.coinbase.x402.model;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.HashMap;
import java.util.Map;

/**
 * Provides actionable guidance to clients on how to fix a payment failure.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class Remediation {
    /** Suggested action (e.g., "top_up", "retry", "switch_network"). */
    public String action;

    /** Why this action would help. */
    public String reason;

    /** Action-specific parameters. */
    private Map<String, Object> extra = new HashMap<>();

    /** Default constructor for Jackson. */
    public Remediation() {}

    /** Constructor with required fields. */
    public Remediation(String action) {
        this.action = action;
    }

    /** Constructor with all common fields. */
    public Remediation(String action, String reason) {
        this.action = action;
        this.reason = reason;
    }

    @JsonAnyGetter
    public Map<String, Object> getExtra() {
        return extra;
    }

    @JsonAnySetter
    public void setExtra(String key, Object value) {
        this.extra.put(key, value);
    }
}
