package com.coinbase.x402.model;

import java.util.Map;

/** Defines one acceptable way to pay for a resource. */
public class PaymentRequirements {
    public String scheme;              // e.g. "exact"
    public String network;             // e.g. "base-sepolia"
    public String maxAmountRequired;   // uint256 in wei / atomic units
    public Map<String, Object> outputSchema; // optional JSON schema
    public String payTo;               // address (EVM / Solana etc.)
    public String asset;               // token contract address / symbol
    public Map<String, Object> extra;  // scheme‑specific
    
}

