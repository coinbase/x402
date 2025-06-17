import { Network, PaymentRequirements } from "../../types";
import { Chain } from "viem";

/**
 * Helper function to Base64 encode a string (for payment headers)
 *
 * @param data - The string data to encode to Base64
 * @returns The Base64 encoded string
 */
export function safeBase64Encode(data: string): string {
  return window.btoa(data);
}

/**
 * Selects the most appropriate payment requirement from a list
 *
 * @param paymentRequirements - The payment requirements to select from
 * @param network - The network to match against
 * @param scheme - The payment scheme to match against
 * @returns The selected payment requirement
 */
export function selectPaymentRequirements(
  paymentRequirements: PaymentRequirements | PaymentRequirements[],
  network?: Network,
  scheme: string = "exact",
): PaymentRequirements {
  const requirementsArray = Array.isArray(paymentRequirements)
    ? paymentRequirements
    : [paymentRequirements];

  const matching = requirementsArray.filter(req => {
    const schemeMatch = !scheme || req.scheme === scheme;
    const networkMatch = !network || req.network === network;
    return schemeMatch && networkMatch;
  });

  return matching.length > 0 ? matching[0] : requirementsArray[0];
}

/**
 * Ensures a valid amount is set in payment requirements
 *
 * @param paymentRequirements - The payment requirements to validate and update
 * @returns Updated payment requirements with valid amount
 */
export function ensureValidAmount(paymentRequirements: PaymentRequirements): PaymentRequirements {
  const updatedRequirements = JSON.parse(JSON.stringify(paymentRequirements));

  if (window.x402?.amount) {
    try {
      const amountInBaseUnits = Math.round(window.x402.amount * 1_000_000);
      updatedRequirements.maxAmountRequired = amountInBaseUnits.toString();
    } catch (error) {
      console.error("Failed to parse amount:", error);
    }
  }

  if (
    !updatedRequirements.maxAmountRequired ||
    !/^\d+$/.test(updatedRequirements.maxAmountRequired)
  ) {
    updatedRequirements.maxAmountRequired = "10000";
  }

  return updatedRequirements;
}

/**
 * Connects to the wallet and switches to the required chain
 *
 * @param chain - The blockchain chain to connect to
 * @returns The connected wallet address
 */
export async function connectWallet(chain: Chain): Promise<`0x${string}`> {
  if (!window.ethereum) {
    throw new Error("No injected Ethereum provider found. Please install MetaMask or similar.");
  }

  const addresses = (await window.ethereum.request({
    method: "eth_requestAccounts",
  })) as `0x${string}`[];

  if (!addresses || addresses.length === 0) {
    throw new Error("No accounts found");
  }

  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: `0x${chain.id.toString(16)}` }],
    });
  } catch (switchError: unknown) {
    const error = switchError as { code: number };
    if (error.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: `0x${chain.id.toString(16)}`,
            chainName: chain.name,
            nativeCurrency: chain.nativeCurrency,
            rpcUrls: [chain.rpcUrls.default.http[0]],
            blockExplorerUrls: [chain.blockExplorers?.default.url],
          },
        ],
      });
    } else {
      throw switchError;
    }
  }

  return addresses[0];
}
