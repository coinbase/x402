import { createWalletClient, createPublicClient, http, custom, publicActions, Chain } from "viem";
import { base, baseSepolia, sei, seiTestnet } from "viem/chains";

import { createPayment, createPaymentHeader } from "../schemes/exact/evm/client";
import { createNonce, signAuthorization } from "../schemes/exact/evm/sign";
import { encodePayment } from "../schemes/exact/evm/utils/paymentUtils";
import { getUSDCBalance, getVersion } from "../shared/evm/usdc";

import type { SignerWallet } from "../types/shared/evm";
import type { PaymentRequirements } from "../types/verify";
import type { Network } from "../types/shared";

// Define the type for ethereum provider
interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
}

declare global {
  interface Window {
    x402: {
      amount?: number;
      testnet?: boolean;
      paymentRequirements: PaymentRequirements | PaymentRequirements[];
      currentUrl: string;
      config: {
        chainConfig: Record<
          string,
          {
            usdcAddress: string;
            usdcName: string;
          }
        >;
      };
    };
    ethereum?: EthereumProvider;
  }
}

/**
 * Helper function to Base64 encode a string (for payment headers)
 *
 * @param data - The string data to encode to Base64
 * @returns The Base64 encoded string
 */
function safeBase64Encode(data: string): string {
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
function selectPaymentRequirements(
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
function ensureValidAmount(paymentRequirements: PaymentRequirements): PaymentRequirements {
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
 * Makes sure required functions are bundled
 *
 * @returns An object containing all required functions
 */
function ensureFunctionsAreAvailable() {
  return {
    createPaymentHeader,
    createPayment,
    signAuthorization,
    createNonce,
    getVersion,
    encodePayment,
  };
}

type NetworkKey = "base" | "base-sepolia" | "sei" | "sei-testnet";

const chainMap: Record<NetworkKey, { chain: Chain; name: string }> = {
  base: { chain: base, name: "Base" },
  "base-sepolia": { chain: baseSepolia, name: "Base Sepolia" },
  sei: { chain: sei, name: "Sei" },
  "sei-testnet": { chain: seiTestnet, name: "Sei Testnet" },
};

/**
 * Gets the appropriate chain and network based on x402 configuration
 *
 * @param x402 - The x402 configuration object
 * @returns Object containing chain, network, and chainName
 */
export function getChainConfig(x402: Window["x402"]) {
  const paymentRequirements = Array.isArray(x402.paymentRequirements)
    ? x402.paymentRequirements[0]
    : x402.paymentRequirements;

  const networkCandidate = paymentRequirements?.network;
  const fallbackNetwork: NetworkKey = x402.testnet ? "base-sepolia" : "base";

  const network: NetworkKey = (
    networkCandidate in chainMap ? networkCandidate : fallbackNetwork
  ) as NetworkKey;

  if (networkCandidate && !(networkCandidate in chainMap)) {
    console.warn(`Unknown network "${networkCandidate}", defaulting to "${fallbackNetwork}"`);
  }

  const { chain, name: chainName } = chainMap[network];
  return { chain, network, chainName };
}

/**
 * Updates UI with payment details
 *
 * @param x402 - The x402 configuration object containing payment details
 */
function updatePaymentUI(x402: Window["x402"]) {
  if (!x402) return;

  const amount = x402.amount || 0;
  const { network, chainName } = getChainConfig(x402);

  const paymentRequirements = selectPaymentRequirements(
    x402.paymentRequirements,
    network as Network,
    "exact",
  );

  const descriptionEl = document.getElementById("payment-description");
  if (descriptionEl) {
    descriptionEl.textContent = paymentRequirements.description
      ? `${paymentRequirements.description}. To access this content, please pay $${amount} ${chainName} USDC.`
      : `To access this content, please pay $${amount} ${chainName} USDC.`;
  }

  const instructionsEl = document.getElementById("instructions");
  if (instructionsEl) {
    // Only show the faucet link instructions when in testnet mode
    const isTestnet = network === "base-sepolia" || network === "sei-testnet";
    if (isTestnet) {
      instructionsEl.style.display = "block";
    } else {
      instructionsEl.style.display = "none";
    }
  }

  const amountEl = document.getElementById("payment-amount");
  if (amountEl) {
    amountEl.textContent = `$${amount} USDC`;
  }

  const networkEl = document.getElementById("payment-network");
  if (networkEl) {
    networkEl.textContent = chainName;
  }

  const loadingElement = document.getElementById("loading-message");
  if (loadingElement) {
    loadingElement.style.display = "none";
  }

  const walletConnectionElement = document.getElementById("wallet-connection");
  if (walletConnectionElement) {
    walletConnectionElement.style.display = "block";
  }
}

/**
 * Connects to the wallet and switches to the required chain
 *
 * @param chain - The blockchain chain to connect to
 * @returns The connected wallet address
 */
async function connectWallet(chain: Chain): Promise<`0x${string}`> {
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

/**
 * Initializes the payment application
 *
 * @returns A promise that resolves when initialization is complete
 */
async function initializeApp() {
  const x402 = window.x402;
  if (!x402) {
    console.error("x402 configuration not found");
    return;
  }

  ensureFunctionsAreAvailable();

  const { chain, network } = getChainConfig(x402);
  let walletClient: SignerWallet | null = null;
  let address: `0x${string}` | undefined;

  const publicClient = createPublicClient({
    chain,
    transport: http(),
  }).extend(publicActions);

  const connectWalletBtn = document.getElementById("connect-wallet") as HTMLButtonElement | null;
  const paymentSection = document.getElementById("payment-section") as HTMLDivElement | null;
  const payButton = document.getElementById("pay-button") as HTMLButtonElement | null;
  const statusDiv = document.getElementById("status") as HTMLDivElement | null;

  if (!connectWalletBtn || !paymentSection || !payButton || !statusDiv) {
    console.error("Required DOM elements not found");
    return;
  }

  const handleWalletConnect = async () => {
    try {
      statusDiv.textContent = "Connecting wallet...";

      address = await connectWallet(chain);

      if (!address || !window.ethereum) {
        throw new Error("No account selected in your wallet");
      }

      walletClient = createWalletClient({
        chain,
        transport: custom(window.ethereum),
        account: address,
      }).extend(publicActions) as SignerWallet;

      const accountEl = document.getElementById("payment-account");
      if (accountEl) {
        accountEl.textContent = `${address.slice(0, 6)}...${address.slice(-4)}`;
      }

      connectWalletBtn.textContent = "Connected";
      connectWalletBtn.classList.add("connected");
      connectWalletBtn.disabled = true;
      paymentSection.classList.remove("hidden");
      statusDiv.textContent = "Wallet connected! You can now proceed with payment.";

      connectWalletBtn.removeEventListener("click", handleWalletConnect);
    } catch (error) {
      statusDiv.textContent = error instanceof Error ? error.message : "Failed to connect wallet";
      connectWalletBtn.textContent = "Connect wallet";
      connectWalletBtn.classList.remove("connected");
      connectWalletBtn.disabled = false;
      paymentSection.classList.add("hidden");
    }
  };

  const handlePayment = async () => {
    if (!walletClient || !address) {
      statusDiv.textContent = "No wallet connected. Please connect your wallet first.";
      return;
    }

    try {
      statusDiv.textContent = "Checking USDC balance...";
      const balance = await getUSDCBalance(publicClient, address);

      if (balance === 0n) {
        throw new Error(
          `Your USDC balance is 0. Please make sure you have USDC tokens on ${chain.name}`,
        );
      }
    } catch (error) {
      statusDiv.textContent =
        error instanceof Error ? error.message : "Failed to check USDC balance";
      return;
    }

    statusDiv.textContent = "Creating payment signature...";

    try {
      const paymentRequirements = selectPaymentRequirements(
        x402.paymentRequirements,
        network as Network,
        "exact",
      );

      const validPaymentRequirements = ensureValidAmount(paymentRequirements);

      // Create payment with x402Version=1
      const initialPayment = await createPayment(walletClient, 1, validPaymentRequirements);
      initialPayment.x402Version = 1;

      const paymentHeader = safeBase64Encode(JSON.stringify(initialPayment));

      statusDiv.textContent = "Requesting content with payment...";

      try {
        const response = await fetch(x402.currentUrl, {
          headers: {
            "X-PAYMENT": paymentHeader,
            "Access-Control-Expose-Headers": "X-PAYMENT-RESPONSE",
          },
        });

        if (response.ok) {
          const contentType = response.headers.get("content-type");
          if (contentType && contentType.includes("text/html")) {
            document.documentElement.innerHTML = await response.text();
          } else {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            window.location.href = url;
          }
        } else if (response.status === 402) {
          try {
            const errorData = await response.json();

            if (errorData && typeof errorData.x402Version === "number") {
              // Retry with server's x402Version
              const retryPayment = await createPayment(
                walletClient,
                errorData.x402Version,
                validPaymentRequirements,
              );

              retryPayment.x402Version = errorData.x402Version;
              const retryHeader = safeBase64Encode(JSON.stringify(retryPayment));

              const retryResponse = await fetch(x402.currentUrl, {
                headers: {
                  "X-PAYMENT": retryHeader,
                  "Access-Control-Expose-Headers": "X-PAYMENT-RESPONSE",
                },
              });

              if (retryResponse.ok) {
                const contentType = retryResponse.headers.get("content-type");
                if (contentType && contentType.includes("text/html")) {
                  document.documentElement.innerHTML = await retryResponse.text();
                } else {
                  const blob = await retryResponse.blob();
                  const url = window.URL.createObjectURL(blob);
                  window.location.href = url;
                }
                return;
              } else {
                throw new Error(`Payment failed: ${retryResponse.statusText}`);
              }
            } else {
              throw new Error(`Payment failed: ${response.statusText}`);
            }
          } catch {
            throw new Error(`Payment failed: ${response.statusText}`);
          }
        } else {
          throw new Error(`Request failed: ${response.status} ${response.statusText}`);
        }
      } catch (fetchError) {
        throw fetchError;
      }
    } catch (error) {
      statusDiv.textContent = error instanceof Error ? error.message : "Payment failed";
    }
  };

  connectWalletBtn.addEventListener("click", handleWalletConnect);
  payButton.addEventListener("click", handlePayment);
}

// Check if window exists (for browser environments only)
if (typeof window !== "undefined") {
  window.addEventListener("load", () => {
    updatePaymentUI(window.x402);

    initializeApp().catch(error => {
      console.error("Failed to initialize app:", error);
      const statusDiv = document.getElementById("status");
      if (statusDiv) {
        statusDiv.textContent = error instanceof Error ? error.message : "Failed to initialize app";
      }
    });
  });
}
