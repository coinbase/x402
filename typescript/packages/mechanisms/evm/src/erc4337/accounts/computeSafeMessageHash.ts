import { type Hex, encodeAbiParameters, encodePacked, keccak256 } from "viem";

const DOMAIN_SEPARATOR_TYPEHASH = keccak256(
  encodePacked(["string"], ["EIP712Domain(uint256 chainId,address verifyingContract)"]),
);

const SAFE_MSG_TYPEHASH = keccak256(encodePacked(["string"], ["SafeMessage(bytes message)"]));

/**
 * Computes the Safe message hash for EIP-1271 signature verification.
 *
 * This is what Safe's `isValidSignature(hash, sig)` expects: the hash is
 * first wrapped in Safe's EIP-712 domain before `checkNSignatures` runs.
 *
 * Flow: keccak256(0x19 || 0x01 || domainSeparator || structHash)
 * where structHash = keccak256(SAFE_MSG_TYPEHASH || keccak256(abi.encode(messageHash)))
 *
 * @param safeAddress - The Safe contract address
 * @param chainId - The chain ID for the EIP-712 domain
 * @param messageHash - The message hash to wrap in Safe's EIP-712 domain
 * @returns The Safe-wrapped EIP-712 message hash
 */
export function computeSafeMessageHash(safeAddress: Hex, chainId: number, messageHash: Hex): Hex {
  const domainSeparator = keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "uint256" }, { type: "address" }],
      [DOMAIN_SEPARATOR_TYPEHASH, BigInt(chainId), safeAddress],
    ),
  );

  const encodedMessage = encodeAbiParameters([{ type: "bytes32" }], [messageHash]);
  const messageHashInner = keccak256(encodedMessage);

  const structHash = keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "bytes32" }],
      [SAFE_MSG_TYPEHASH, messageHashInner],
    ),
  );

  return keccak256(
    encodePacked(
      ["bytes1", "bytes1", "bytes32", "bytes32"],
      ["0x19", "0x01", domainSeparator, structHash],
    ),
  );
}
