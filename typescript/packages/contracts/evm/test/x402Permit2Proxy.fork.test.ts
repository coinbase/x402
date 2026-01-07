/**
 * Fork Tests for x402Permit2Proxy
 *
 * These tests run against a fork of Base Sepolia to test integration
 * with the real Permit2 contract and real signature verification.
 *
 * To run these tests:
 *   FORK_BASE_SEPOLIA=true pnpm test test/x402Permit2Proxy.fork.test.ts
 *
 * Or with a custom RPC:
 *   FORK_BASE_SEPOLIA=true BASE_SEPOLIA_RPC_URL=https://your-rpc.com pnpm test test/x402Permit2Proxy.fork.test.ts
 */

import { expect } from "chai";
import { ethers, network } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { createWalletClient, http, toHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, hardhat } from "viem/chains";
import type {
  X402Permit2Proxy,
  MockERC20,
} from "../dist-hardhat/typechain-types";

// Canonical Permit2 address (same on all EVM chains)
const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3" as const;

// Base Sepolia chain ID
const BASE_SEPOLIA_CHAIN_ID = 84532;

// Skip tests if not forking
const describeFork =
  process.env.FORK_BASE_SEPOLIA === "true" ? describe : describe.skip;

/**
 * Fork Tests for x402Permit2Proxy using viem for EIP-712 signature construction.
 * Viem correctly handles Permit2's witness signature format.
 */

describeFork("X402Permit2Proxy - Fork Tests (Base Sepolia)", function () {
  // Increase timeout for fork tests (network calls are slower)
  this.timeout(60000);

  async function deployOnForkFixture() {
    const [deployer, payer, recipient, facilitator] = await ethers.getSigners();

    // Verify we're on a fork with correct chain ID
    const chainId = (await ethers.provider.getNetwork()).chainId;
    if (chainId !== BigInt(BASE_SEPOLIA_CHAIN_ID)) {
      throw new Error(
        `Expected Base Sepolia fork (chainId ${BASE_SEPOLIA_CHAIN_ID}), got ${chainId}`,
      );
    }

    // Verify Permit2 exists on the fork
    const permit2Code = await ethers.provider.getCode(PERMIT2_ADDRESS);
    if (permit2Code === "0x") {
      throw new Error(
        "Permit2 not found on fork. Is the fork working correctly?",
      );
    }

    // Deploy our proxy pointing to real Permit2
    const proxyFactory = await ethers.getContractFactory("x402Permit2Proxy");
    const proxy = (await proxyFactory.deploy(
      PERMIT2_ADDRESS,
    )) as X402Permit2Proxy;
    const proxyAddress = await proxy.getAddress();

    // Deploy a test token (we can't easily get testnet USDC)
    const tokenFactory = await ethers.getContractFactory("MockERC20");
    const token = (await tokenFactory.deploy(
      "Test USD",
      "TUSD",
      6,
    )) as MockERC20;
    const tokenAddress = await token.getAddress();

    // Mint tokens to payer
    const mintAmount = ethers.parseUnits("10000", 6);
    await token.mint(payer.address, mintAmount);

    // Payer approves Permit2 (required for Permit2 to transfer)
    await token.connect(payer).approve(PERMIT2_ADDRESS, ethers.MaxUint256);

    const currentTime = BigInt(await time.latest());

    return {
      proxy,
      proxyAddress,
      token,
      tokenAddress,
      deployer,
      payer,
      recipient,
      facilitator,
      currentTime,
    };
  }

  /**
   * Generate a random nonce for Permit2
   * Permit2 uses a bitmap-based nonce system where each nonce can only be used once
   */
  function generateNonce(): bigint {
    // Use a random word position (0-255) and bit position (0-255)
    const wordPos = BigInt(Math.floor(Math.random() * 256));
    const bitPos = BigInt(Math.floor(Math.random() * 256));
    return (wordPos << 8n) | bitPos;
  }

  // Hardhat test accounts private keys (well-known test keys)
  const HARDHAT_PRIVATE_KEYS = [
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", // account 0
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", // account 1
    "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a", // account 2
    "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6", // account 3
  ] as const;

  /**
   * Create and sign a Permit2 witness transfer using viem
   * Viem correctly handles Permit2's EIP-712 witness format
   */
  async function signPermitWitnessTransfer(
    signerIndex: number,
    proxyAddress: string,
    tokenAddress: string,
    amount: bigint,
    nonce: bigint,
    deadline: bigint,
    witness: {
      to: string;
      validAfter: bigint;
      validBefore: bigint;
      extra: Hex;
    },
  ): Promise<Hex> {
    // Create viem account from private key
    const account = privateKeyToAccount(HARDHAT_PRIVATE_KEYS[signerIndex]);

    // Create wallet client connected to hardhat fork
    const walletClient = createWalletClient({
      account,
      chain: {
        ...baseSepolia,
        id: BASE_SEPOLIA_CHAIN_ID,
      },
      transport: http("http://127.0.0.1:8545"),
    });

    // EIP-712 types for Permit2 witness transfer
    // Order must match exactly what Permit2 expects
    const types = {
      PermitWitnessTransferFrom: [
        { name: "permitted", type: "TokenPermissions" },
        { name: "spender", type: "address" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
        { name: "witness", type: "Witness" },
      ],
      TokenPermissions: [
        { name: "token", type: "address" },
        { name: "amount", type: "uint256" },
      ],
      // Witness fields must match contract's WITNESS_TYPEHASH order:
      // "Witness(bytes extra,address to,uint256 validAfter,uint256 validBefore)"
      Witness: [
        { name: "extra", type: "bytes" },
        { name: "to", type: "address" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
      ],
    } as const;

    // Sign with viem
    const signature = await walletClient.signTypedData({
      account,
      domain: {
        name: "Permit2",
        chainId: BASE_SEPOLIA_CHAIN_ID,
        verifyingContract: PERMIT2_ADDRESS,
      },
      types,
      primaryType: "PermitWitnessTransferFrom",
      message: {
        permitted: {
          token: tokenAddress as Hex,
          amount: amount,
        },
        spender: proxyAddress as Hex,
        nonce: nonce,
        deadline: deadline,
        witness: {
          extra: witness.extra,
          to: witness.to as Hex,
          validAfter: witness.validAfter,
          validBefore: witness.validBefore,
        },
      },
    });

    return signature;
  }

  describe("Real Permit2 Integration", function () {
    it("should successfully settle with real Permit2 and valid signature", async function () {
      const {
        proxy,
        proxyAddress,
        token,
        tokenAddress,
        payer,
        recipient,
        currentTime,
      } = await loadFixture(deployOnForkFixture);

      const amount = ethers.parseUnits("100", 6);
      const nonce = generateNonce();
      const deadline = currentTime + 3600n;

      const witness = {
        to: recipient.address,
        validAfter: currentTime - 60n,
        validBefore: currentTime + 3600n,
        extra: "0x" as Hex,
      };

      // Sign with viem (payer is account index 1)
      const signature = await signPermitWitnessTransfer(
        1, // payer is second account (index 1)
        proxyAddress,
        tokenAddress,
        amount,
        nonce,
        deadline,
        witness,
      );

      const permit = {
        permitted: {
          token: tokenAddress,
          amount: amount,
        },
        nonce: nonce,
        deadline: deadline,
      };

      const witnessStruct = {
        to: witness.to,
        validAfter: witness.validAfter,
        validBefore: witness.validBefore,
        extra: witness.extra,
      };

      const recipientBalanceBefore = await token.balanceOf(recipient.address);

      // Execute settlement
      await expect(
        proxy.settle(permit, amount, payer.address, witnessStruct, signature),
      )
        .to.emit(proxy, "X402PermitTransfer")
        .withArgs(payer.address, recipient.address, amount, tokenAddress);

      const recipientBalanceAfter = await token.balanceOf(recipient.address);
      expect(recipientBalanceAfter - recipientBalanceBefore).to.equal(amount);
    });

    it("should reject invalid signature", async function () {
      const {
        proxy,
        proxyAddress,
        token,
        tokenAddress,
        payer,
        recipient,
        currentTime,
      } = await loadFixture(deployOnForkFixture);

      const amount = ethers.parseUnits("100", 6);
      const nonce = generateNonce();
      const deadline = currentTime + 3600n;

      const witness = {
        to: recipient.address,
        validAfter: currentTime - 60n,
        validBefore: currentTime + 3600n,
        extra: "0x",
      };

      // Create an invalid signature (random bytes)
      const invalidSignature = "0x" + "ab".repeat(65); // 65 bytes of garbage

      const permit = {
        permitted: {
          token: tokenAddress,
          amount: amount,
        },
        nonce: nonce,
        deadline: deadline,
      };

      const witnessStruct = {
        to: witness.to,
        validAfter: witness.validAfter,
        validBefore: witness.validBefore,
        extra: witness.extra,
      };

      // Should revert with Permit2's InvalidSigner or similar error
      await expect(
        proxy.settle(
          permit,
          amount,
          payer.address,
          witnessStruct,
          invalidSignature,
        ),
      ).to.be.reverted;
    });

    it("should reject signature from wrong signer", async function () {
      const {
        proxy,
        proxyAddress,
        token,
        tokenAddress,
        payer,
        recipient,
        facilitator,
        currentTime,
      } = await loadFixture(deployOnForkFixture);

      const amount = ethers.parseUnits("100", 6);
      const nonce = generateNonce();
      const deadline = currentTime + 3600n;

      const witness = {
        to: recipient.address,
        validAfter: currentTime - 60n,
        validBefore: currentTime + 3600n,
        extra: "0x" as Hex,
      };

      // Sign with facilitator (index 3) instead of payer (index 1)
      const wrongSignature = await signPermitWitnessTransfer(
        3, // facilitator - Wrong signer!
        proxyAddress,
        tokenAddress,
        amount,
        nonce,
        deadline,
        witness,
      );

      const permit = {
        permitted: {
          token: tokenAddress,
          amount: amount,
        },
        nonce: nonce,
        deadline: deadline,
      };

      const witnessStruct = {
        to: witness.to,
        validAfter: witness.validAfter,
        validBefore: witness.validBefore,
        extra: witness.extra,
      };

      // Should revert because signature doesn't match owner (payer)
      await expect(
        proxy.settle(
          permit,
          amount,
          payer.address,
          witnessStruct,
          wrongSignature,
        ),
      ).to.be.reverted;
    });

    it("should reject replayed nonce", async function () {
      const {
        proxy,
        proxyAddress,
        token,
        tokenAddress,
        payer,
        recipient,
        currentTime,
      } = await loadFixture(deployOnForkFixture);

      const amount = ethers.parseUnits("50", 6);
      const nonce = generateNonce();
      const deadline = currentTime + 3600n;

      const witness = {
        to: recipient.address,
        validAfter: currentTime - 60n,
        validBefore: currentTime + 3600n,
        extra: "0x" as Hex,
      };

      const signature = await signPermitWitnessTransfer(
        1, // payer
        proxyAddress,
        tokenAddress,
        amount,
        nonce,
        deadline,
        witness,
      );

      const permit = {
        permitted: {
          token: tokenAddress,
          amount: amount,
        },
        nonce: nonce,
        deadline: deadline,
      };

      const witnessStruct = {
        to: witness.to,
        validAfter: witness.validAfter,
        validBefore: witness.validBefore,
        extra: witness.extra,
      };

      // First call should succeed
      await proxy.settle(
        permit,
        amount,
        payer.address,
        witnessStruct,
        signature,
      );

      // Second call with same nonce should fail
      await expect(
        proxy.settle(permit, amount, payer.address, witnessStruct, signature),
      ).to.be.reverted;
    });

    it("should reject expired permit deadline", async function () {
      const {
        proxy,
        proxyAddress,
        token,
        tokenAddress,
        payer,
        recipient,
        currentTime,
      } = await loadFixture(deployOnForkFixture);

      const amount = ethers.parseUnits("100", 6);
      const nonce = generateNonce();
      const deadline = currentTime - 60n; // Already expired!

      const witness = {
        to: recipient.address,
        validAfter: currentTime - 120n,
        validBefore: currentTime + 3600n,
        extra: "0x" as Hex,
      };

      const signature = await signPermitWitnessTransfer(
        1, // payer
        proxyAddress,
        tokenAddress,
        amount,
        nonce,
        deadline,
        witness,
      );

      const permit = {
        permitted: {
          token: tokenAddress,
          amount: amount,
        },
        nonce: nonce,
        deadline: deadline,
      };

      const witnessStruct = {
        to: witness.to,
        validAfter: witness.validAfter,
        validBefore: witness.validBefore,
        extra: witness.extra,
      };

      // Should revert due to expired deadline
      await expect(
        proxy.settle(permit, amount, payer.address, witnessStruct, signature),
      ).to.be.reverted;
    });

    it("should handle partial amounts correctly", async function () {
      const {
        proxy,
        proxyAddress,
        token,
        tokenAddress,
        payer,
        recipient,
        currentTime,
      } = await loadFixture(deployOnForkFixture);

      const permittedAmount = ethers.parseUnits("100", 6);
      const requestedAmount = ethers.parseUnits("50", 6); // Less than permitted
      const nonce = generateNonce();
      const deadline = currentTime + 3600n;

      const witness = {
        to: recipient.address,
        validAfter: currentTime - 60n,
        validBefore: currentTime + 3600n,
        extra: "0x" as Hex,
      };

      const signature = await signPermitWitnessTransfer(
        1, // payer
        proxyAddress,
        tokenAddress,
        permittedAmount,
        nonce,
        deadline,
        witness,
      );

      const permit = {
        permitted: {
          token: tokenAddress,
          amount: permittedAmount,
        },
        nonce: nonce,
        deadline: deadline,
      };

      const witnessStruct = {
        to: witness.to,
        validAfter: witness.validAfter,
        validBefore: witness.validBefore,
        extra: witness.extra,
      };

      const recipientBalanceBefore = await token.balanceOf(recipient.address);

      // Request less than permitted amount
      await proxy.settle(
        permit,
        requestedAmount,
        payer.address,
        witnessStruct,
        signature,
      );

      const recipientBalanceAfter = await token.balanceOf(recipient.address);
      expect(recipientBalanceAfter - recipientBalanceBefore).to.equal(
        requestedAmount,
      );
    });

    it("should enforce witness.extra in signature", async function () {
      const {
        proxy,
        proxyAddress,
        token,
        tokenAddress,
        payer,
        recipient,
        currentTime,
      } = await loadFixture(deployOnForkFixture);

      const amount = ethers.parseUnits("100", 6);
      const nonce = generateNonce();
      const deadline = currentTime + 3600n;

      // Sign with specific extra data
      const signedWitness = {
        to: recipient.address,
        validAfter: currentTime - 60n,
        validBefore: currentTime + 3600n,
        extra: "0xdeadbeef" as Hex,
      };

      const signature = await signPermitWitnessTransfer(
        1, // payer
        proxyAddress,
        tokenAddress,
        amount,
        nonce,
        deadline,
        signedWitness,
      );

      const permit = {
        permitted: {
          token: tokenAddress,
          amount: amount,
        },
        nonce: nonce,
        deadline: deadline,
      };

      // Try to use different extra data
      const tamperedWitness = {
        to: signedWitness.to,
        validAfter: signedWitness.validAfter,
        validBefore: signedWitness.validBefore,
        extra: "0xcafebabe", // Different!
      };

      // Should fail because witness hash doesn't match signature
      await expect(
        proxy.settle(permit, amount, payer.address, tamperedWitness, signature),
      ).to.be.reverted;
    });

    it("should prevent destination tampering via witness hash", async function () {
      const {
        proxy,
        proxyAddress,
        token,
        tokenAddress,
        payer,
        recipient,
        facilitator,
        currentTime,
      } = await loadFixture(deployOnForkFixture);

      const amount = ethers.parseUnits("100", 6);
      const nonce = generateNonce();
      const deadline = currentTime + 3600n;

      // Sign with recipient as destination
      const signedWitness = {
        to: recipient.address,
        validAfter: currentTime - 60n,
        validBefore: currentTime + 3600n,
        extra: "0x" as Hex,
      };

      const signature = await signPermitWitnessTransfer(
        1, // payer
        proxyAddress,
        tokenAddress,
        amount,
        nonce,
        deadline,
        signedWitness,
      );

      const permit = {
        permitted: {
          token: tokenAddress,
          amount: amount,
        },
        nonce: nonce,
        deadline: deadline,
      };

      // Facilitator tries to redirect funds to themselves
      const tamperedWitness = {
        to: facilitator.address, // Trying to steal funds!
        validAfter: signedWitness.validAfter,
        validBefore: signedWitness.validBefore,
        extra: signedWitness.extra,
      };

      // Should fail because witness hash doesn't match signature
      await expect(
        proxy
          .connect(facilitator)
          .settle(permit, amount, payer.address, tamperedWitness, signature),
      ).to.be.reverted;
    });
  });

  describe("Multiple Settlements on Fork", function () {
    it("should handle multiple settlements with different nonces", async function () {
      const {
        proxy,
        proxyAddress,
        token,
        tokenAddress,
        payer,
        recipient,
        currentTime,
      } = await loadFixture(deployOnForkFixture);

      const amount = ethers.parseUnits("25", 6);

      for (let i = 0; i < 3; i++) {
        const nonce = generateNonce();
        const deadline = currentTime + 3600n;

        const witness = {
          to: recipient.address,
          validAfter: currentTime - 60n,
          validBefore: currentTime + 3600n,
          extra: ("0x" + i.toString(16).padStart(2, "0")) as Hex,
        };

        const signature = await signPermitWitnessTransfer(
          1, // payer
          proxyAddress,
          tokenAddress,
          amount,
          nonce,
          deadline,
          witness,
        );

        const permit = {
          permitted: {
            token: tokenAddress,
            amount: amount,
          },
          nonce: nonce,
          deadline: deadline,
        };

        const witnessStruct = {
          to: witness.to,
          validAfter: witness.validAfter,
          validBefore: witness.validBefore,
          extra: witness.extra,
        };

        await expect(
          proxy.settle(permit, amount, payer.address, witnessStruct, signature),
        ).to.emit(proxy, "X402PermitTransfer");
      }

      // Verify total transferred
      const recipientBalance = await token.balanceOf(recipient.address);
      expect(recipientBalance).to.equal(amount * 3n);
    });
  });
});
