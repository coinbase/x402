import { Chain, getAddress, Hex, LocalAccount, Transport } from "viem";
import { permitTypes, isAccount, isSignerWallet, SignerWallet } from "../../../types/shared/evm";
import { ExactEvmPermitPayloadAuthorization } from "../../../types/verify";

/**
 * Signs an ERC-2612 permit for ERC-20 token approval
 *
 * @param walletClient - The wallet client that will sign the permit
 * @param params - The permit parameters containing approval details
 * @param params.owner - The address that owns the tokens
 * @param params.spender - The address that will be approved to spend tokens
 * @param params.value - The amount of tokens to approve (in base units)
 * @param params.nonce - Sequential nonce for the owner (uint256)
 * @param params.deadline - Unix timestamp after which the permit expires
 * @param params.domain - The EIP-712 domain containing name, version, chainId, and verifyingContract
 * @returns The signature for the permit
 */
export async function signPermit<transport extends Transport, chain extends Chain>(
  walletClient: SignerWallet<chain, transport> | LocalAccount,
  { owner, spender, value, nonce, deadline, domain }: ExactEvmPermitPayloadAuthorization,
): Promise<{ signature: Hex }> {
  const data = {
    types: permitTypes,
    domain: {
      name: domain.name,
      version: domain.version,
      chainId: domain.chainId,
      verifyingContract: getAddress(domain.verifyingContract),
    },
    primaryType: "Permit" as const,
    message: {
      owner: getAddress(owner),
      spender: getAddress(spender),
      value: BigInt(value),
      nonce: BigInt(nonce),
      deadline: BigInt(deadline),
    },
  };

  if (isSignerWallet(walletClient)) {
    const signature = await walletClient.signTypedData(data);
    return {
      signature,
    };
  } else if (isAccount(walletClient) && walletClient.signTypedData) {
    const signature = await walletClient.signTypedData(data);
    return {
      signature,
    };
  } else {
    throw new Error("Invalid wallet client provided does not support signTypedData");
  }
}
