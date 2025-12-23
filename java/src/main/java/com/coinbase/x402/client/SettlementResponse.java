package com.coinbase.x402.client;

import com.coinbase.x402.model.IntentTrace;

/** JSON returned by POST /settle on the facilitator. */
public class SettlementResponse {
    /** Whether the payment settlement succeeded. */
    public boolean success;

    /** Error message if settlement failed. */
    public String error;

    /** Transaction hash of the settled payment. */
    public String txHash;

    /** Network ID where the settlement occurred. */
    public String networkId;

    /** Structured context for why settlement failed. */
    public IntentTrace intentTrace;
}
