import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  convertMaxValueToPolicy,
  getDefaultPolicy,
  processUnifiedParameter,
  parseMoneyToAtomicUnits,
  expandMoneyToNetworkPolicy,
  validatePaymentAgainstPolicy,
} from "./wallet-policy-utils";
import { WalletPolicy } from "./wallet-policy";

// Mock console.warn for testing deprecation warnings
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe("convertMaxValueToPolicy", () => {
  it("should convert bigint to policy with base and base-sepolia", () => {
    const policy = convertMaxValueToPolicy(BigInt(100000)); // 0.1 USDC
    
    expect(policy.payments?.networks["base"]).toBe("$0.10");
    expect(policy.payments?.networks["base-sepolia"]).toBe("$0.10");
  });

  it("should handle different amounts correctly", () => {
    const policy = convertMaxValueToPolicy(BigInt(50000)); // 0.05 USDC
    
    expect(policy.payments?.networks["base"]).toBe("$0.05");
    expect(policy.payments?.networks["base-sepolia"]).toBe("$0.05");
  });
});

describe("getDefaultPolicy", () => {
  it("should return base-sepolia only policy", () => {
    const policy = getDefaultPolicy();
    
    expect(policy.payments?.networks["base-sepolia"]).toBe("$0.10");
    expect(policy.payments?.networks["base"]).toBeUndefined();
  });
});

describe("processUnifiedParameter", () => {
  it("should return default policy for undefined input", () => {
    const policy = processUnifiedParameter(undefined);
    
    expect(policy.payments?.networks["base-sepolia"]).toBe("$0.10");
  });

  it("should convert bigint to policy and show warning", () => {
    const policy = processUnifiedParameter(BigInt(50000));
    
    expect(policy.payments?.networks["base"]).toBe("$0.05");
    expect(policy.payments?.networks["base-sepolia"]).toBe("$0.05");
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("Passing bigint directly is deprecated")
    );
  });

  it("should return WalletPolicy unchanged", () => {
    const inputPolicy: WalletPolicy = {
      payments: {
        networks: {
          "ethereum": "$0.20"
        }
      }
    };
    
    const policy = processUnifiedParameter(inputPolicy);
    
    expect(policy).toBe(inputPolicy);
    expect(console.warn).not.toHaveBeenCalled();
  });
});

describe("parseMoneyToAtomicUnits", () => {
  it("should parse dollar amounts correctly", () => {
    const result = parseMoneyToAtomicUnits("$0.10", 6); // USDC decimals
    
    expect(result).toBe("100000");
  });

  it("should parse decimal amounts correctly", () => {
    const result = parseMoneyToAtomicUnits("1.5", 18); // ETH decimals
    
    expect(result).toBe("1500000000000000000");
  });

  it("should handle integer amounts", () => {
    const result = parseMoneyToAtomicUnits("1", 6);
    
    expect(result).toBe("1000000");
  });

  it("should handle numeric inputs", () => {
    const result = parseMoneyToAtomicUnits(0.5, 6);
    
    expect(result).toBe("500000");
  });
});

describe("expandMoneyToNetworkPolicy", () => {
  it("should expand money for supported network", () => {
    const policy = expandMoneyToNetworkPolicy("base-sepolia", "$0.10");
    
    const usdcAddress = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
    expect(policy[usdcAddress]).toBeDefined();
    expect(policy[usdcAddress].limit).toEqual({
      amount: "100000",
      asset: {
        address: usdcAddress,
        decimals: 6,
        eip712: {
          name: "USD Coin",
          version: "2"
        }
      }
    });
  });

  it("should throw error for unsupported network", () => {
    expect(() => {
      expandMoneyToNetworkPolicy("unsupported-network", "$0.10");
    }).toThrow("Money shorthand not supported for network: unsupported-network");
  });

  it("should handle different networks correctly", () => {
    const basePolicy = expandMoneyToNetworkPolicy("base", "$0.10");
    const sepoliaPolicy = expandMoneyToNetworkPolicy("base-sepolia", "$0.10");
    
    // Different addresses but same amounts
    expect(Object.keys(basePolicy)[0]).toBe("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"); // Base mainnet
    expect(Object.keys(sepoliaPolicy)[0]).toBe("0x036CbD53842c5426634e7929541eC2318f3dCF7e"); // Base sepolia
    
    expect(Object.values(basePolicy)[0].limit?.amount).toBe("100000");
    expect(Object.values(sepoliaPolicy)[0].limit?.amount).toBe("100000");
  });
});

describe("validatePaymentAgainstPolicy", () => {
  it("should allow payments within policy limits", () => {
    const policy: WalletPolicy = {
      payments: {
        networks: {
          "base-sepolia": "$0.50"
        }
      }
    };
    
    const result = validatePaymentAgainstPolicy(
      "base-sepolia",
      "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      BigInt(100000), // 0.1 USDC
      policy
    );
    
    expect(result).toBe(true);
  });

  it("should reject payments exceeding policy limits", () => {
    const policy: WalletPolicy = {
      payments: {
        networks: {
          "base-sepolia": "$0.50"
        }
      }
    };
    
    const result = validatePaymentAgainstPolicy(
      "base-sepolia",
      "0x036CbD53842c5426634e7929541eC2318f3dCF7e", 
      BigInt(1000000), // 1.0 USDC
      policy
    );
    
    expect(result).toBe(false);
  });

  it("should reject payments to unsupported networks", () => {
    const policy: WalletPolicy = {
      payments: {
        networks: {
          "base-sepolia": "$0.50"
        }
      }
    };
    
    const result = validatePaymentAgainstPolicy(
      "ethereum",
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      BigInt(100000),
      policy
    );
    
    expect(result).toBe(false);
  });

  it("should handle explicit asset policies", () => {
    const policy: WalletPolicy = {
      payments: {
        networks: {
          "base-sepolia": {
            "0x036CbD53842c5426634e7929541eC2318f3dCF7e": {
              limit: {
                amount: "200000", // 0.2 USDC
                asset: {
                  address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as `0x${string}`,
                  decimals: 6,
                  eip712: {
                    name: "USD Coin",
                    version: "2"
                  }
                }
              }
            }
          }
        }
      }
    };
    
    // Within limit
    let result = validatePaymentAgainstPolicy(
      "base-sepolia",
      "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      BigInt(150000), // 0.15 USDC
      policy
    );
    expect(result).toBe(true);
    
    // Exceeding limit
    result = validatePaymentAgainstPolicy(
      "base-sepolia",
      "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      BigInt(250000), // 0.25 USDC  
      policy
    );
    expect(result).toBe(false);
  });

  it("should reject when policy has no payments", () => {
    const policy: WalletPolicy = {}; // Empty policy
    
    const result = validatePaymentAgainstPolicy(
      "base-sepolia",
      "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      BigInt(100000),
      policy
    );
    
    expect(result).toBe(false);
  });

  it("should reject when network policy is undefined", () => {
    const policy: WalletPolicy = {
      payments: {
        networks: {}
      }
    };
    
    const result = validatePaymentAgainstPolicy(
      "base-sepolia", 
      "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      BigInt(100000),
      policy
    );
    
    expect(result).toBe(false);
  });
});