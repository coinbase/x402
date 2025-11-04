import { describe, it, expect } from "vitest";
import { ed25519 } from "@noble/curves/ed25519";
import { decodeSignedDelegateActionB64, prettySDA } from "../src/facilitator/near/borsh";
import { signDelegateActionB64 } from "./near.fixture";

describe("NEP-366 encode/decode", () => {
  it("round-trips a SignedDelegateAction (ft_transfer, 1 yocto)", () => {
    const priv = ed25519.utils.randomSecretKey(); // test-only (32 bytes)
    const { sda_b64, pubkey32 } = signDelegateActionB64({
      sender_id: "alice.testnet",
      ft_contract: "usdc.testnet",
      receiver_id_in_args: "merchant.testnet",
      amount: "1000000", // 1.000000 (6 decimals)
      nonce: 42n,
      max_block_height: 9_999_999n,
      privKey32: priv,
      memo: "x402 payment",
    });

    const decoded = decodeSignedDelegateActionB64(sda_b64);
    expect(decoded.delegate_action.public_key.data).toEqual(pubkey32);
    const summary = prettySDA(decoded);
    expect(summary.actions).toEqual(["FunctionCall"]);
    expect(summary.functionCall?.methodName).toBe("ft_transfer");
    expect(summary.functionCall?.deposit).toBe("1"); // 1 yocto
  });
});
