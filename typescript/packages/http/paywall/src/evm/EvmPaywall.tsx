import { FundButton, getOnrampBuyUrl } from "@coinbase/onchainkit/fund";
import { Avatar, Name } from "@coinbase/onchainkit/identity";
import {
  ConnectWallet,
  Wallet,
  WalletDropdown,
  WalletDropdownDisconnect,
} from "@coinbase/onchainkit/wallet";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPublicClient, formatUnits, http, publicActions } from "viem";
import { base, baseSepolia } from "viem/chains";
import { useAccount, useSwitchChain, useWalletClient } from "wagmi";

import { createEvmClient } from "@x402/evm/client";
import type { PaymentRequired } from "@x402/core/types";
import { getUSDCBalance } from "x402/shared/evm";

import { Spinner } from "./Spinner";
import { useOnrampSessionToken } from "./useOnrampSessionToken";
import { getNetworkDisplayName, isTestnetNetwork } from "../paywallUtils";
import { wagmiToClientSigner } from "./browserAdapter";

type EvmPaywallProps = {
  paymentRequired: PaymentRequired;
  onSuccessfulResponse: (response: Response) => Promise<void>;
};

/**
 * Paywall experience for EVM networks.
 *
 * @param props - Component props.
 * @param props.paymentRequired - Payment required response with accepts array.
 * @param props.onSuccessfulResponse - Callback fired once the 402 fetch succeeds.
 * @returns JSX element.
 */
export function EvmPaywall({ paymentRequired, onSuccessfulResponse }: EvmPaywallProps) {
  const { address, isConnected, chainId: connectedChainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { data: wagmiWalletClient } = useWalletClient();
  const { sessionToken } = useOnrampSessionToken(address);

  const [status, setStatus] = useState<string>("");
  const [isCorrectChain, setIsCorrectChain] = useState<boolean | null>(null);
  const [isPaying, setIsPaying] = useState(false);
  const [formattedUsdcBalance, setFormattedUsdcBalance] = useState<string>("");
  const [hideBalance, setHideBalance] = useState(true);

  const x402 = window.x402;
  const amount = x402.amount;

  const firstRequirement = paymentRequired.accepts[0];
  if (!firstRequirement) {
    throw new Error("No payment requirements in paymentRequired.accepts");
  }

  const network = firstRequirement.network;
  const chainName = getNetworkDisplayName(network);
  const testnet = isTestnetNetwork(network);
  const showOnramp = Boolean(!testnet && isConnected && x402.sessionTokenEndpoint);

  // Extract chain ID from network (eip155:84532 -> 84532)
  const chainId = network.includes(":") ? parseInt(network.split(":")[1]) : 8453;

  // Use default chains for now (Base or Base Sepolia)
  // TODO: Support all EVM chains dynamically
  const paymentChain = chainId === 84532 ? baseSepolia : base;

  const publicClient = useMemo(
    () =>
      createPublicClient({
        chain: paymentChain,
        transport: http(),
      }).extend(publicActions),
    [paymentChain],
  );

  const checkUSDCBalance = useCallback(async () => {
    if (!address) {
      return;
    }
    const balance = await getUSDCBalance(publicClient, address);
    const formattedBalance = formatUnits(balance, 6);
    setFormattedUsdcBalance(formattedBalance);
  }, [address, publicClient]);

  const handleSwitchChain = useCallback(async () => {
    if (isCorrectChain) {
      return;
    }

    try {
      setStatus("");
      await switchChainAsync({ chainId });
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to switch network");
    }
  }, [switchChainAsync, chainId, isCorrectChain]);

  useEffect(() => {
    if (!address) {
      return;
    }

    void handleSwitchChain();
    void checkUSDCBalance();
  }, [address, handleSwitchChain, checkUSDCBalance]);

  useEffect(() => {
    if (isConnected && chainId === connectedChainId) {
      setIsCorrectChain(true);
      setStatus("");
    } else if (isConnected && chainId !== connectedChainId) {
      setIsCorrectChain(false);
      setStatus(`On the wrong network. Please switch to ${chainName}.`);
    } else {
      setIsCorrectChain(null);
      setStatus("");
    }
  }, [chainId, connectedChainId, isConnected, chainName]);

  const onrampBuyUrl = useMemo(() => {
    if (!sessionToken) {
      return undefined;
    }
    return getOnrampBuyUrl({
      presetFiatAmount: 2,
      fiatCurrency: "USD",
      sessionToken,
    });
  }, [sessionToken]);

  const handlePayment = useCallback(async () => {
    if (!address || !x402) {
      return;
    }

    await handleSwitchChain();

    if (!wagmiWalletClient) {
      setStatus("Wallet client not available. Please reconnect your wallet.");
      return;
    }
    const walletClient = wagmiWalletClient.extend(publicActions);

    setIsPaying(true);

    try {
      setStatus("Checking USDC balance...");
      const balance = await getUSDCBalance(publicClient, address);

      if (balance === 0n) {
        throw new Error(`Insufficient balance. Make sure you have USDC on ${chainName}`);
      }

      setStatus("Creating payment signature...");

      // Create pre-configured EVM client (handles v1 and v2)
      const signer = wagmiToClientSigner(walletClient);
      const client = createEvmClient({ signer });

      // Create payment payload - client automatically handles version
      const paymentPayload = await client.createPaymentPayload(paymentRequired);

      // Encode as base64 JSON for v2 header
      const paymentHeader = btoa(JSON.stringify(paymentPayload));

      setStatus("Requesting content with payment...");
      const response = await fetch(x402.currentUrl, {
        headers: {
          "PAYMENT-SIGNATURE": paymentHeader,
          "Access-Control-Expose-Headers": "PAYMENT-RESPONSE",
        },
      });

      if (response.ok) {
        await onSuccessfulResponse(response);
      } else {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Payment failed");
    } finally {
      setIsPaying(false);
    }
  }, [
    address,
    x402,
    paymentRequired,
    handleSwitchChain,
    wagmiWalletClient,
    publicClient,
    chainName,
    onSuccessfulResponse,
  ]);

  if (!x402) {
    return null;
  }

  return (
    <div className="container gap-8">
      <div className="header">
        <h1 className="title">Payment Required</h1>
        <p>
          {paymentRequired.resource?.description && `${paymentRequired.resource.description}.`} To
          access this content, please pay ${amount} {chainName} USDC.
        </p>
        {testnet && (
          <p className="instructions">
            Need {chainName} USDC?{" "}
            <a href="https://faucet.circle.com/" target="_blank" rel="noopener noreferrer">
              Get some <u>here</u>.
            </a>
          </p>
        )}
      </div>

      <div className="content w-full">
        <Wallet className="w-full">
          <ConnectWallet className="w-full py-3" disconnectedLabel="Connect wallet">
            <Avatar className="h-5 w-5 opacity-80" />
            <Name className="opacity-80 text-sm" />
          </ConnectWallet>
          <WalletDropdown>
            <WalletDropdownDisconnect className="opacity-80" />
          </WalletDropdown>
        </Wallet>
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
                <span className="payment-label">Available balance:</span>
                <span className="payment-value">
                  <button className="balance-button" onClick={() => setHideBalance(prev => !prev)}>
                    {formattedUsdcBalance && !hideBalance
                      ? `$${formattedUsdcBalance} USDC`
                      : "••••• USDC"}
                  </button>
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

            {isCorrectChain ? (
              <div className="cta-container">
                {showOnramp && (
                  <FundButton
                    fundingUrl={onrampBuyUrl}
                    text="Get more USDC"
                    hideIcon
                    className="button button-positive"
                  />
                )}
                <button
                  className="button button-primary"
                  onClick={handlePayment}
                  disabled={isPaying}
                >
                  {isPaying ? <Spinner /> : "Pay now"}
                </button>
              </div>
            ) : (
              <button className="button button-primary" onClick={handleSwitchChain}>
                Switch to {chainName}
              </button>
            )}
          </div>
        )}
        {status && <div className="status">{status}</div>}
      </div>
    </div>
  );
}
