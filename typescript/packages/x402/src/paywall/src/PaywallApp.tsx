"use client";

import { FundButton, getOnrampBuyUrl } from "@coinbase/onchainkit/fund";
import { Avatar, Name } from "@coinbase/onchainkit/identity";
import {
  ConnectWallet,
  Wallet,
  WalletDropdown,
  WalletDropdownDisconnect,
} from "@coinbase/onchainkit/wallet";
import algosdk from "algosdk";
import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
import { createPublicClient, formatUnits, http, publicActions } from "viem";
import { base, baseSepolia } from "viem/chains";
import { useAccount, useSwitchChain, useWalletClient } from "wagmi";

import { selectPaymentRequirements } from "../../client";
import { exact } from "../../schemes";
import type {
  AlgorandClient,
  WalletAccount as AvmWalletAccount,
} from "../../schemes/exact/avm/types";
import { getUSDCBalance } from "../../shared/evm";
import type { Network, PaymentRequirements } from "../../types";
import { Spinner } from "./Spinner";
import { useOnrampSessionToken } from "./useOnrampSessionToken";
import { ensureValidAmount } from "./utils";
import { useAlgorandWallet, type AlgorandNetwork } from "./useAlgorandWallet";

const AVM_NETWORKS = new Set(["algorand", "algorand-testnet"] as const);
const ALGOD_ENDPOINTS = {
  algorand: "https://mainnet-api.algonode.cloud",
  "algorand-testnet": "https://testnet-api.algonode.cloud",
} as const;

type PaywallRuntimeConfig = {
  amount?: number;
  testnet?: boolean;
  paymentRequirements: PaymentRequirements | PaymentRequirements[];
  currentUrl: string;
  cdpClientKey?: string;
  appName?: string;
  appLogo?: string;
  sessionTokenEndpoint?: string;
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

type PaywallProps = {
  config: PaywallRuntimeConfig;
  paymentRequirements: PaymentRequirements;
};

/**
 * Renders protected content returned from the resource server.
 *
 * @param response - The HTTP response from the protected endpoint
 */
async function handleContentResponse(response: Response): Promise<void> {
  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("text/html")) {
    document.documentElement.innerHTML = await response.text();
  } else {
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    window.location.href = url;
  }
}

/**
 * Determines if a network identifier corresponds to an Algorand network.
 *
 * @param network - Network identifier from payment requirements
 * @returns True when the network is Algorand-based
 */
function isAvmNetwork(network: string): boolean {
  return AVM_NETWORKS.has(network as keyof typeof ALGOD_ENDPOINTS);
}

/**
 * Entry-point component for the paywall. Detects the active scheme and renders
 * the appropriate payment experience for the current network.
 *
 * @returns The scheme-specific paywall component
 */
export function PaywallApp(): JSX.Element {
  const config = window.x402 as PaywallRuntimeConfig | undefined;

  const candidateNetworks = useMemo<Network[] | undefined>(() => {
    if (!config) {
      return undefined;
    }
    return (
      config.testnet ? ["base-sepolia", "algorand-testnet"] : ["base", "algorand"]
    ) as Network[];
  }, [config]);

  const paymentRequirements = useMemo<PaymentRequirements | null>(() => {
    if (!config || !candidateNetworks) {
      return null;
    }

    return selectPaymentRequirements(
      [config.paymentRequirements].flat() as PaymentRequirements[],
      candidateNetworks,
      "exact",
    );
  }, [config, candidateNetworks]);

  if (!config || !paymentRequirements) {
    return (
      <div className="container">
        <div className="header">
          <h1 className="title">Payment Required</h1>
          <p className="subtitle">Loading payment details...</p>
        </div>
      </div>
    );
  }

  if (isAvmNetwork(paymentRequirements.network)) {
    return <AvmPaywall config={config} paymentRequirements={paymentRequirements} />;
  }

  return <EvmPaywall config={config} paymentRequirements={paymentRequirements} />;
}

/**
 * Paywall implementation for EVM networks using OnchainKit and wagmi.
 *
 * @param props - Component props containing runtime config and requirements
 * @param props.config - Paywall runtime configuration pulled from the host page
 * @param props.paymentRequirements - Selected payment requirements for the EVM scheme
 * @returns The rendered EVM paywall experience
 */
function EvmPaywall({ config, paymentRequirements }: PaywallProps): JSX.Element {
  const { address, isConnected, chainId: connectedChainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { data: wagmiWalletClient } = useWalletClient();
  const { sessionToken } = useOnrampSessionToken(address);

  const [status, setStatus] = useState<string>("");
  const [isCorrectChain, setIsCorrectChain] = useState<boolean | null>(null);
  const [isPaying, setIsPaying] = useState(false);
  const [formattedUsdcBalance, setFormattedUsdcBalance] = useState<string>("");
  const [hideBalance, setHideBalance] = useState(true);

  const amount = config.amount || 0;
  const testnet = config.testnet ?? true;
  const paymentChain = testnet ? baseSepolia : base;
  const chainName = testnet ? "Base Sepolia" : "Base";
  const showOnramp = Boolean(!testnet && isConnected && config.sessionTokenEndpoint);

  useEffect(() => {
    if (address) {
      handleSwitchChain();
      checkUSDCBalance();
    }
  }, [address]);

  const publicClient = useMemo(() => {
    return createPublicClient({
      chain: paymentChain,
      transport: http(),
    }).extend(publicActions);
  }, [paymentChain]);

  useEffect(() => {
    if (isConnected && paymentChain.id === connectedChainId) {
      setIsCorrectChain(true);
      setStatus("");
    } else if (isConnected && paymentChain.id !== connectedChainId) {
      setIsCorrectChain(false);
      setStatus(`On the wrong network. Please switch to ${chainName}.`);
    } else {
      setIsCorrectChain(null);
      setStatus("");
    }
  }, [paymentChain.id, connectedChainId, isConnected, chainName]);

  const checkUSDCBalance = useCallback(async () => {
    if (!address) {
      return;
    }
    const balance = await getUSDCBalance(publicClient, address);
    const formattedBalance = formatUnits(balance, 6);
    setFormattedUsdcBalance(formattedBalance);
  }, [address, publicClient]);

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

  const handleSwitchChain = useCallback(async () => {
    if (isCorrectChain) {
      return;
    }

    try {
      setStatus("");
      await switchChainAsync({ chainId: paymentChain.id });
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to switch network");
    }
  }, [switchChainAsync, paymentChain, isCorrectChain]);

  const handlePayment = useCallback(async () => {
    if (!address) {
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
      const validPaymentRequirements = ensureValidAmount(paymentRequirements);
      const initialPayment = await exact.evm.createPayment(
        walletClient,
        1,
        validPaymentRequirements,
      );

      const paymentHeader: string = exact.evm.encodePayment(initialPayment);

      setStatus("Requesting content with payment...");
      const response = await fetch(config.currentUrl, {
        headers: {
          "X-PAYMENT": paymentHeader,
          "Access-Control-Expose-Headers": "X-PAYMENT-RESPONSE",
        },
      });

      if (response.ok) {
        await handleContentResponse(response);
      } else if (response.status === 402) {
        const errorData = await response.json().catch(() => ({}));
        if (errorData && typeof errorData.x402Version === "number") {
          const retryPayment = await exact.evm.createPayment(
            walletClient,
            errorData.x402Version,
            validPaymentRequirements,
          );

          retryPayment.x402Version = errorData.x402Version;
          const retryHeader = exact.evm.encodePayment(retryPayment);
          const retryResponse = await fetch(config.currentUrl, {
            headers: {
              "X-PAYMENT": retryHeader,
              "Access-Control-Expose-Headers": "X-PAYMENT-RESPONSE",
            },
          });
          if (retryResponse.ok) {
            await handleContentResponse(retryResponse);
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
  }, [
    address,
    paymentRequirements,
    publicClient,
    chainName,
    config.currentUrl,
    handleSwitchChain,
    wagmiWalletClient,
  ]);

  return (
    <div className="container gap-8">
      <div className="header">
        <h1 className="title">Payment Required</h1>
        <p>
          {paymentRequirements.description && `${paymentRequirements.description}.`} To access this
          content, please pay ${amount} {chainName} USDC.
        </p>
        {testnet && (
          <p className="instructions">
            Need Base Sepolia USDC?{" "}
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

/**
 * Paywall implementation for Algorand networks using a minimal wrapper around WalletManager.
 *
 * @param props - Component props containing runtime config and requirements
 * @param props.config - Paywall runtime configuration pulled from the host page
 * @param props.paymentRequirements - Selected payment requirements for the AVM scheme
 * @returns The rendered Algorand paywall experience
 */
function AvmPaywall({ config, paymentRequirements }: PaywallProps): JSX.Element {
  const [status, setStatus] = useState<string>("");
  const [isPaying, setIsPaying] = useState(false);
  const [hideBalance, setHideBalance] = useState(true);
  const [formattedBalance, setFormattedBalance] = useState<string>("");

  const amount = config.amount ?? 0;
  const decimals = Number(
    (paymentRequirements.extra as { decimals?: number } | undefined)?.decimals ?? 6,
  );
  const assetId = paymentRequirements.asset ?? "0";
  const feePayer = (paymentRequirements.extra as { feePayer?: string } | undefined)?.feePayer;
  const networkLabel = paymentRequirements.network === "algorand" ? "Algorand" : "Algorand Testnet";
  const algodServer =
    ALGOD_ENDPOINTS[paymentRequirements.network as keyof typeof ALGOD_ENDPOINTS] ??
    ALGOD_ENDPOINTS.algorand;

  const algodClient = useMemo(() => new algosdk.Algodv2("", algodServer, ""), [algodServer]);
  const algorandClient = useMemo<AlgorandClient>(() => {
    return {
      client: algodClient,
      network: paymentRequirements.network,
    };
  }, [algodClient, paymentRequirements.network]);

  const algorandNetwork = paymentRequirements.network as AlgorandNetwork;
  const {
    activeAddress,
    accounts,
    connecting,
    error: walletError,
    connect,
    disconnect,
    signTransactions,
    setActiveAccount,
  } = useAlgorandWallet(algorandNetwork, algodClient);

  const validPaymentRequirements = useMemo(
    () => ensureValidAmount(paymentRequirements),
    [paymentRequirements],
  );

  const fetchBalance = useCallback(
    async (address: string) => {
      try {
        const info = await algodClient.accountInformation(address).do();
        if (!assetId || assetId === "0") {
          const microBalance = Number(info?.amount?.toString()) ?? 0;
          console.log("microBalance: ", microBalance);
          const display = (microBalance / 10 ** decimals).toFixed(decimals);
          setFormattedBalance(display);
        } else {
          console.log("Asset ID: ", assetId);
          const parsedId = parseInt(assetId, 10);
          const assets = (info.assets ?? []) as Array<{ "asset-id": number; amount?: number }>;
          const holding = assets.find(asset => asset["asset-id"] === parsedId);
          const amountRaw = Number(holding?.amount?.toString()) ?? 0;
          const display = (amountRaw / 10 ** decimals).toFixed(decimals);
          setFormattedBalance(display);
        }
      } catch (error) {
        console.error("Failed to fetch Algorand balance", error);
        setFormattedBalance("");
      }
    },
    [algodClient, assetId, decimals],
  );

  useEffect(() => {
    if (activeAddress) {
      fetchBalance(activeAddress);
    }
  }, [activeAddress, fetchBalance]);

  useEffect(() => {
    if (walletError) {
      setStatus(walletError);
    }
  }, [walletError]);

  const handleConnect = useCallback(async () => {
    try {
      setStatus("");
      await connect();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to connect wallet");
    }
  }, [connect]);

  const handleDisconnect = useCallback(async () => {
    try {
      await disconnect();
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to disconnect wallet");
    }
  }, [disconnect]);

  const handleAccountSelect = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const nextAccount = accounts.find(account => account.address === event.target.value);
      setActiveAccount(nextAccount);
    },
    [accounts, setActiveAccount],
  );

  const signWithActiveWallet = useCallback(
    async (transactions: Uint8Array[]): Promise<Uint8Array[]> => {
      return signTransactions(transactions);
    },
    [signTransactions],
  );

  const handlePayment = useCallback(async () => {
    if (!activeAddress) {
      setStatus("Please connect an Algorand wallet");
      return;
    }

    setIsPaying(true);

    try {
      const activeAccountDetails = accounts.find(account => account.address === activeAddress);
      const walletAccount: AvmWalletAccount = {
        address: activeAddress,
        name: activeAccountDetails?.name,
        client: algodClient,
        signTransactions: signWithActiveWallet,
      };

      const attemptPayment = async (version: number) => {
        setStatus("Creating payment transaction...");
        const payment = await exact.avm.createPayment(
          algorandClient,
          walletAccount,
          version,
          validPaymentRequirements,
        );

        const header = exact.avm.encodePayment(payment);
        setStatus("Submitting payment...");
        const response = await fetch(config.currentUrl, {
          headers: {
            "X-PAYMENT": header,
            "Access-Control-Expose-Headers": "X-PAYMENT-RESPONSE",
          },
        });

        if (response.ok) {
          await handleContentResponse(response);
          return true;
        }

        if (response.status === 402) {
          const errorData = await response.json().catch(() => ({}));
          const updatedVersion =
            typeof errorData.x402Version === "number" ? errorData.x402Version : null;
          if (updatedVersion && updatedVersion !== version) {
            return attemptPayment(updatedVersion);
          }
          throw new Error(`Payment failed: ${response.statusText}`);
        }

        throw new Error(`Request failed: ${response.status} ${response.statusText}`);
      };

      await attemptPayment(1);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Payment failed");
    } finally {
      setIsPaying(false);
    }
  }, [
    activeAddress,
    accounts,
    algorandClient,
    algodClient,
    validPaymentRequirements,
    config.currentUrl,
    signWithActiveWallet,
  ]);

  const displayAmount =
    amount || Number(validPaymentRequirements.maxAmountRequired) / 10 ** decimals;
  const assetLabel = assetId === "0" ? "ALGO" : `Asset ${assetId}`;

  const formattedAddress = activeAddress
    ? `${activeAddress.slice(0, 5)}...${activeAddress.slice(-5)}`
    : "Not connected";

  return (
    <div className="container gap-8">
      <div className="header">
        <h1 className="title">Payment Required</h1>
        <p>
          {paymentRequirements.description && `${paymentRequirements.description}.`} To access this
          content, please pay {displayAmount} {assetLabel} on {networkLabel}.
        </p>
        {paymentRequirements.network === "algorand-testnet" && (
          <p className="instructions">
            Need Algorand Testnet funds?{" "}
            <a
              href="https://bank.testnet.algorand.network/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Request them <u>here</u>.
            </a>
          </p>
        )}
      </div>

      <div className="content w-full">
        {!activeAddress ? (
          <div className="payment-details">
            <button className="button button-primary" onClick={handleConnect} disabled={connecting}>
              {connecting ? <Spinner /> : "Connect Pera Wallet"}
            </button>
            {status && !connecting && <div className="status">{status}</div>}
          </div>
        ) : (
          <div id="payment-section">
            <div className="payment-details">
              <div className="payment-row">
                <span className="payment-label">Wallet:</span>
                <span className="payment-value">{formattedAddress}</span>
              </div>
              {accounts.length > 1 && (
                <div className="payment-row">
                  <span className="payment-label">Account:</span>
                  <span className="payment-value">
                    <select
                      value={activeAddress}
                      onChange={handleAccountSelect}
                      className="account-select"
                    >
                      {accounts.map(account => {
                        const short = `${account.address.slice(0, 5)}...${account.address.slice(-5)}`;
                        const label = account.name ? `${account.name} (${short})` : short;
                        return (
                          <option key={account.address} value={account.address}>
                            {label}
                          </option>
                        );
                      })}
                    </select>
                  </span>
                </div>
              )}
              <div className="payment-row">
                <span className="payment-label">Available balance:</span>
                <span className="payment-value">
                  <button className="balance-button" onClick={() => setHideBalance(prev => !prev)}>
                    {formattedBalance && !hideBalance
                      ? `${formattedBalance} ${assetLabel}`
                      : "•••••"}
                  </button>
                </span>
              </div>
              <div className="payment-row">
                <span className="payment-label">Amount:</span>
                <span className="payment-value">
                  {displayAmount} {assetLabel}
                </span>
              </div>
              <div className="payment-row">
                <span className="payment-label">Network:</span>
                <span className="payment-value">{networkLabel}</span>
              </div>
              {feePayer && (
                <div className="payment-row">
                  <span className="payment-label">Fees covered by:</span>
                  <span className="payment-value">
                    {`${feePayer.slice(0, 6)}...${feePayer.slice(-6)}`}
                  </span>
                </div>
              )}
            </div>

            <div className="cta-container">
              <button className="button" onClick={handleDisconnect}>
                Disconnect wallet
              </button>
              <button className="button button-primary" onClick={handlePayment} disabled={isPaying}>
                {isPaying ? <Spinner /> : "Pay now"}
              </button>
            </div>
          </div>
        )}
        {status && activeAddress && <div className="status">{status}</div>}
      </div>
    </div>
  );
}
