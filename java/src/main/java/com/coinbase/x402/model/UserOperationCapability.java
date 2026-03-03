package com.coinbase.x402.model;

import java.util.Map;

/**
 * ERC-4337 UserOperation capability advertised in payment requirements.
 */
public class UserOperationCapability {
    /** Whether the UserOperation capability is supported. */
    public boolean supported;

    /** Bundler URL for submitting UserOperations. */
    public String bundlerUrl;

    /** Paymaster address for sponsored transactions. */
    public String paymaster;

    /** Suggested entrypoint for the UserOperation. */
    public String entrypoint;

    /** Default constructor. */
    public UserOperationCapability() {}

    /**
     * Extract UserOperationCapability from a requirements extra map.
     *
     * @param extra the extra map from payment requirements (may be null)
     * @return the capability if present and supported, null otherwise
     */
    @SuppressWarnings("unchecked")
    public static UserOperationCapability extract(Map<String, Object> extra) {
        if (extra == null) {
            return null;
        }

        Object userOpObj = extra.get("userOperation");
        if (!(userOpObj instanceof Map)) {
            return null;
        }

        Map<String, Object> userOp = (Map<String, Object>) userOpObj;
        Object supported = userOp.get("supported");
        if (!Boolean.TRUE.equals(supported)) {
            return null;
        }

        UserOperationCapability cap = new UserOperationCapability();
        cap.supported = true;
        if (userOp.get("bundlerUrl") instanceof String) {
            cap.bundlerUrl = (String) userOp.get("bundlerUrl");
        }
        if (userOp.get("paymaster") instanceof String) {
            cap.paymaster = (String) userOp.get("paymaster");
        }
        if (userOp.get("entrypoint") instanceof String) {
            cap.entrypoint = (String) userOp.get("entrypoint");
        }
        return cap;
    }
}
