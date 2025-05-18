package com.coinbase.x402.crypto;

import java.util.Map;

/** Minimal abstraction for creating cryptographic proofs over a payload.
 *  Implement with web3j, Solana-J, etc., depending on your payment scheme.
 */
public interface CryptoSigner {
    /** Returns a hex-encoded signature covering the given payload map. */
    String sign(Map<String, Object> payload);
}

