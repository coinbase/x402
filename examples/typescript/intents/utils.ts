import { base58, base64, hex } from "@scure/base";

export function transformERC191Signature(signature: string) {
  const normalizedSignature = normalizeERC191Signature(signature);
  const bytes = hex.decode(
    normalizedSignature.startsWith("0x") ? normalizedSignature.slice(2) : normalizedSignature,
  );
  return `secp256k1:${base58.encode(bytes)}`;
}

export function normalizeERC191Signature(signature: string): string {
  // Get `v` from the last two characters
  let v = Number.parseInt(signature.slice(-2), 16);

  // // Normalize `v` to be either 0 or 1
  v = toRecoveryBit(v);

  // Convert `v` back to hex
  const vHex = v.toString(16).padStart(2, "0");

  // Reconstruct the full signature with the adjusted `v`
  return signature.slice(0, -2) + vHex;
}

// Copy from viem/utils/signature/recoverPublicKey.ts
function toRecoveryBit(yParityOrV: number) {
  if (yParityOrV === 0 || yParityOrV === 1) return yParityOrV;
  if (yParityOrV === 27) return 0;
  if (yParityOrV === 28) return 1;
  throw new Error("Invalid yParityOrV value");
}

export function randomNonce(): string {
  return base64.encode(randomBytes(32));
}

function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

export async function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
