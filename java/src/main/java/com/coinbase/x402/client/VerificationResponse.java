package com.coinbase.x402.client;

import com.coinbase.x402.model.IntentTrace;

/** JSON returned by POST /verify on the facilitator. */
public class VerificationResponse {
    /** Whether the payment verification succeeded. */
    public boolean isValid;

    /** Reason for verification failure (if isValid is false). */
    public String invalidReason;

    /** Structured context for why verification failed. */
    public IntentTrace intentTrace;
}

