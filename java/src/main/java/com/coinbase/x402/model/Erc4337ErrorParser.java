package com.coinbase.x402.model;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Parser for ERC-4337 AA error codes.
 */
public final class Erc4337ErrorParser {
    private Erc4337ErrorParser() {} // Prevent instantiation

    private static final Pattern AA_ERROR_PATTERN = Pattern.compile("\\b(AA[0-9]{2})\\b");

    /**
     * Result of parsing an AA error code.
     */
    public static class AAError {
        public final String code;
        public final String reason;

        /**
         * Creates an AA error with the given code and reason.
         *
         * @param code the AA error code (e.g. "AA21")
         * @param reason human-readable error reason
         */
        public AAError(String code, String reason) {
            this.code = code;
            this.reason = reason;
        }
    }

    /**
     * Extract an AA error code from a message and return a human-readable reason.
     *
     * @param message the error message to parse
     * @return the parsed AA error, or null if no AA code found
     */
    public static AAError parseAAError(String message) {
        if (message == null || message.isEmpty()) {
            return null;
        }

        Matcher matcher = AA_ERROR_PATTERN.matcher(message);
        if (!matcher.find()) {
            return null;
        }

        String code = matcher.group(1);
        String reason = Erc4337Constants.AA_ERROR_MESSAGES.getOrDefault(code, "Unknown AA error");
        return new AAError(code, reason);
    }
}
