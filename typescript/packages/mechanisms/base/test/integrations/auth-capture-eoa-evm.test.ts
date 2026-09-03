import { describe, expect, it } from "vitest";
import type { PaymentRequirements } from "@x402/core/types";
import {
  AUTH_CAPTURE_ESCROW_ADDRESS,
  EIP3009_TOKEN_COLLECTOR_ADDRESS,
  PERMIT2_TOKEN_COLLECTOR_ADDRESS,
  PERMIT2_ADDRESS,
} from "@x402/evm";
import { BaseScheme as BaseAuthCaptureClient } from "../../src/auth-capture/client/scheme";
import { privateKeyToAccount } from "viem/accounts";
import { recoverTypedDataAddress, keccak256, encodeAbiParameters, zeroAddress } from "viem";

// Load private key from environment
const CLIENT_PRIVATE_KEY = process.env.CLIENT_PRIVATE_KEY as `0x${string}` | undefined;

const HAS_KEYS = Boolean(CLIENT_PRIVATE_KEY);
const describeOnChain = HAS_KEYS ? describe : describe.skip;

if (!HAS_KEYS) {
  console.warn(
    "[auth-capture-eoa-evm.test.ts] Skipping on-chain tests: CLIENT_PRIVATE_KEY env var is required.",
  );
}

/**
 * These tests use a real signer (from env) and the real, unmocked
 * `@x402/evm` `AuthCaptureEvmScheme` (via `@x402/base`'s pass-through wrapper) to
 * sign real EIP-712 payloads, then independently recover the signer address
 * from the signature using `viem`'s pure `recoverTypedDataAddress` - no RPC or
 * on-chain state required.
 *
 * `@x402/evm` ships the auth-capture client only today (no server/facilitator
 * to verify/settle against - see `src/auth-capture/README.md`), so unlike the
 * exact/upto integration tests this suite cannot exercise a full
 * client -> server -> facilitator round trip. It instead validates the one
 * real thing there is to validate end-to-end: that the signed wire payload
 * is cryptographically valid for the real EIP-712 domain/types the escrow
 * contract expects.
 */
describeOnChain("Base AuthCapture Integration Tests", () => {
  // Well-known standardized EIP-712 type structs (public spec, not exported by
  // @x402/evm) - see EIP-3009 (ReceiveWithAuthorization) and Uniswap Permit2
  // (PermitTransferFrom).
  const RECEIVE_AUTHORIZATION_TYPES = {
    ReceiveWithAuthorization: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
    ],
  } as const;

  const PERMIT2_TRANSFER_FROM_TYPES = {
    PermitTransferFrom: [
      { name: "permitted", type: "TokenPermissions" },
      { name: "spender", type: "address" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
    TokenPermissions: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
    ],
  } as const;

  // Mirrors AuthCaptureEscrow.PAYMENT_INFO_TYPEHASH so this test can
  // independently recompute the payer-agnostic nonce the client signs over.
  const PAYMENT_INFO_TYPEHASH = keccak256(
    new TextEncoder().encode(
      "PaymentInfo(address operator,address payer,address receiver,address token,uint120 maxAmount,uint48 preApprovalExpiry,uint48 authorizationExpiry,uint48 refundExpiry,uint16 minFeeBps,uint16 maxFeeBps,address feeReceiver,uint256 salt)",
    ),
  );

  /**
   * Independently recomputes the payer-agnostic PaymentInfo hash the same way
   * `AuthCaptureEscrow.getHash` does (with `payer` zeroed), so this test can
   * verify the client's signature without depending on `@x402/evm`'s internal
   * (non-exported) nonce helpers.
   *
   * @param chainId - EVM chain id binding the hash to a specific chain
   * @param paymentInfo - The canonical, reconstructed PaymentInfo struct
   * @returns The 32-byte payer-agnostic hash
   */
  function computePayerAgnosticHash(
    chainId: number,
    paymentInfo: {
      operator: `0x${string}`;
      receiver: `0x${string}`;
      token: `0x${string}`;
      maxAmount: string;
      preApprovalExpiry: number;
      authorizationExpiry: number;
      refundExpiry: number;
      minFeeBps: number;
      maxFeeBps: number;
      feeReceiver: `0x${string}`;
      salt: `0x${string}`;
    },
  ): `0x${string}` {
    const paymentInfoHash = keccak256(
      encodeAbiParameters(
        [
          { name: "typehash", type: "bytes32" },
          { name: "operator", type: "address" },
          { name: "payer", type: "address" },
          { name: "receiver", type: "address" },
          { name: "token", type: "address" },
          { name: "maxAmount", type: "uint120" },
          { name: "preApprovalExpiry", type: "uint48" },
          { name: "authorizationExpiry", type: "uint48" },
          { name: "refundExpiry", type: "uint48" },
          { name: "minFeeBps", type: "uint16" },
          { name: "maxFeeBps", type: "uint16" },
          { name: "feeReceiver", type: "address" },
          { name: "salt", type: "uint256" },
        ],
        [
          PAYMENT_INFO_TYPEHASH,
          paymentInfo.operator,
          zeroAddress,
          paymentInfo.receiver,
          paymentInfo.token,
          BigInt(paymentInfo.maxAmount),
          paymentInfo.preApprovalExpiry,
          paymentInfo.authorizationExpiry,
          paymentInfo.refundExpiry,
          paymentInfo.minFeeBps,
          paymentInfo.maxFeeBps,
          paymentInfo.feeReceiver,
          BigInt(paymentInfo.salt),
        ],
      ),
    );
    return keccak256(
      encodeAbiParameters(
        [
          { name: "chainId", type: "uint256" },
          { name: "escrow", type: "address" },
          { name: "paymentInfoHash", type: "bytes32" },
        ],
        [BigInt(chainId), AUTH_CAPTURE_ESCROW_ADDRESS, paymentInfoHash],
      ),
    );
  }

  const clientAccount = privateKeyToAccount(CLIENT_PRIVATE_KEY!);
  const client = new BaseAuthCaptureClient(clientAccount);

  const captureAuthorizer = "0x1234567890123456789012345678901234567890" as const;
  const feeRecipient = "0x1234567890123456789012345678901234567890" as const;
  const payTo = "0x9876543210987654321098765432109876543210" as const;

  function buildRequirements(overrides: Record<string, unknown> = {}): PaymentRequirements {
    return {
      scheme: "auth-capture",
      network: "eip155:84532", // Base Sepolia
      asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base Sepolia USDC
      amount: "1000000", // 1.00 USDC max authorized
      payTo,
      maxTimeoutSeconds: 3600,
      extra: {
        name: "USDC",
        version: "2",
        captureAuthorizer,
        feeRecipient,
        captureDeadline: Math.floor(Date.now() / 1000) + 3600,
        refundDeadline: Math.floor(Date.now() / 1000) + 7200,
        minFeeBps: 0,
        maxFeeBps: 100,
        ...overrides,
      },
    };
  }

  it("signs a valid EIP-3009 ReceiveWithAuthorization payload (default transfer method)", async () => {
    const requirements = buildRequirements();
    const result = await client.createPaymentPayload(2, requirements);

    const payload = result.payload as {
      authorization: {
        from: `0x${string}`;
        to: `0x${string}`;
        value: string;
        validAfter: string;
        validBefore: string;
        nonce: `0x${string}`;
      };
      signature: `0x${string}`;
      salt: `0x${string}`;
    };

    expect(payload.authorization.from).toBe(clientAccount.address);
    expect(payload.authorization.to).toBe(EIP3009_TOKEN_COLLECTOR_ADDRESS);

    // Independently recompute the payer-agnostic nonce and confirm it matches
    // what the client signed - proves the wrapper didn't alter the PaymentInfo
    // derivation on its way through `@x402/base`.
    const expectedNonce = computePayerAgnosticHash(84532, {
      operator: captureAuthorizer,
      receiver: payTo,
      token: requirements.asset as `0x${string}`,
      maxAmount: requirements.amount,
      preApprovalExpiry: payload.authorization.validBefore
        ? Number(payload.authorization.validBefore)
        : 0,
      authorizationExpiry: requirements.extra.captureDeadline as number,
      refundExpiry: requirements.extra.refundDeadline as number,
      minFeeBps: requirements.extra.minFeeBps as number,
      maxFeeBps: requirements.extra.maxFeeBps as number,
      feeReceiver: feeRecipient,
      salt: payload.salt,
    });
    expect(payload.authorization.nonce).toBe(expectedNonce);

    // Recover the signer address from the signature over the real EIP-712
    // domain the escrow's EIP3009 token collector expects - proves the
    // signature is cryptographically valid, without needing a facilitator.
    const recovered = await recoverTypedDataAddress({
      domain: {
        name: "USDC",
        version: "2",
        chainId: 84532,
        verifyingContract: requirements.asset as `0x${string}`,
      },
      types: RECEIVE_AUTHORIZATION_TYPES,
      primaryType: "ReceiveWithAuthorization",
      message: {
        from: payload.authorization.from,
        to: payload.authorization.to,
        value: BigInt(payload.authorization.value),
        validAfter: BigInt(payload.authorization.validAfter),
        validBefore: BigInt(payload.authorization.validBefore),
        nonce: payload.authorization.nonce,
      },
      signature: payload.signature,
    });
    expect(recovered).toBe(clientAccount.address);
  });

  it("signs a valid Permit2 PermitTransferFrom payload (assetTransferMethod: permit2)", async () => {
    const requirements = buildRequirements({ assetTransferMethod: "permit2" });
    const result = await client.createPaymentPayload(2, requirements);

    const payload = result.payload as {
      permit2Authorization: {
        from: `0x${string}`;
        permitted: { token: `0x${string}`; amount: string };
        spender: `0x${string}`;
        nonce: string;
        deadline: string;
      };
      signature: `0x${string}`;
    };

    expect(payload.permit2Authorization.from).toBe(clientAccount.address);
    expect(payload.permit2Authorization.spender).toBe(PERMIT2_TOKEN_COLLECTOR_ADDRESS);

    const recovered = await recoverTypedDataAddress({
      domain: {
        name: "Permit2",
        chainId: 84532,
        verifyingContract: PERMIT2_ADDRESS,
      },
      types: PERMIT2_TRANSFER_FROM_TYPES,
      primaryType: "PermitTransferFrom",
      message: {
        permitted: {
          token: payload.permit2Authorization.permitted.token,
          amount: BigInt(payload.permit2Authorization.permitted.amount),
        },
        spender: payload.permit2Authorization.spender,
        nonce: BigInt(payload.permit2Authorization.nonce),
        deadline: BigInt(payload.permit2Authorization.deadline),
      },
      signature: payload.signature,
    });
    expect(recovered).toBe(clientAccount.address);
  });

  it("emits a bound salt + saltNonce when receiverAuthorizer is set (salt binding on)", async () => {
    const receiverAuthorizer = "0x1111111111111111111111111111111111111111" as const;
    const requirements = buildRequirements({ receiverAuthorizer });
    const result = await client.createPaymentPayload(2, requirements);

    const payload = result.payload as { salt: `0x${string}`; saltNonce?: `0x${string}` };
    expect(payload.saltNonce).toBeDefined();
    expect(payload.salt).toBeDefined();
  });

  it("emits an unbound (random) salt with no saltNonce when salt binding is off", async () => {
    const requirements = buildRequirements();
    const result = await client.createPaymentPayload(2, requirements);

    const payload = result.payload as { salt: `0x${string}`; saltNonce?: `0x${string}` };
    expect(payload.salt).toBeDefined();
    expect(payload.saltNonce).toBeUndefined();
  });
});
