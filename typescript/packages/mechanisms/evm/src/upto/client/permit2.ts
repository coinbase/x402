import { PaymentRequirements, PaymentPayloadResult } from "@x402/core/types";
import { getAddress } from "viem";
import { permit2WitnessTypes, PERMIT2_ADDRESS, x402UptoPermit2ProxyAddress } from "../../constants";
import { ClientEvmSigner } from "../../signer";
import { Permit2Authorization } from "../../types";
import { createPermit2Nonce, getEvmChainId } from "../../utils";

// Re-export Permit2-generic approval helpers
export { createPermit2ApprovalTx, getPermit2AllowanceReadParams } from "../../exact/client/permit2";
export type { Permit2AllowanceParams } from "../../exact/client/permit2";

/**
 * Creates a Permit2 payload for the upto payment scheme.
 * Uses x402UptoPermit2Proxy as the spender, which enforces that funds
 * can only be sent to the witness.to address.
 *
 * The `permitted.amount` represents the **maximum** amount authorized.
 * Actual settlement amount is determined by the server and may be less.
 *
 * @param signer - The EVM signer for client operations
 * @param x402Version - The x402 protocol version
 * @param paymentRequirements - The payment requirements (amount = maximum authorized)
 * @returns Promise resolving to a payment payload result
 */
export async function createUptoPermit2Payload(
  signer: ClientEvmSigner,
  x402Version: number,
  paymentRequirements: PaymentRequirements,
): Promise<PaymentPayloadResult> {
  const now = Math.floor(Date.now() / 1000);
  const nonce = createPermit2Nonce();

  // Lower time bound - allow some clock skew
  const validAfter = (now - 600).toString();
  // Upper time bound is enforced by Permit2's deadline field
  const deadline = (now + paymentRequirements.maxTimeoutSeconds).toString();

  const permit2Authorization: Permit2Authorization & { from: `0x${string}` } = {
    from: signer.address,
    permitted: {
      token: getAddress(paymentRequirements.asset),
      amount: paymentRequirements.amount,
    },
    spender: x402UptoPermit2ProxyAddress,
    nonce,
    deadline,
    witness: {
      to: getAddress(paymentRequirements.payTo),
      validAfter,
    },
  };

  const signature = await signPermit2Authorization(
    signer,
    permit2Authorization,
    paymentRequirements,
  );

  return {
    x402Version,
    payload: { signature, permit2Authorization },
  };
}

/**
 * Sign the Permit2 authorization using EIP-712 with witness data.
 * The signature authorizes the x402UptoPermit2Proxy to transfer tokens on behalf of the signer.
 *
 * @param signer - The EVM signer
 * @param permit2Authorization - The Permit2 authorization parameters
 * @param requirements - The payment requirements
 * @returns Promise resolving to the signature
 */
async function signPermit2Authorization(
  signer: ClientEvmSigner,
  permit2Authorization: Permit2Authorization & { from: `0x${string}` },
  requirements: PaymentRequirements,
): Promise<`0x${string}`> {
  const chainId = getEvmChainId(requirements.network);

  return await signer.signTypedData({
    domain: { name: "Permit2", chainId, verifyingContract: PERMIT2_ADDRESS },
    types: permit2WitnessTypes,
    primaryType: "PermitWitnessTransferFrom",
    message: {
      permitted: {
        token: getAddress(permit2Authorization.permitted.token),
        amount: BigInt(permit2Authorization.permitted.amount),
      },
      spender: getAddress(permit2Authorization.spender),
      nonce: BigInt(permit2Authorization.nonce),
      deadline: BigInt(permit2Authorization.deadline),
      witness: {
        to: getAddress(permit2Authorization.witness.to),
        validAfter: BigInt(permit2Authorization.witness.validAfter),
      },
    },
  });
}
