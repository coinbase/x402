import React, { useState, useEffect, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { createWalletClient, createPublicClient, http, custom, publicActions, Chain } from "viem";
import { base, baseSepolia } from "viem/chains";

import { createPayment, createPaymentHeader } from "../schemes/exact/evm/client";
import { createNonce, signAuthorization } from "../schemes/exact/evm/sign";
import { encodePayment } from "../schemes/exact/evm/utils/paymentUtils";
import { getUSDCBalance, getVersion } from "../shared/evm/usdc";

import type { SignerWallet } from "../types/shared/evm";
import type { PaymentRequirements } from "../types/verify";
import type { Network } from "../types/shared";
import {
  safeBase64Encode,
  selectPaymentRequirements,
  ensureValidAmount,
  connectWallet,
} from "./src/utils";

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

/**
 * Main Paywall App Component
 */
function PaywallApp() {
  const [isConnected, setIsConnected] = useState(false);
  const [address, setAddress] = useState<`0x${string}`>();
  const [walletClient, setWalletClient] = useState<SignerWallet | null>(null);
  const [status, setStatus] = useState<string>("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [isPaying, setIsPaying] = useState(false);

  const x402 = window.x402;
  const chain = x402?.testnet ? baseSepolia : base;
  const network = x402?.testnet ? "base-sepolia" : "base";
  const amount = x402?.amount || 0;
  const testnet = x402?.testnet ?? true;
  const chainName = testnet ? "Base Sepolia" : "Base";

  const publicClient = createPublicClient({
    chain,
    transport: http(),
  }).extend(publicActions);

  const paymentRequirements = x402
    ? selectPaymentRequirements(x402.paymentRequirements, network as Network, "exact")
    : null;

  useEffect(() => {
    ensureFunctionsAreAvailable();
  }, []);

  const handleWalletConnect = useCallback(async () => {
    if (!x402 || !chain) return;

    setIsConnecting(true);
    setStatus("Connecting wallet...");

    try {
      const connectedAddress = await connectWallet(chain);

      if (!connectedAddress || !window.ethereum) {
        throw new Error("No account selected in your wallet");
      }

      const client = createWalletClient({
        chain,
        transport: custom(window.ethereum),
        account: connectedAddress,
      }).extend(publicActions) as SignerWallet;

      setAddress(connectedAddress);
      setWalletClient(client);
      setIsConnected(true);
      setStatus("Wallet connected! You can now proceed with payment.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to connect wallet");
      setIsConnected(false);
    } finally {
      setIsConnecting(false);
    }
  }, [x402, chain]);

  const handlePayment = useCallback(async () => {
    if (!walletClient || !address || !x402 || !paymentRequirements) {
      setStatus("No wallet connected. Please connect your wallet first.");
      return;
    }

    setIsPaying(true);

    try {
      setStatus("Checking USDC balance...");
      const balance = await getUSDCBalance(publicClient, address);

      if (balance === 0n) {
        throw new Error(
          `Your USDC balance is 0. Please make sure you have USDC tokens on ${chain.name}`,
        );
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to check USDC balance");
      return;
    }

    setStatus("Creating payment signature...");

    try {
      const validPaymentRequirements = ensureValidAmount(paymentRequirements);

      // Create payment with x402Version=1
      const initialPayment = await createPayment(walletClient, 1, validPaymentRequirements);
      initialPayment.x402Version = 1;

      const paymentHeader = safeBase64Encode(JSON.stringify(initialPayment));

      setStatus("Requesting content with payment...");

      // Helper function to handle successful responses
      const handleSuccessfulResponse = async (response: Response) => {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("text/html")) {
          document.documentElement.innerHTML = await response.text();
        } else {
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          window.location.href = url;
        }
      };

      const response = await fetch(x402.currentUrl, {
        headers: {
          "X-PAYMENT": paymentHeader,
          "Access-Control-Expose-Headers": "X-PAYMENT-RESPONSE",
        },
      });

      if (response.ok) {
        await handleSuccessfulResponse(response);
      } else if (response.status === 402) {
        // Try to parse error data, fallback to empty object if parsing fails
        const errorData = await response.json().catch(() => ({}));

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
            await handleSuccessfulResponse(retryResponse);
            return;
          } else {
            throw new Error(`Payment retry failed: ${retryResponse.statusText}`);
          }
        } else {
          throw new Error(`Payment failed: ${response.statusText}`);
        }
      } else {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Payment failed");
    } finally {
      setIsPaying(false);
    }
  }, [walletClient, address, x402, paymentRequirements, publicClient, chain]);

  if (!x402 || !paymentRequirements) {
    return (
      <div className="container">
        <div className="header">
          <h1 className="title">Payment Required homie</h1>
          <p className="subtitle">Loading payment details...</p>
        </div>
      </div>
    );
  }

  const description = paymentRequirements.description
    ? `${paymentRequirements.description}. To access this content, please pay $${amount} ${chainName} USDC.`
    : `To access this content, please pay $${amount} ${chainName} USDC.`;

  return (
    <div className="container">
      <div className="header">
        <h1 className="title">Payment Required homie</h1>
        <p className="subtitle">{description}</p>
        {testnet && (
          <p className="instructions">
            Need Base Sepolia USDC?{" "}
            <a href="https://faucet.circle.com/" target="_blank" rel="noopener noreferrer">
              Get some here.
            </a>
          </p>
        )}
      </div>

      <div className="content">
        {!isConnected ? (
          <div id="connect-section">
            <button
              className="button button-primary"
              onClick={handleWalletConnect}
              disabled={isConnecting}
            >
              {isConnecting ? "Connecting..." : "Connect wallet"}
            </button>
          </div>
        ) : (
          <div id="payment-section">
            <div className="payment-details">
              <div className="payment-row">
                <span className="payment-label">Wallet:</span>
                <span className="payment-value">
                  {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "Loading..."}
                </span>
              </div>
              <div className="payment-row">
                <span className="payment-label">Amount:</span>
                <span className="payment-value">${amount} USDC</span>
              </div>
              <div className="payment-row">
                <span className="payment-label">Network:</span>
                <span className="payment-value">{chainName}</span>
              </div>
            </div>

            <button className="button button-secondary" onClick={handlePayment} disabled={isPaying}>
              {isPaying ? "Processing..." : "Pay Now"}
            </button>
          </div>
        )}

        {status && <div className="status">{status}</div>}
      </div>
    </div>
  );
}

// Initialize the app when the window loads
window.addEventListener("load", () => {
  const rootElement = document.getElementById("root");
  if (!rootElement) {
    console.error("Root element not found");
    return;
  }

  const root = createRoot(rootElement);
  root.render(<PaywallApp />);
});
