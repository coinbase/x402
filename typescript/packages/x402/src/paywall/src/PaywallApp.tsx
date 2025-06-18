import { useState, useEffect, useCallback } from "react";

import { createWalletClient, createPublicClient, http, custom, publicActions } from "viem";
import { base, baseSepolia } from "viem/chains";

import { preparePaymentHeader } from "../../schemes/exact/evm/client";
import { createNonce, signAuthorization } from "../../schemes/exact/evm/sign";
import { encodePayment } from "../../schemes/exact/evm/utils/paymentUtils";
import { getUSDCBalance, getVersion } from "../../shared/evm/usdc";

import type { SignerWallet } from "../../types/shared/evm";
import type { PaymentPayload, PaymentRequirements } from "../../types/verify";
import type { Network } from "../../types/shared";

import { selectPaymentRequirements, ensureValidAmount } from "./utils";
import {
  ConnectWallet,
  Wallet,
  WalletDropdown,
  WalletDropdownDisconnect,
} from "@coinbase/onchainkit/wallet";
import { Address, Avatar, Name, Identity } from "@coinbase/onchainkit/identity";
import { useAccount, useSignTypedData } from "wagmi";
import { getNetworkId } from "../../shared/network";
import { exact } from "../../schemes";

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ethereum?: any;
  }
}

/**
 * Makes sure required functions are bundled
 *
 * @returns An object containing all required functions
 */
function ensureFunctionsAreAvailable() {
  return {
    signAuthorization,
    createNonce,
    getVersion,
    encodePayment,
  };
}

const CLIENT_SUPPORTED_VERSIONS = [1, 2];
const preferredx402Version = CLIENT_SUPPORTED_VERSIONS[0];

/**
 * Main Paywall App Component
 *
 * @returns The PaywallApp component
 */
export function PaywallApp() {
  const { address, isConnected } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();

  const [status, setStatus] = useState<string>("");
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

  const walletClient = createWalletClient({
    chain,
    transport: custom(window.ethereum),
    account: address,
  }).extend(publicActions) as SignerWallet;

  const paymentRequirements = x402
    ? selectPaymentRequirements(x402.paymentRequirements, network as Network, "exact")
    : null;

  useEffect(() => {
    ensureFunctionsAreAvailable();
  }, []);

  const handleSuccessfulResponse = useCallback(async (response: Response) => {
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("text/html")) {
      document.documentElement.innerHTML = await response.text();
    } else {
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      window.location.href = url;
    }
  }, []);

  const preparePayment = useCallback(
    async (x402Version = preferredx402Version) => {
      if (!paymentRequirements || !address) {
        throw new Error("Payment requirements are not set");
      }

      const validPaymentRequirements = ensureValidAmount(paymentRequirements);

      const unSignedPaymentHeader = preparePaymentHeader(
        address,
        x402Version,
        validPaymentRequirements,
      );

      const eip712Data = {
        types: {
          TransferWithAuthorization: [
            { name: "from", type: "address" },
            { name: "to", type: "address" },
            { name: "value", type: "uint256" },
            { name: "validAfter", type: "uint256" },
            { name: "validBefore", type: "uint256" },
            { name: "nonce", type: "bytes32" },
          ],
        },
        domain: {
          name: validPaymentRequirements.extra?.name,
          version: validPaymentRequirements.extra?.version,
          chainId: getNetworkId(validPaymentRequirements.network),
          verifyingContract: validPaymentRequirements.asset as `0x${string}`,
        },
        primaryType: "TransferWithAuthorization" as const,
        message: unSignedPaymentHeader.payload.authorization,
      };

      return {
        unSignedPaymentHeader,
        eip712Data,
      };
    },
    [paymentRequirements, address],
  );

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
      const { unSignedPaymentHeader, eip712Data } = await preparePayment();
      const signature = await signTypedDataAsync(eip712Data);
      const paymentPayload: PaymentPayload = {
        ...unSignedPaymentHeader,
        payload: {
          ...unSignedPaymentHeader.payload,
          signature,
        },
      };

      const paymentHeader: string = exact.evm.encodePayment(paymentPayload);

      setStatus("Requesting content with payment...");

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
          const { unSignedPaymentHeader: retryUnSignedPaymentHeader, eip712Data: retryEip712Data } =
            await preparePayment(errorData.x402Version);
          const signature = await signTypedDataAsync(retryEip712Data);
          const retryPaymentPayload: PaymentPayload = {
            ...retryUnSignedPaymentHeader,
            payload: {
              ...retryUnSignedPaymentHeader.payload,
              signature,
            },
          };
          const retryHeader: string = exact.evm.encodePayment(retryPaymentPayload);
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
          <h1 className="title">Payment Required</h1>
          <p className="subtitle">Loading payment details...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="header">
        <h1 className="title">Payment Required</h1>
        {paymentRequirements.description && (
          <p className="subtitle">{paymentRequirements.description}.</p>
        )}
        <p>
          To access this content, please pay ${amount} {chainName} USDC.
        </p>
        {testnet && (
          <p className="instructions">
            Need Base Sepolia USDC?{" "}
            <a href="https://faucet.circle.com/" target="_blank" rel="noopener noreferrer">
              Get some here.
            </a>
          </p>
        )}
      </div>

      <Wallet>
        <ConnectWallet>
          <Avatar />
          <Name />
        </ConnectWallet>
        <WalletDropdown>
          <Identity className="px-4 pt-3 pb-2" hasCopyAddressOnClick>
            <Avatar />
            <Name />
            <Address />
          </Identity>
          <WalletDropdownDisconnect />
        </WalletDropdown>
      </Wallet>

      <div className="content">
        {isConnected && (
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
