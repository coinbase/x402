/**
 * Facilitator – NEAR /verify (Skeleton)
 * TODO:
 *  - Parse x402 header JSON
 *  - (Path A) NEP-413 header auth checks
 *  - (Path B) NEP-366 SignedDelegateAction checks
 *  - Enforce FA key, nonce reuse, expiry
 */

export type NearNetwork = "near-mainnet" | "near-testnet";

export interface VerifyInput {
  header: string;
  paymentRequirements: unknown; // wire type from x402 core
}

export interface VerifyOk {
  ok: true;
  kind: "near/exact";
  network: NearNetwork;
  sender: string;
  contract?: string;
  amount?: string;
}

export type VerifyFail = { ok: false; reason: string; code: string };

/**
 * Verifies a NEAR payment header against payment requirements
 *
 * @param _ - The verification input containing header and payment requirements
 * @returns Verification result with payment details or failure reason
 */
export async function verifyNearExact(_: VerifyInput): Promise<VerifyOk | VerifyFail> {
  // TODO: real implementation
  return { ok: true, kind: "near/exact", network: "near-testnet", sender: "todo.testnet" };
}
