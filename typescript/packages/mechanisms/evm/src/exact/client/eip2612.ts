import { getAddress } from "viem";
import type { Eip2612GasSponsoringInfo } from "@x402/extensions";
import { eip2612PermitTypes, eip2612NoncesAbi, PERMIT2_ADDRESS } from "../../constants";
import { ClientEvmSigner } from "../../signer";

/** Maximum uint256 value for unlimited approval. */
const MAX_UINT256 = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");

/**
 * Signs an EIP-2612 permit authorizing the Permit2 contract to spend tokens.
 *
 * This creates a gasless off-chain signature that the facilitator can submit
 * on-chain via `x402Permit2Proxy.settleWithPermit()`.
 *
 * @param signer - The client EVM signer (must support readContract for nonce query)
 * @param tokenAddress - The ERC-20 token contract address
 * @param tokenName - The token name (from paymentRequirements.extra.name)
 * @param tokenVersion - The token version (from paymentRequirements.extra.version)
 * @param chainId - The chain ID
 * @param deadline - The deadline for the permit (unix timestamp as string)
 * @returns The EIP-2612 gas sponsoring info object
 */
export async function signEip2612Permit(
  signer: ClientEvmSigner,
  tokenAddress: `0x${string}`,
  tokenName: string,
  tokenVersion: string,
  chainId: number,
  deadline: string,
): Promise<Eip2612GasSponsoringInfo> {
  const owner = signer.address;
  const spender = getAddress(PERMIT2_ADDRESS);

  // Query the current EIP-2612 nonce from the token contract
  const nonce = (await signer.readContract({
    address: tokenAddress,
    abi: eip2612NoncesAbi,
    functionName: "nonces",
    args: [owner],
  })) as bigint;

  // Construct EIP-712 domain for the token's permit function
  const domain = {
    name: tokenName,
    version: tokenVersion,
    chainId,
    verifyingContract: tokenAddress,
  };

  const message = {
    owner,
    spender,
    value: MAX_UINT256,
    nonce,
    deadline: BigInt(deadline),
  };

  // Sign the EIP-2612 permit
  const signature = await signer.signTypedData({
    domain,
    types: eip2612PermitTypes,
    primaryType: "Permit",
    message,
  });

  return {
    from: owner,
    asset: tokenAddress,
    spender,
    amount: MAX_UINT256.toString(),
    nonce: nonce.toString(),
    deadline,
    signature,
    version: "1",
  };
}
