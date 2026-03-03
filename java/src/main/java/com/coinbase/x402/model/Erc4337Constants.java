package com.coinbase.x402.model;

import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

/**
 * ERC-4337 contract addresses and error constants.
 */
public final class Erc4337Constants {
    private Erc4337Constants() {} // Prevent instantiation

    /** Canonical EntryPoint v0.7 address. */
    public static final String ENTRY_POINT_07_ADDRESS = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";

    /** Safe 4337 module address. */
    public static final String SAFE_4337_MODULE_ADDRESS = "0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226";

    /** Safe WebAuthn shared signer address. */
    public static final String SAFE_WEBAUTHN_SHARED_SIGNER = "0xfD90FAd33ee8b58f32c00aceEad1358e4AFC23f9";

    /** FCL P256 verifier address. */
    public static final String FCL_P256_VERIFIER = "0xA86e0054C51E4894D88762a017ECc5E5235f5DBA";

    /** P256 owner factory address. */
    public static final String P256_OWNER_FACTORY = "0x349c03Eb61e26528cbf79F5D3Ba071FcA2aE82cB";

    /** WebAuthn signer factory address. */
    public static final String WEBAUTHN_SIGNER_FACTORY = "0xF7488fFbe67327ac9f37D5F722d83Fc900852Fbf";

    /** AA error codes and their human-readable messages. */
    public static final Map<String, String> AA_ERROR_MESSAGES;

    static {
        Map<String, String> messages = new HashMap<>();
        messages.put("AA10", "Sender already constructed");
        messages.put("AA13", "InitCode failed or OOG");
        messages.put("AA14", "InitCode must return sender");
        messages.put("AA15", "InitCode must create sender");
        messages.put("AA20", "Account not deployed");
        messages.put("AA21", "Insufficient funds for gas prefund");
        messages.put("AA22", "Expired or not due");
        messages.put("AA23", "Reverted (or OOG)");
        messages.put("AA24", "Signature validation failed");
        messages.put("AA25", "Nonce validation failed");
        messages.put("AA26", "Account accessed global state");
        messages.put("AA30", "Paymaster not deployed");
        messages.put("AA31", "Paymaster deposit too low");
        messages.put("AA32", "Paymaster expired or not due");
        messages.put("AA33", "Paymaster reverted (or OOG)");
        messages.put("AA34", "Paymaster context reverted");
        messages.put("AA40", "Over verification gas limit");
        messages.put("AA41", "Over max fee per gas");
        messages.put("AA50", "Over max priority fee per gas");
        messages.put("AA51", "Prefund below actualGasCost");
        AA_ERROR_MESSAGES = Collections.unmodifiableMap(messages);
    }
}
