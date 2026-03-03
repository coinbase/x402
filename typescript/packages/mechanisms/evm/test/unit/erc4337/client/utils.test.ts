import { describe, it, expect } from "vitest";
import { buildERC20TransferCallData } from "../../../../src/exact/client/erc4337/utils/callData";
import { userOpToJson } from "../../../../src/exact/client/erc4337/utils/userOperation";

describe("buildERC20TransferCallData", () => {
  it("should build valid call data", () => {
    const token = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as `0x${string}`;
    const to = "0x1234567890123456789012345678901234567890" as `0x${string}`;
    const amount = 1000000n;

    const callData = buildERC20TransferCallData(token, to, amount);
    expect(callData).toBeDefined();
    expect(callData.startsWith("0x")).toBe(true);
    // transfer(address,uint256) selector is 0xa9059cbb
    expect(callData.startsWith("0xa9059cbb")).toBe(true);
  });

  it("should produce deterministic output", () => {
    const token = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as `0x${string}`;
    const to = "0x1234567890123456789012345678901234567890" as `0x${string}`;
    const amount = 1000000n;

    const cd1 = buildERC20TransferCallData(token, to, amount);
    const cd2 = buildERC20TransferCallData(token, to, amount);
    expect(cd1).toBe(cd2);
  });

  it("should produce different call data for different amounts", () => {
    const token = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as `0x${string}`;
    const to = "0x1234567890123456789012345678901234567890" as `0x${string}`;

    const cd1 = buildERC20TransferCallData(token, to, 1000000n);
    const cd2 = buildERC20TransferCallData(token, to, 2000000n);
    expect(cd1).not.toBe(cd2);
  });
});

describe("userOpToJson", () => {
  it("should convert bigint values to hex", () => {
    const userOp = {
      sender: "0x1234567890123456789012345678901234567890",
      nonce: 0n,
      callData: "0xdeadbeef",
      callGasLimit: 100000n,
      verificationGasLimit: 200000n,
      preVerificationGas: 50000n,
      maxFeePerGas: 1000000000n,
      maxPriorityFeePerGas: 500000000n,
      signature: "0xabcdef",
    };

    const json = userOpToJson(userOp);
    expect(json.sender).toBe("0x1234567890123456789012345678901234567890");
    expect(json.nonce).toBe("0x0");
    expect(json.callData).toBe("0xdeadbeef");
    expect(json.callGasLimit).toBe("0x186a0");
    expect(json.verificationGasLimit).toBe("0x30d40");
    expect(json.preVerificationGas).toBe("0xc350");
    expect(json.maxFeePerGas).toBe("0x3b9aca00");
    expect(json.maxPriorityFeePerGas).toBe("0x1dcd6500");
    expect(json.signature).toBe("0xabcdef");
  });

  it("should skip the account field", () => {
    const userOp = {
      sender: "0x1234",
      nonce: 0n,
      callData: "0x",
      callGasLimit: 100n,
      verificationGasLimit: 100n,
      preVerificationGas: 100n,
      maxFeePerGas: 100n,
      maxPriorityFeePerGas: 100n,
      signature: "0x",
      account: { address: "0x5678" }, // should be skipped
    };

    const json = userOpToJson(userOp);
    expect(json.account).toBeUndefined();
  });

  it("should handle optional paymaster fields", () => {
    const userOp = {
      sender: "0x1234",
      nonce: 0n,
      callData: "0x",
      callGasLimit: 100n,
      verificationGasLimit: 100n,
      preVerificationGas: 100n,
      maxFeePerGas: 100n,
      maxPriorityFeePerGas: 100n,
      signature: "0x",
      paymaster: "0xpaymaster",
      paymasterData: "0xdata",
      paymasterVerificationGasLimit: 50000n,
      paymasterPostOpGasLimit: 30000n,
    };

    const json = userOpToJson(userOp);
    expect(json.paymaster).toBe("0xpaymaster");
    expect(json.paymasterData).toBe("0xdata");
    expect(json.paymasterVerificationGasLimit).toBe("0xc350");
    expect(json.paymasterPostOpGasLimit).toBe("0x7530");
  });

  it("should handle nested object containing bigints", () => {
    const userOp = {
      sender: "0x1234",
      nonce: 0n,
      callData: "0x",
      callGasLimit: 100n,
      verificationGasLimit: 100n,
      preVerificationGas: 100n,
      maxFeePerGas: 100n,
      maxPriorityFeePerGas: 100n,
      signature: "0x",
      customNested: {
        innerBigint: 42n,
        innerString: "hello",
        innerNumber: 123,
      },
    };

    const json = userOpToJson(userOp);
    expect(json.customNested).toEqual({
      innerBigint: "0x2a",
      innerString: "hello",
      innerNumber: 123,
    });
  });

  it("should handle empty input", () => {
    const json = userOpToJson({});
    expect(json).toEqual({});
  });

  it("should produce '0x0' for toRpcHex(0n) via nonce field", () => {
    const userOp = {
      sender: "0x1234",
      nonce: 0n,
      callData: "0x",
      callGasLimit: 0n,
      verificationGasLimit: 0n,
      preVerificationGas: 0n,
      maxFeePerGas: 0n,
      maxPriorityFeePerGas: 0n,
      signature: "0x",
    };

    const json = userOpToJson(userOp);
    expect(json.nonce).toBe("0x0");
    expect(json.callGasLimit).toBe("0x0");
    expect(json.verificationGasLimit).toBe("0x0");
    expect(json.preVerificationGas).toBe("0x0");
    expect(json.maxFeePerGas).toBe("0x0");
    expect(json.maxPriorityFeePerGas).toBe("0x0");
  });
});
