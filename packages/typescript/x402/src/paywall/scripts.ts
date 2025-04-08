import { createWalletClient, createPublicClient, http, custom, publicActions } from "viem";
import { createConfig, connect, disconnect } from "@wagmi/core";
import { coinbaseWallet, injected } from "@wagmi/connectors";
import { base, baseSepolia } from "viem/chains";
import { SignerWallet } from "../shared/evm/wallet";
import { createPaymentHeader } from "../schemes/exact/evm/client";

import { createPayment } from "../schemes/exact/evm/client";
import { createNonce, signAuthorization } from "../schemes/exact/evm/sign";
import { encodePayment } from "../schemes/exact/evm/utils/paymentUtils";
import { getVersion } from "../shared/evm/usdc";

declare global {
  interface Window {
    x402: {
      amount?: number;
      testnet?: boolean;
      paymentDetails: any;
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

// Function to update UI with payment details
function updatePaymentUI() {
  const x402 = window.x402;
  if (!x402) return;

  console.log("X402:", x402);
  const amount = x402.amount || 0;
  const paymentDetails = x402.paymentDetails || {};

  // Update payment description
  const descriptionEl = document.getElementById("payment-description");
  if (descriptionEl) {
    descriptionEl.textContent = paymentDetails.description
      ? `${paymentDetails.description}. To access this content, please pay $${amount} Base Sepolia USDC.`
      : `To access this content, please pay $${amount} Base Sepolia USDC.`;
  }

  // Update amount
  const amountEl = document.getElementById("payment-amount");
  if (amountEl) {
    amountEl.textContent = `$${amount} USDC`;
  }

  // Update network
  const networkEl = document.getElementById("payment-network");
  if (networkEl) {
    networkEl.textContent = x402.testnet ? "Base Sepolia" : "Base";
  }
}

async function initializeApp() {
  const x402 = window.x402;
  const wagmiConfig = createConfig({
    chains: [base, baseSepolia],
    connectors: [coinbaseWallet({ appName: "x402" }), injected()],
    transports: {
      [base.id]: http(),
      [baseSepolia.id]: http(),
    },
  });

  ensureFunctionsAreAvailable();

  // DOM Elements
  const connectWalletBtn = document.getElementById("connect-wallet");
  const paymentSection = document.getElementById("payment-section");
  const payButton = document.getElementById("pay-button");
  const statusDiv = document.getElementById("status");

  if (!connectWalletBtn || !paymentSection || !payButton || !statusDiv) {
    // console.error('Required DOM elements not found');
    return;
  }

  // Update the UI with payment details
  updatePaymentUI();

  let walletClient: SignerWallet | null = null;
  const chain = x402.testnet ? baseSepolia : base;

  const publicClient = createPublicClient({
    chain,
    transport: custom(window.ethereum),
  }).extend(publicActions);

  // Connect wallet handler
  connectWalletBtn.addEventListener("click", async () => {
    // If wallet is already connected, disconnect it
    if (walletClient) {
      try {
        await disconnect(wagmiConfig);
        walletClient = null;
        connectWalletBtn.textContent = "Connect Wallet";
        paymentSection.classList.add("hidden");
        statusDiv.textContent = "Wallet disconnected";
        return;
      } catch (error) {
        statusDiv.textContent = "Failed to disconnect wallet";
        return;
      }
    }

    try {
      statusDiv.textContent = "Connecting wallet...";

      const result = await connect(wagmiConfig, {
        connector: injected(),
        chainId: chain.id,
      });
      if (!result.accounts?.[0]) {
        throw new Error("Please select an account in your wallet");
      }
      walletClient = createWalletClient({
        account: result.accounts[0],
        chain,
        transport: custom(window.ethereum),
      }).extend(publicActions) as SignerWallet;

      const address = result.accounts[0];

      connectWalletBtn.textContent = `${address.slice(0, 6)}...${address.slice(-4)}`;
      paymentSection.classList.remove("hidden");
      statusDiv.textContent = "Wallet connected! You can now proceed with payment.";
    } catch (error) {
      console.error("Connection error:", error);
      statusDiv.textContent = error instanceof Error ? error.message : "Failed to connect wallet";
      // Reset UI state
      connectWalletBtn.textContent = "Connect Wallet";
      paymentSection.classList.add("hidden");
    }
  });

  // Payment handler
  payButton.addEventListener("click", async () => {
    if (!walletClient) {
      statusDiv.textContent = "Please connect your wallet first";
      return;
    }

    try {
      const usdcAddress = window.x402.config.chainConfig[chain.id].usdcAddress;
      try {
        statusDiv.textContent = "Checking USDC balance...";
        const balance = await publicClient.readContract({
          address: usdcAddress as `0x${string}`,
          abi: [
            {
              inputs: [{ internalType: "address", name: "account", type: "address" }],
              name: "balanceOf",
              outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
              stateMutability: "view",
              type: "function",
            },
          ],
          functionName: "balanceOf",
          args: [walletClient.account.address],
        });

        if (balance === 0n) {
          statusDiv.textContent = `Your USDC balance is 0. Please make sure you have USDC tokens on ${
            x402.testnet ? "Base Sepolia" : "Base"
          }.`;
          return;
        }

        statusDiv.textContent = "Creating payment signature...";

        const paymentHeader = await createPaymentHeader(walletClient, x402.paymentDetails);

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
        statusDiv.textContent =
          error instanceof Error ? error.message : "Failed to check USDC balance";
      }
    } catch (error) {
      statusDiv.textContent = error instanceof Error ? error.message : "Payment failed";
    }
  });
}

window.addEventListener("load", () => {
  // Update the UI with payment details
  updatePaymentUI();

  initializeApp();
});
