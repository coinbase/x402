import { type Hex, encodeAbiParameters, keccak256, encodePacked } from "viem";

/**
 * The typehash used by Safe's `isValidSignature` (CompatibilityFallbackHandler).
 *
 * `SafeMessage(bytes message)` -- the Safe wraps any message inside this
 * EIP-712 struct before delegating to owners for verification.
 */
const SAFE_MSG_TYPEHASH = keccak256(encodePacked(["string"], ["SafeMessage(bytes message)"]));

/**
 * Compute the domain separator for a Safe contract.
 *
 * The Safe uses a minimal EIP-712 domain: `{ chainId, verifyingContract }`.
 *
 * @param safeAddress - The Safe contract address
 * @param chainId - The chain ID for the domain separator
 * @returns The EIP-712 domain separator hash
 */
function computeSafeDomainSeparator(safeAddress: Hex, chainId: number): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "uint256" }, { type: "address" }],
      [
        // DOMAIN_SEPARATOR_TYPEHASH = keccak256("EIP712Domain(uint256 chainId,address verifyingContract)")
        keccak256(
          encodePacked(["string"], ["EIP712Domain(uint256 chainId,address verifyingContract)"]),
        ),
        BigInt(chainId),
        safeAddress,
      ],
    ),
  );
}

/**
 * Compute the EIP-712 message hash that Safe's `isValidSignature` uses internally.
 *
 * When `isValidSignature(bytes32 _dataHash, bytes signature)` is called on a Safe,
 * the CompatibilityFallbackHandler computes:
 *
 * messageHash = keccak256(
 * 0x19 || 0x01 || domainSeparator || keccak256(abi.encode(SAFE_MSG_TYPEHASH, keccak256(abi.encode(_dataHash))))
 * )
 *
 * This hash is what gets passed to the owner contracts (e.g. P256Owner) for verification.
 *
 * @param safeAddress - The Safe contract address
 * @param chainId - The chain ID for the EIP-712 domain
 * @param messageHash - The message hash to wrap
 * @returns The Safe-wrapped EIP-712 message hash
 */
export function computeSafeMessageHash(safeAddress: Hex, chainId: number, messageHash: Hex): Hex {
  const domainSeparator = computeSafeDomainSeparator(safeAddress, chainId);

  // SafeMessage struct hash: keccak256(abi.encode(SAFE_MSG_TYPEHASH, keccak256(abi.encode(messageHash))))
  const encodedMessage = encodeAbiParameters([{ type: "bytes32" }], [messageHash]);
  const messageHashInner = keccak256(encodedMessage);

  const structHash = keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "bytes32" }],
      [SAFE_MSG_TYPEHASH, messageHashInner],
    ),
  );

  // EIP-712: 0x19 || 0x01 || domainSeparator || structHash
  return keccak256(
    encodePacked(
      ["bytes1", "bytes1", "bytes32", "bytes32"],
      ["0x19", "0x01", domainSeparator, structHash],
    ),
  );
}
