package com.coinbase.x402.model;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * ERC-4337 v0.7 User Operation in JSON-RPC format.
 * All numeric values are hex-encoded strings.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class UserOperation07Json {
    public String sender;
    public String nonce;
    public String factory;
    public String factoryData;
    public String callData;
    public String callGasLimit;
    public String verificationGasLimit;
    public String preVerificationGas;
    public String maxFeePerGas;
    public String maxPriorityFeePerGas;
    public String paymaster;
    public String paymasterData;
    public String paymasterVerificationGasLimit;
    public String paymasterPostOpGasLimit;
    public String signature;

    /** Default constructor for Jackson. */
    public UserOperation07Json() {}
}
