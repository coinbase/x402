import { Chain, getAddress, Hex, LocalAccount, Transport } from "viem";
import { getNetworkId } from "../../../../shared";
import {
  permitTypes,
  erc20PermitABI,
  isSignerWallet,
  SignerWallet,
} from "../../../../types/shared/evm";
import { PermitEvmPayloadAuthorization, PaymentRequirements } from "../../../../types/verify";

/**
 * Signs an EIP-2612 Permit authorization for ERC20 approval
 *
 * @param walletClient - The wallet client that will sign the permit
 * @param params - The permit parameters
 * @param params.owner - The address of the token owner
 * @param params.spender - The address authorized to spend tokens
 * @param params.value - The amount of tokens to approve (in base units)
 * @param params.deadline - Unix timestamp after which the permit is no longer valid
 * @param paymentRequirements - The payment requirements containing asset and network information
 * @param paymentRequirements.asset - The address of the ERC20 token contract
 * @param paymentRequirements.network - The network where the token exists
 * @returns The signature and nonce for the permit
 */
export async function signPermit<transport extends Transport, chain extends Chain>(
  walletClient: SignerWallet<chain, transport> | LocalAccount,
  { owner, spender, value, deadline }: Omit<PermitEvmPayloadAuthorization, "nonce">,
  { asset, network }: PaymentRequirements,
): Promise<{ signature: Hex; nonce: string }> {
  const chainId = getNetworkId(network);
  const tokenAddress = getAddress(asset);

  // Get the current nonce for the owner
  let nonce: bigint;
  let tokenName: string;

  if (isSignerWallet(walletClient)) {
    [nonce, tokenName] = await Promise.all([
      walletClient.readContract({
        address: tokenAddress,
        abi: erc20PermitABI,
        functionName: "nonces",
        args: [getAddress(owner)],
      }) as Promise<bigint>,
      walletClient.readContract({
        address: tokenAddress,
        abi: erc20PermitABI,
        functionName: "name",
      }) as Promise<string>,
    ]);
  } else {
    throw new Error("Local account signing for permit requires a connected client");
  }

  const data = {
    types: permitTypes,
    domain: {
      name: tokenName,
      version: "1",
      chainId,
      verifyingContract: tokenAddress,
    },
    primaryType: "Permit" as const,
    message: {
      owner: getAddress(owner),
      spender: getAddress(spender),
      value: BigInt(value),
      nonce,
      deadline: BigInt(deadline),
    },
  };

  if (isSignerWallet(walletClient)) {
    const signature = await walletClient.signTypedData(data);
    return {
      signature,
      nonce: nonce.toString(),
    };
  }

  // LocalAccount with signTypedData
  const account = walletClient as LocalAccount;
  if (account.signTypedData) {
    const signature = await account.signTypedData(data);
    return {
      signature,
      nonce: nonce.toString(),
    };
  }

  throw new Error("Invalid wallet client provided does not support signTypedData");
}

/**
 * Helper function to split signature into v, r, s components
 * Required for calling the permit function on-chain
 *
 * @param signature - The signature to split
 * @returns The v, r, s components of the signature
 */
export function splitSignature(signature: Hex): { v: number; r: Hex; s: Hex } {
  const sig = signature.slice(2); // Remove 0x prefix
  const r = `0x${sig.slice(0, 64)}` as Hex;
  const s = `0x${sig.slice(64, 128)}` as Hex;
  let v = parseInt(sig.slice(128, 130), 16);

  // Handle legacy v values
  if (v < 27) {
    v += 27;
  }

  return { v, r, s };
}
