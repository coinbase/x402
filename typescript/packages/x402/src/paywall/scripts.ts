import {
  createWalletClient,
  createPublicClient,
  http,
  custom,
  publicActions,
  Transport,
  Account,
} from "viem";
import {
  createConfig,
  connect,
  switchChain,
  watchAccount,
  GetAccountReturnType,
} from "@wagmi/core";
import { injected } from "@wagmi/connectors";
import { base, baseSepolia } from "viem/chains";

import { ConnectedClient, SignerWallet } from "../types/shared/evm";
import { createPaymentHeader } from "../schemes/exact/evm/client.js";
import { createPayment } from "../schemes/exact/evm/client.js";
import { createNonce, signAuthorization } from "../schemes/exact/evm/sign.js";
import { encodePayment } from "../schemes/exact/evm/utils/paymentUtils.js";
import { getUSDCBalance, getVersion } from "../shared/evm/usdc.js";
import { PaymentRequirements } from "../types/verify";

declare global {
  interface Window {
    x402: {
      amount?: number;
      testnet?: boolean;
      paymentRequirements: PaymentRequirements;
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
    ethereum?: any;
  }
}

function ensureFunctionsAreAvailable() {
  // This is just to make sure these functions get bundled
  return {
    createPaymentHeader,
    createPayment,
    signAuthorization,
    createNonce,
    getVersion,
    encodePayment,
  };
}

// Update UI with payment details -- called when the page loads
function updatePaymentUI(x402: Window["x402"]) {
  if (!x402) return;

  const amount = x402.amount || 0;
  const paymentRequirements = x402.paymentRequirements || {};
  const testnet = x402.testnet ?? true;
  const chainName = testnet ? "Base Sepolia" : "Base";

  // Update payment description
  const descriptionEl = document.getElementById("payment-description");
  if (descriptionEl) {
    descriptionEl.textContent = paymentRequirements.description
      ? `${paymentRequirements.description}. To access this content, please pay $${amount} ${chainName} USDC.`
      : `To access this content, please pay $${amount} ${chainName} USDC.`;
  }

  // Hide Base Sepolia instructions if not on testnet
  const instructionsEl = document.getElementById("instructions");
  if (!testnet && instructionsEl) {
    instructionsEl.classList.add("hidden");
  }

  // Update amount
  const amountEl = document.getElementById("payment-amount");
  if (amountEl) {
    amountEl.textContent = `$${amount} USDC`;
  }

  // Update network
  const networkEl = document.getElementById("payment-network");
  if (networkEl) {
    networkEl.textContent = chainName;
  }
}

async function initializeApp() {
  const x402 = window.x402;

  const wagmiConfig = createConfig({
    chains: [base, baseSepolia],
    connectors: [injected()],
    transports: {
      [base.id]: http(),
      [baseSepolia.id]: http(),
    },
  });

  ensureFunctionsAreAvailable();

  const chain = x402.testnet ? baseSepolia : base;
  let walletClient: SignerWallet | null;
  const publicClient: ConnectedClient<Transport, typeof chain, undefined> = createPublicClient({
    chain,
    transport: custom(window.ethereum),
  }).extend(publicActions);
  
  let address: `0x${string}` | undefined;
  let connectedChainId: number | undefined;

  const unwatch = watchAccount(wagmiConfig, {
    onChange(data: GetAccountReturnType<typeof wagmiConfig>) {
      address = data.address;
      connectedChainId = data.chainId;
    },
  });

  // DOM Elements
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

      const result = await connect(wagmiConfig, {
        connector: injected(),
        chainId: chain.id,
      });

      if (!result.accounts?.[0] || !address) {
        throw new Error("No account selected in your wallet");
      }

      walletClient = createWalletClient({
        chain,
        transport: custom(window.ethereum),
        account: {
          address: address as `0x${string}`,
          type: "json-rpc",
        },
      }).extend(publicActions) as SignerWallet;

      // Update account
      const accountEl = document.getElementById("payment-account");
      if (accountEl) {
        accountEl.textContent = `${address.slice(0, 6)}...${address.slice(-4)}`;
      }

      connectWalletBtn.textContent = "Connected";
      connectWalletBtn.classList.add("connected");
      connectWalletBtn.disabled = true;
      paymentSection.classList.remove("hidden");
      statusDiv.textContent = "Wallet connected! You can now proceed with payment.";

      // Remove the event listener after successful connection
      connectWalletBtn.removeEventListener("click", handleWalletConnect);
    } catch (error) {
      statusDiv.textContent = error instanceof Error ? error.message : "Failed to connect wallet";
      // Reset UI state
      connectWalletBtn.textContent = "Connect wallet";
      connectWalletBtn.classList.remove("connected");
      connectWalletBtn.disabled = false;
      paymentSection.classList.add("hidden");
    }
  };

  const handlePayment = async () => {
    if (connectedChainId !== chain.id) {
      try {
        await switchChain(wagmiConfig, { chainId: chain.id });
      } catch (error) {
        statusDiv.textContent =
          error instanceof Error
            ? error.message
            : `Please switch to ${chain.name} network in your wallet`;
        return;
      }
    }

    try {
      statusDiv.textContent = "Checking USDC balance...";
      if (!walletClient) {
        throw new Error("No wallet connected");
      }
      const balance = await getUSDCBalance(publicClient, walletClient.account.address);
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
      const version = x402.paymentRequirements.extra?.version ?? await getVersion(publicClient);
      const paymentHeader = await createPaymentHeader(walletClient, version,x402.paymentRequirements);

      statusDiv.textContent = "Requesting content with payment...";

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
      } else {
        throw new Error("Payment failed: " + response.statusText);
      }
    } catch (error) {
      statusDiv.textContent = error instanceof Error ? error.message : "Payment failed";
    }
  };

  connectWalletBtn.addEventListener("click", handleWalletConnect);
  payButton.addEventListener("click", handlePayment);
  window.addEventListener("beforeunload", () => {
    if (unwatch) unwatch();
  });
}

window.addEventListener("load", () => {
  // Update the UI with payment details
  updatePaymentUI(window.x402);

  initializeApp();
});
