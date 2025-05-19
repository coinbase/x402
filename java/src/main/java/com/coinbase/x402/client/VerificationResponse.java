package com.coinbase.x402.client;

/** JSON returned by POST /verify on the facilitator. */
public class VerificationResponse {
    public boolean isValid;
    public String  invalidReason;
}

