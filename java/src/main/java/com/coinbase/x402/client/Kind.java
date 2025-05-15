package com.coinbase.x402.client;

/** Identifies a payment scheme+network pair that a facilitator supports. */
public class Kind {
    public final String scheme;    // e.g. "exact"
    public final String network;   // e.g. "base-sepolia"

    public Kind() {
        this.scheme = null;
        this.network = null;
    }

    public Kind(String scheme, String network) {
        this.scheme = scheme;
        this.network = network;
    }
}
