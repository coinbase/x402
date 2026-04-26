import { describe, it, expect, vi } from "vitest";
import { encodeAbiParameters } from "viem";
import { multicall, MULTICALL3_ADDRESS } from "../../src/multicall";

describe("multicall", () => {
  describe("MULTICALL3_ADDRESS", () => {
    it("should be the canonical Multicall3 address", () => {
      expect(MULTICALL3_ADDRESS).toBe("0xcA11bde05977b3631167028862bE2a173976CA11");
    });
  });

  describe("multicall()", () => {
    // Minimal ERC-20 balanceOf ABI for testing
    const balanceOfABI = [
      {
        name: "balanceOf",
        inputs: [{ name: "account", type: "address" }],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function",
      },
    ] as const;

    it("should return an empty array when no calls are provided", async () => {
      const mockReadContract = vi.fn().mockResolvedValue([]);
      const result = await multicall(mockReadContract, []);
      expect(result).toEqual([]);
    });

    it("should call readContract with the Multicall3 address", async () => {
      const encodedResult = encodeAbiParameters([{ type: "uint256" }], [BigInt(0)]);
      const mockReadContract = vi
        .fn()
        .mockResolvedValue([{ success: true, returnData: encodedResult }]);

      await multicall(mockReadContract, [
        {
          address: "0x1234567890123456789012345678901234567890",
          abi: balanceOfABI,
          functionName: "balanceOf",
          args: ["0x0000000000000000000000000000000000000001"],
        },
      ]);

      expect(mockReadContract).toHaveBeenCalledOnce();
      expect(mockReadContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: MULTICALL3_ADDRESS,
          functionName: "tryAggregate",
        }),
      );
    });

    it("should pass requireSuccess=false to tryAggregate", async () => {
      const mockReadContract = vi.fn().mockResolvedValue([]);
      await multicall(mockReadContract, []);
      expect(mockReadContract).toHaveBeenCalledWith(expect.objectContaining({ args: [false, []] }));
    });

    it("should decode a successful ContractCall result", async () => {
      const expectedBalance = BigInt(1_000_000);
      const encodedBalance = encodeAbiParameters([{ type: "uint256" }], [expectedBalance]);

      const mockReadContract = vi
        .fn()
        .mockResolvedValue([{ success: true, returnData: encodedBalance }]);

      const result = await multicall(mockReadContract, [
        {
          address: "0x1234567890123456789012345678901234567890",
          abi: balanceOfABI,
          functionName: "balanceOf",
          args: ["0x0000000000000000000000000000000000000001"],
        },
      ]);

      expect(result).toHaveLength(1);
      expect(result[0]!.status).toBe("success");
      expect((result[0] as { status: "success"; result: unknown }).result).toBe(expectedBalance);
    });

    it("should return failure when a ContractCall reverts", async () => {
      const mockReadContract = vi.fn().mockResolvedValue([{ success: false, returnData: "0x" }]);

      const result = await multicall(mockReadContract, [
        {
          address: "0x1234567890123456789012345678901234567890",
          abi: balanceOfABI,
          functionName: "balanceOf",
          args: ["0x0000000000000000000000000000000000000001"],
        },
      ]);

      expect(result).toHaveLength(1);
      expect(result[0]!.status).toBe("failure");
      const failure = result[0] as { status: "failure"; error: Error };
      expect(failure.error).toBeInstanceOf(Error);
      expect(failure.error.message).toContain("multicall: call reverted");
    });

    it("should include returnData in the revert error message", async () => {
      const mockReadContract = vi
        .fn()
        .mockResolvedValue([{ success: false, returnData: "0xdeadbeef" }]);

      const result = await multicall(mockReadContract, [
        {
          address: "0x1234567890123456789012345678901234567890",
          callData: "0xabcdef12",
        },
      ]);

      const failure = result[0] as { status: "failure"; error: Error };
      expect(failure.error.message).toContain("0xdeadbeef");
    });

    it("should return success with undefined result for a successful RawContractCall", async () => {
      const mockReadContract = vi.fn().mockResolvedValue([{ success: true, returnData: "0x" }]);

      const result = await multicall(mockReadContract, [
        {
          address: "0x1234567890123456789012345678901234567890",
          callData: "0xdeadbeef",
        },
      ]);

      expect(result).toHaveLength(1);
      expect(result[0]!.status).toBe("success");
      expect((result[0] as { status: "success"; result: unknown }).result).toBeUndefined();
    });

    it("should return failure for a reverting RawContractCall", async () => {
      const mockReadContract = vi
        .fn()
        .mockResolvedValue([{ success: false, returnData: "0x08c379a0" }]);

      const result = await multicall(mockReadContract, [
        {
          address: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
          callData: "0xcafebabe",
        },
      ]);

      expect(result).toHaveLength(1);
      expect(result[0]!.status).toBe("failure");
    });

    it("should handle a mix of ContractCall and RawContractCall entries", async () => {
      const expectedBalance = BigInt(500);
      const encodedBalance = encodeAbiParameters([{ type: "uint256" }], [expectedBalance]);

      const mockReadContract = vi.fn().mockResolvedValue([
        { success: true, returnData: encodedBalance }, // ContractCall — success
        { success: true, returnData: "0x" }, // RawContractCall — success
        { success: false, returnData: "0x" }, // ContractCall — failure
      ]);

      const result = await multicall(mockReadContract, [
        {
          address: "0x1111111111111111111111111111111111111111",
          abi: balanceOfABI,
          functionName: "balanceOf",
          args: ["0x0000000000000000000000000000000000000001"],
        },
        {
          address: "0x2222222222222222222222222222222222222222",
          callData: "0xabcdef01",
        },
        {
          address: "0x3333333333333333333333333333333333333333",
          abi: balanceOfABI,
          functionName: "balanceOf",
          args: ["0x0000000000000000000000000000000000000002"],
        },
      ]);

      expect(result).toHaveLength(3);
      expect(result[0]!.status).toBe("success");
      expect((result[0] as { status: "success"; result: unknown }).result).toBe(expectedBalance);
      expect(result[1]!.status).toBe("success");
      expect((result[1] as { status: "success"; result: unknown }).result).toBeUndefined();
      expect(result[2]!.status).toBe("failure");
    });

    it("should return failure when ABI decoding throws on malformed returnData", async () => {
      // 0x00 is too short to decode a uint256 (32 bytes required)
      const mockReadContract = vi.fn().mockResolvedValue([{ success: true, returnData: "0x00" }]);

      const result = await multicall(mockReadContract, [
        {
          address: "0x1234567890123456789012345678901234567890",
          abi: balanceOfABI,
          functionName: "balanceOf",
          args: ["0x0000000000000000000000000000000000000001"],
        },
      ]);

      expect(result).toHaveLength(1);
      expect(result[0]!.status).toBe("failure");
    });

    it("should encode ContractCall callData and pass target address in tryAggregate args", async () => {
      const encodedResult = encodeAbiParameters([{ type: "uint256" }], [BigInt(0)]);
      const mockReadContract = vi
        .fn()
        .mockResolvedValue([{ success: true, returnData: encodedResult }]);

      const targetAddress = "0x1234567890123456789012345678901234567890" as const;

      await multicall(mockReadContract, [
        {
          address: targetAddress,
          abi: balanceOfABI,
          functionName: "balanceOf",
          args: ["0x0000000000000000000000000000000000000001"],
        },
      ]);

      const callArgs = mockReadContract.mock.calls[0]![0].args as [
        boolean,
        { target: string; callData: string }[],
      ];
      expect(callArgs[0]).toBe(false);
      expect(callArgs[1]).toHaveLength(1);
      expect(callArgs[1][0]!.target).toBe(targetAddress);
      expect(callArgs[1][0]!.callData).toMatch(/^0x/);
    });

    it("should pass RawContractCall.callData verbatim without re-encoding", async () => {
      const mockReadContract = vi.fn().mockResolvedValue([{ success: true, returnData: "0x" }]);

      const rawCallData = "0xdeadbeef12345678" as const;

      await multicall(mockReadContract, [
        {
          address: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
          callData: rawCallData,
        },
      ]);

      const callArgs = mockReadContract.mock.calls[0]![0].args as [
        boolean,
        { target: string; callData: string }[],
      ];
      expect(callArgs[1][0]!.callData).toBe(rawCallData);
    });

    it("should preserve result ordering across multiple successful calls", async () => {
      const balance1 = BigInt(111);
      const balance2 = BigInt(222);
      const balance3 = BigInt(333);

      const mockReadContract = vi.fn().mockResolvedValue([
        { success: true, returnData: encodeAbiParameters([{ type: "uint256" }], [balance1]) },
        { success: true, returnData: encodeAbiParameters([{ type: "uint256" }], [balance2]) },
        { success: true, returnData: encodeAbiParameters([{ type: "uint256" }], [balance3]) },
      ]);

      const result = await multicall(mockReadContract, [
        {
          address: "0x1111111111111111111111111111111111111111",
          abi: balanceOfABI,
          functionName: "balanceOf",
          args: ["0x0000000000000000000000000000000000000001"],
        },
        {
          address: "0x2222222222222222222222222222222222222222",
          abi: balanceOfABI,
          functionName: "balanceOf",
          args: ["0x0000000000000000000000000000000000000002"],
        },
        {
          address: "0x3333333333333333333333333333333333333333",
          abi: balanceOfABI,
          functionName: "balanceOf",
          args: ["0x0000000000000000000000000000000000000003"],
        },
      ]);

      expect(result).toHaveLength(3);
      expect((result[0] as { status: "success"; result: unknown }).result).toBe(balance1);
      expect((result[1] as { status: "success"; result: unknown }).result).toBe(balance2);
      expect((result[2] as { status: "success"; result: unknown }).result).toBe(balance3);
    });
  });
});
