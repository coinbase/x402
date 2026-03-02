package com.coinbase.x402.model;

import com.coinbase.x402.util.Json;
import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.Map;

/**
 * ERC-4337 payload structure for x402 payments.
 * Matches the TypeScript Erc4337Payload and Go Erc4337Payload structures.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class Erc4337Payload {
    /** Payload type identifier. */
    public String type;

    /** EntryPoint contract address. */
    public String entryPoint;

    /** Bundler RPC URL. */
    public String bundlerRpcUrl;

    /** The user operation. */
    public UserOperation07Json userOperation;

    /** Default constructor for Jackson. */
    public Erc4337Payload() {}

    /**
     * Check if a payload map is an ERC-4337 payload.
     * ERC-4337 payloads have a {@code userOperation} field and an {@code entryPoint} field.
     *
     * @param payload the generic payload map
     * @return true if the payload is an ERC-4337 payload
     */
    public static boolean isErc4337Payload(Map<String, Object> payload) {
        if (payload == null) {
            return false;
        }
        Object userOp = payload.get("userOperation");
        return userOp != null
                && userOp instanceof Map
                && payload.containsKey("entryPoint");
    }

    /**
     * Convert a generic payload map to a typed Erc4337Payload using Jackson.
     *
     * @param payload the generic payload map
     * @return the typed Erc4337Payload
     * @throws IllegalArgumentException if conversion fails
     */
    public static Erc4337Payload fromMap(Map<String, Object> payload) {
        try {
            return Json.MAPPER.convertValue(payload, Erc4337Payload.class);
        } catch (Exception ex) {
            throw new IllegalArgumentException("Failed to convert payload to Erc4337Payload: " + ex.getMessage(), ex);
        }
    }
}
