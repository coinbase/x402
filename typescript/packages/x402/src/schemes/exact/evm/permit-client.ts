import { Address, Chain, LocalAccount, Transport, createPublicClient, http } from "viem";
import { getNetworkId } from "../../../shared";
import { isSignerWallet, SignerWallet, getChainFromNetwork } from "../../../types/shared/evm";
import { ChainIdToNetwork } from "../../../types/shared";
import {
  ExactEvmPermitPayload,
  PaymentPayload,
  PaymentRequirements,
  UnsignedPaymentPayload,
} from "../../../types/verify";
import { signPermit } from "./permit-sign";
import { encodePayment } from "./utils/paymentUtils";

/**
 * Gets the current nonce for an owner address from the ERC-20 contract
 *
 * @param client - The wallet client to query the contract
 * @param asset - The ERC-20 token contract address
 * @param owner - The owner address
 * @param chainId - Optional chain ID to query the nonce from (for cross-chain payments)
 * @returns The current nonce as a string
 */
export async function getPermitNonce<transport extends Transport, chain extends Chain>(
  client: SignerWallet<chain, transport> | LocalAccount,
  asset: Address,
  owner: Address,
  chainId?: number,
): Promise<string> {
  // If chainId is provided and differs from the wallet's chain, create a temporary client
  const walletClient = isSignerWallet(client) ? client : null;

  let queryClient: any;
  if (chainId && walletClient && walletClient.chain?.id !== chainId) {
    // Cross-chain case: create a temporary public client for the source chain
    const network = ChainIdToNetwork[chainId];
    if (!network) {
      throw new Error(`Unsupported chain ID: ${chainId}`);
    }
    const sourceChain = getChainFromNetwork(network);
    queryClient = createPublicClient({
      chain: sourceChain,
      transport: http(),
    });
  } else {
    // Same-chain case: use the wallet client
    if (!walletClient) {
      throw new Error("Permit nonce query requires a connected wallet client");
    }
    queryClient = walletClient;
  }

  const nonce = await queryClient.readContract({
    address: asset,
    abi: [
      {
        inputs: [{ internalType: "address", name: "owner", type: "address" }],
        name: "nonces",
        outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function",
      },
    ],
    functionName: "nonces",
    args: [owner],
  });
  return nonce.toString();
}

/**
 * Prepares an unsigned permit payment header with the given owner address and payment requirements.
 *
 * @param owner - The owner's address that will approve the spender
 * @param x402Version - The version of the X402 protocol to use
 * @param paymentRequirements - The payment requirements containing scheme and network information
 * @param nonce - The current nonce for the owner (should be queried from contract)
 * @returns An unsigned payment payload containing permit details
 */
export function preparePermitPaymentHeader(
  owner: Address,
  x402Version: number,
  paymentRequirements: PaymentRequirements,
  nonce: string,
): UnsignedPaymentPayload {
  const deadline = BigInt(
    Math.floor(Date.now() / 1000 + paymentRequirements.maxTimeoutSeconds),
  ).toString();

  // For permit, the spender needs to be specified in payment requirements extra field
  // This is the facilitator address that will execute the transfer
  const spender = (paymentRequirements.extra?.facilitatorAddress ||
    paymentRequirements.payTo) as Address;

  // Extract domain information from payment requirements
  // If chainId and verifyingContract are provided in extra (from quote), use them
  // Otherwise, infer from network and asset
  const chainId = paymentRequirements.extra?.chainId ?? getNetworkId(paymentRequirements.network);
  const verifyingContract =
    (paymentRequirements.extra?.verifyingContract as Address) ??
    (paymentRequirements.asset as Address);
  const name = paymentRequirements.extra?.name;
  const version = paymentRequirements.extra?.version;

  if (!name) {
    throw new Error("permit requires paymentRequirements.extra.name (ERC-20 token name)");
  }
  if (!version) {
    throw new Error("permit requires paymentRequirements.extra.version (ERC-20 token version)");
  }

  return {
    x402Version,
    scheme: paymentRequirements.scheme,
    network: paymentRequirements.network,
    payload: {
      signature: undefined,
      permit: {
        owner,
        spender,
        value: paymentRequirements.srcAmountRequired || paymentRequirements.maxAmountRequired,
        nonce,
        deadline,
        domain: {
          name,
          version,
          chainId,
          verifyingContract,
        },
      },
    },
  };
}

/**
 * Signs a permit payment header using the provided client and payment requirements.
 *
 * @param client - The signer wallet instance used to sign the permit header
 * @param paymentRequirements - The payment requirements containing scheme and network information
 * @param unsignedPaymentHeader - The unsigned payment payload to be signed
 * @returns A promise that resolves to the signed payment payload
 */
export async function signPermitPaymentHeader<transport extends Transport, chain extends Chain>(
  client: SignerWallet<chain, transport> | LocalAccount,
  paymentRequirements: PaymentRequirements,
  unsignedPaymentHeader: UnsignedPaymentPayload,
): Promise<PaymentPayload> {
  const permitPayload = unsignedPaymentHeader.payload as Omit<
    ExactEvmPermitPayload,
    "signature"
  > & {
    signature: undefined;
  };

  const { signature } = await signPermit(client, permitPayload.permit);

  return {
    ...unsignedPaymentHeader,
    payload: {
      ...permitPayload,
      signature,
    },
  };
}

/**
 * Creates a complete permit payment payload by preparing and signing a permit header.
 *
 * @param client - The signer wallet instance used to create and sign the permit
 * @param x402Version - The version of the X402 protocol to use
 * @param paymentRequirements - The payment requirements containing scheme and network information
 * @returns A promise that resolves to the complete signed permit payment payload
 */
export async function createPermitPayment<transport extends Transport, chain extends Chain>(
  client: SignerWallet<chain, transport> | LocalAccount,
  x402Version: number,
  paymentRequirements: PaymentRequirements,
): Promise<PaymentPayload> {
  const owner = isSignerWallet(client) ? client.account!.address : client.address;

  // Query the current nonce from the contract
  // For cross-chain payments (AnySpend), use the source token (verifyingContract) instead of destination asset
  const tokenAddress =
    (paymentRequirements.extra?.verifyingContract as Address) ||
    (paymentRequirements.asset as Address);
  console.log("owner", owner);
  console.log("tokenAddress for nonce query", tokenAddress);
  console.log("paymentRequirements.asset (destination)", paymentRequirements.asset);

  // Pass the chainId from payment requirements for cross-chain queries
  const chainId = paymentRequirements.extra?.chainId ?? getNetworkId(paymentRequirements.network);
  const nonce = await getPermitNonce(client, tokenAddress, owner, chainId);
  console.log("nonce", nonce);
  const unsignedPaymentHeader = preparePermitPaymentHeader(
    owner,
    x402Version,
    paymentRequirements,
    nonce,
  );
  return signPermitPaymentHeader(client, paymentRequirements, unsignedPaymentHeader);
}

/**
 * Creates and encodes a permit payment header for the given client and payment requirements.
 *
 * @param client - The signer wallet instance used to create the permit payment header
 * @param x402Version - The version of the X402 protocol to use
 * @param paymentRequirements - The payment requirements containing scheme and network information
 * @returns A promise that resolves to the encoded permit payment header string
 */
export async function createPermitPaymentHeader(
  client: SignerWallet | LocalAccount,
  x402Version: number,
  paymentRequirements: PaymentRequirements,
): Promise<string> {
  const payment = await createPermitPayment(client, x402Version, paymentRequirements);
  return encodePayment(payment);
}
