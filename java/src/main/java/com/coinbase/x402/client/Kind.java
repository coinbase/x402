package com.coinbase.x402.client;

/** Identifies a payment scheme+network pair that a facilitator supports. */
public class Kind {
    public String scheme;    // e.g. "exact"
    public String network;   // e.g. "base-sepolia"
}
