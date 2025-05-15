package com.coinbase.x402.client;

/** JSON returned by POST /settle on the facilitator. */
public class SettlementResponse {
    public boolean success;
    public String  error;
    public String  txHash;
    public String  networkId;
}
