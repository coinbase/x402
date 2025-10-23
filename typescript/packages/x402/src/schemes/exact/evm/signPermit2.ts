import { Chain, getAddress, Hex, LocalAccount, Transport, Address } from "viem";
import { getNetworkId } from "../../../shared";
import {
  permit2Types,
  permit2ABI,
  PERMIT2_ADDRESS,
  isAccount,
  isSignerWallet,
  SignerWallet,
} from "../../../types/shared/evm";
import { Permit2EvmPayloadAuthorization, PaymentRequirements } from "../../../types/verify";

/**
 * Signs a Permit2 PermitTransferFrom authorization
 *
 * @param walletClient - The wallet client that will sign the permit
 * @param params - The permit2 parameters
 * @param params.owner - The address of the token owner
 * @param params.spender - The address authorized to transfer tokens
 * @param params.token - The address of the token to transfer
 * @param params.amount - The amount of tokens to transfer (in base units)
 * @param params.deadline - Unix timestamp after which the permit is no longer valid
 * @param paymentRequirements - The payment requirements containing network information
 * @returns The signature and nonce for the permit2
 */
export async function signPermit2<transport extends Transport, chain extends Chain>(
  walletClient: SignerWallet<chain, transport> | LocalAccount,
  { owner, spender, token, amount, deadline }: Omit<Permit2EvmPayloadAuthorization, "nonce">,
  { network }: PaymentRequirements,
): Promise<{ signature: Hex; nonce: string }> {
  const chainId = getNetworkId(network);
  const tokenAddress = getAddress(token);
  const ownerAddress = getAddress(owner);
  const spenderAddress = getAddress(spender);

  // Get the current nonce from Permit2 contract
  let nonce: bigint;

  if (isSignerWallet(walletClient)) {
    const allowanceData = await walletClient.readContract({
      address: PERMIT2_ADDRESS,
      abi: permit2ABI,
      functionName: "allowance",
      args: [ownerAddress, tokenAddress, spenderAddress],
    });

    // allowanceData is [amount: bigint, expiration: number, nonce: number]
    nonce = BigInt((allowanceData as any)[2]); // nonce is the third element
  } else {
    throw new Error("Local account signing for permit2 requires a connected client");
  }

  const data = {
    types: permit2Types,
    domain: {
      name: "Permit2",
      chainId,
      verifyingContract: PERMIT2_ADDRESS,
    },
    primaryType: "PermitTransferFrom" as const,
    message: {
      permitted: {
        token: tokenAddress,
        amount: BigInt(amount),
      },
      spender: spenderAddress,
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
