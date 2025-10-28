import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatUnits } from "viem";
import {
  address as toAddress,
  getTransactionDecoder,
  getTransactionEncoder,
  type Address,
  type TransactionSigner,
} from "@solana/kit";
import { getWallets } from "@wallet-standard/app";
import type { Wallet, WalletAccount } from "@wallet-standard/base";
import { StandardConnect, StandardDisconnect, StandardEvents } from "@wallet-standard/features";
import {
  SolanaSignTransaction,
  type WalletWithSolanaFeatures,
} from "@solana/wallet-standard-features";
import {
  findAssociatedTokenPda,
  fetchMint,
  TOKEN_2022_PROGRAM_ADDRESS,
} from "@solana-program/token-2022";
import {
  TOKEN_PROGRAM_ADDRESS,
  fetchMaybeToken as fetchMaybeSplToken,
} from "@solana-program/token";
import { fetchMaybeToken as fetchMaybeToken2022 } from "@solana-program/token-2022";
import type { SignatureDictionary } from "@solana/signers";

import type { PaymentRequirements } from "../../types/verify";
import { exact } from "../../schemes";
import { getRpcClient } from "../../shared/svm/rpc";

import { Spinner } from "./Spinner";
import { ensureValidAmount } from "./utils";
import { getNetworkDisplayName } from "./paywallUtils";

type SolanaPaywallProps = {
  paymentRequirement: PaymentRequirements;
  onSuccessfulResponse: (response: Response) => Promise<void>;
};

type WalletOption = {
  value: string;
  wallet: WalletWithSolanaFeatures;
};

/**
 * Paywall experience for Solana networks.
 *
 * @param props - Component props.
 * @param props.paymentRequirement - Payment requirement enforced for Solana requests.
 * @param props.onSuccessfulResponse - Callback invoked on successful 402 response.
 * @returns JSX element.
 */
export function SolanaPaywall({ paymentRequirement, onSuccessfulResponse }: SolanaPaywallProps) {
  const [status, setStatus] = useState<string>("");
  const [isPaying, setIsPaying] = useState(false);
  const [walletOptions, setWalletOptions] = useState<WalletOption[]>([]);
  const [selectedWalletValue, setSelectedWalletValue] = useState<string>("");
  const [activeWallet, setActiveWallet] = useState<WalletWithSolanaFeatures | null>(null);
  const [activeAccount, setActiveAccount] = useState<WalletAccount | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<bigint | null>(null);
  const [formattedBalance, setFormattedBalance] = useState<string>("");
  const [hideBalance, setHideBalance] = useState(true);
  const [isFetchingBalance, setIsFetchingBalance] = useState(false);
  const attemptedSilentConnectWalletsRef = useRef<Set<string>>(new Set());

  const x402 = window.x402;
  const amount =
    typeof x402.amount === "number"
      ? x402.amount
      : Number(paymentRequirement.maxAmountRequired ?? 0) / 1_000_000;

  const network = paymentRequirement.network;
  const chainName = getNetworkDisplayName(network);
  const targetChain =
    network === "solana" ? ("solana:mainnet" as const) : ("solana:devnet" as const);

  useEffect(() => {
    if (!selectedWalletValue && walletOptions.length === 1) {
      setSelectedWalletValue(walletOptions[0].value);
    }
  }, [walletOptions, selectedWalletValue]);

  useEffect(() => {
    if (!activeWallet) {
      return;
    }

    if (!walletOptions.some(option => option.wallet === activeWallet)) {
      setActiveWallet(null);
      setActiveAccount(null);
      setSelectedWalletValue("");
      setUsdcBalance(null);
      setFormattedBalance("");
    }
  }, [walletOptions, activeWallet]);

  /**
   * Refresh the available wallets when the component mounts and when wallets register/unregister.
   */
  useEffect(() => {
    const walletsApi = getWallets();

    const mapWallets = (): WalletOption[] =>
      walletsApi
        .get()
        .filter(hasSolanaSigning)
        .map(wallet => ({
          value: wallet.name,
          wallet,
        }));

    setWalletOptions(mapWallets());

    const offRegister = walletsApi.on("register", () => {
      setWalletOptions(mapWallets());
    });
    const offUnregister = walletsApi.on("unregister", () => {
      setWalletOptions(mapWallets());
    });

    return () => {
      offRegister();
      offUnregister();
    };
  }, []);

  /**
   * Derive the signer used to authorize Solana token transfers.
   */
  const walletSigner = useMemo<TransactionSigner<string> | null>(() => {
    if (!activeWallet || !activeAccount) {
      return null;
    }

    const signFeature = activeWallet.features[SolanaSignTransaction];
    if (!signFeature) {
      return null;
    }

    const signerAddress = toAddress(activeAccount.address);
    const encoder = getTransactionEncoder();
    const decoder = getTransactionDecoder();

    return {
      address: signerAddress,
      async signTransactions(transactions) {
        const signatures: SignatureDictionary[] = [];

        for (const transaction of transactions) {
          const serialized = encoder.encode(transaction);
          const [signed] = await signFeature.signTransaction({
            account: activeAccount,
            transaction: serialized,
            chain: targetChain,
          });

          const decodedTransaction = decoder.decode(signed.signedTransaction);
          const signature = decodedTransaction.signatures[signerAddress];

          if (!signature) {
            throw new Error("Wallet did not return a signature for the selected account.");
          }

          signatures.push(
            Object.freeze({
              [signerAddress]: signature,
            }) as SignatureDictionary,
          );
        }

        return signatures;
      },
    };
  }, [activeWallet, activeAccount, targetChain]);

  /**
   * Fetch the USDC balance for the provided account (defaults to the active account).
   *
   * @param account - Wallet account to fetch balance for.
   * @returns The fetched balance, or null if unavailable.
   */
  const refreshBalance = useCallback(
    async (account: WalletAccount | null = activeAccount) => {
      if (!account) {
        setUsdcBalance(null);
        setFormattedBalance("");
        return null;
      }

      try {
        setIsFetchingBalance(true);

        const rpc = getRpcClient(paymentRequirement.network);
        const mint = await fetchMint(rpc, paymentRequirement.asset as Address);
        const tokenProgramAddress = mint.programAddress;
        const [ata] = await findAssociatedTokenPda({
          mint: paymentRequirement.asset as Address,
          owner: toAddress(account.address),
          tokenProgram: tokenProgramAddress,
        });

        let balance = 0n;
        if (tokenProgramAddress.toString() === TOKEN_PROGRAM_ADDRESS.toString()) {
          const tokenAccount = await fetchMaybeSplToken(rpc, ata);
          if (tokenAccount.exists) {
            balance = tokenAccount.data.amount;
          }
        } else if (tokenProgramAddress.toString() === TOKEN_2022_PROGRAM_ADDRESS.toString()) {
          const tokenAccount = await fetchMaybeToken2022(rpc, ata);
          if (tokenAccount.exists) {
            balance = tokenAccount.data.amount;
          }
        }

        setUsdcBalance(balance);
        setFormattedBalance(formatUnits(balance, mint.data.decimals));
        return balance;
      } catch (error) {
        console.error("Failed to fetch Solana USDC balance", error);
        setStatus("Unable to read your USDC balance. Please retry.");
        setUsdcBalance(null);
        setFormattedBalance("");
        return null;
      } finally {
        setIsFetchingBalance(false);
      }
    },
    [activeAccount, paymentRequirement],
  );

  useEffect(() => {
    if (activeAccount) {
      void refreshBalance();
    }
  }, [activeAccount, refreshBalance]);

  useEffect(() => {
    if (activeWallet) {
      return;
    }

    for (const option of walletOptions) {
      if (attemptedSilentConnectWalletsRef.current.has(option.value)) {
        continue;
      }

      attemptedSilentConnectWalletsRef.current.add(option.value);
      const connectFeature = option.wallet.features[StandardConnect];
      if (!connectFeature) {
        continue;
      }

      void (async () => {
        try {
          const { accounts } = await connectFeature.connect({ silent: true });
          if (!accounts?.length) {
            return;
          }

          const matchingAccount =
            accounts.find(account => account.chains?.includes(targetChain)) ?? accounts[0];
          if (!matchingAccount) {
            return;
          }

          setSelectedWalletValue(option.value);
          setActiveWallet(option.wallet);
          setActiveAccount(matchingAccount);
          setStatus("");
          await refreshBalance(matchingAccount);
        } catch {
          // Wallet may throw if silent connect isn't supported or authorization is missing. Ignore.
        }
      })();
    }
  }, [walletOptions, activeWallet, targetChain, refreshBalance]);

  useEffect(() => {
    if (!activeWallet) {
      return;
    }

    const eventsFeature = activeWallet.features[StandardEvents];
    if (!eventsFeature) {
      return;
    }

    const unsubscribe = eventsFeature.on("change", properties => {
      if (properties.features && !properties.features[SolanaSignTransaction]) {
        setActiveWallet(null);
        setActiveAccount(null);
        setSelectedWalletValue("");
        setUsdcBalance(null);
        setFormattedBalance("");
        setStatus("Selected wallet no longer supports Solana signing. Please reconnect.");
        return;
      }

      if (properties.accounts) {
        if (!properties.accounts.length) {
          setActiveAccount(null);
          setUsdcBalance(null);
          setFormattedBalance("");
          setStatus("Wallet disconnected. Select a wallet to reconnect.");
          return;
        }

        const nextAccount =
          properties.accounts.find(account => account.chains?.includes(targetChain)) ??
          properties.accounts[0] ??
          null;

        setActiveAccount(nextAccount);

        if (!nextAccount) {
          setStatus("No authorized Solana accounts available. Reconnect your wallet.");
          setUsdcBalance(null);
          setFormattedBalance("");
          return;
        }

        if (nextAccount.chains?.includes(targetChain)) {
          setStatus("");
        } else {
          setStatus(`Switch your wallet to ${chainName} to continue.`);
        }

        void refreshBalance(nextAccount);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [activeWallet, targetChain, chainName, refreshBalance]);

  const handleConnect = useCallback(async () => {
    const wallet = walletOptions.find(option => option.value === selectedWalletValue)?.wallet;
    if (!wallet) {
      setStatus("Select a Solana wallet to continue.");
      return;
    }

    const connectFeature = wallet.features[StandardConnect];
    if (!connectFeature) {
      setStatus("Selected wallet does not support standard connect.");
      return;
    }

    try {
      setStatus("Connecting to wallet...");
      const { accounts } = await connectFeature.connect();
      if (!accounts?.length) {
        throw new Error("Wallet did not provide any accounts.");
      }

      const matchingAccount =
        accounts.find(account => account.chains?.includes(targetChain)) ?? accounts[0];

      setActiveWallet(wallet);
      setActiveAccount(matchingAccount);
      setStatus("");
      await refreshBalance(matchingAccount);
    } catch (error) {
      console.error("Failed to connect wallet", error);
      setStatus(error instanceof Error ? error.message : "Failed to connect wallet.");
    }
  }, [walletOptions, selectedWalletValue, targetChain, refreshBalance]);

  const handleDisconnect = useCallback(async () => {
    if (activeWallet?.features[StandardDisconnect]) {
      await activeWallet.features[StandardDisconnect].disconnect().catch(console.error);
    }
    setActiveWallet(null);
    setActiveAccount(null);
    setUsdcBalance(null);
    setFormattedBalance("");
    setStatus("");
  }, [activeWallet]);

  const handlePayment = useCallback(async () => {
    if (!x402) {
      return;
    }

    if (!walletSigner || !activeAccount) {
      setStatus("Connect a Solana wallet before paying.");
      return;
    }

    setIsPaying(true);

    try {
      if (usdcBalance === null || usdcBalance === 0n) {
        setStatus("Checking USDC balance...");
        const latestBalance = await refreshBalance();
        if (!latestBalance || latestBalance === 0n) {
          throw new Error(`Insufficient balance. Make sure you have USDC on ${chainName}.`);
        }
      }

      setStatus("Creating payment transaction...");
      const validPaymentRequirements = ensureValidAmount(paymentRequirement);

      const createHeader = async (version: number) =>
        exact.svm.createPaymentHeader(
          walletSigner as TransactionSigner,
          version,
          validPaymentRequirements,
        );

      const paymentHeader = await createHeader(1);

      setStatus("Requesting content with payment...");
      const response = await fetch(x402.currentUrl, {
        headers: {
          "X-PAYMENT": paymentHeader,
          "Access-Control-Expose-Headers": "X-PAYMENT-RESPONSE",
        },
      });

      if (response.ok) {
        await onSuccessfulResponse(response);
        return;
      }

      if (response.status === 402) {
        const errorData = await response.json().catch(() => ({}));
        if (errorData && typeof errorData.x402Version === "number") {
          const retryHeader = await createHeader(errorData.x402Version);
          const retryResponse = await fetch(x402.currentUrl, {
            headers: {
              "X-PAYMENT": retryHeader,
              "Access-Control-Expose-Headers": "X-PAYMENT-RESPONSE",
            },
          });
          if (retryResponse.ok) {
            await onSuccessfulResponse(retryResponse);
            return;
          }
          throw new Error(`Payment retry failed: ${retryResponse.statusText}`);
        }
      }

      throw new Error(`Payment failed: ${response.status} ${response.statusText}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Payment failed.");
    } finally {
      setIsPaying(false);
    }
  }, [
    x402,
    walletSigner,
    activeAccount,
    usdcBalance,
    refreshBalance,
    chainName,
    paymentRequirement,
    onSuccessfulResponse,
  ]);

  return (
    <div className="container gap-8">
      <div className="header">
        <h1 className="title">Payment Required</h1>
        <p>
          {paymentRequirement.description && `${paymentRequirement.description}.`} To access this
          content, please pay ${amount} {chainName} USDC.
        </p>
        {network === "solana-devnet" && (
          <p className="instructions">
            Need Solana Devnet USDC?{" "}
            <a href="https://faucet.circle.com/" target="_blank" rel="noopener noreferrer">
              Request some <u>here</u>.
            </a>
          </p>
        )}
      </div>

      <div className="content w-full">
        <div className="payment-details">
          <div className="payment-row">
            <span className="payment-label">Wallet:</span>
            <span className="payment-value">
              {activeAccount
                ? `${activeAccount.address.slice(0, 6)}...${activeAccount.address.slice(-4)}`
                : "-"}
            </span>
          </div>
          <div className="payment-row">
            <span className="payment-label">Available balance:</span>
            <span className="payment-value">
              <button className="balance-button" onClick={() => setHideBalance(prev => !prev)}>
                {!hideBalance && formattedBalance
                  ? `$${formattedBalance} USDC`
                  : isFetchingBalance
                    ? "Loading..."
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

        <div className="cta-container">
          {activeAccount ? (
            <button className="button button-secondary" onClick={handleDisconnect}>
              Disconnect
            </button>
          ) : (
            <>
              <select
                className="input"
                value={selectedWalletValue}
                onChange={event => setSelectedWalletValue(event.target.value)}
              >
                <option value="" disabled>
                  Select a wallet
                </option>
                {walletOptions.map(option => (
                  <option value={option.value} key={option.value}>
                    {option.wallet.name}
                  </option>
                ))}
              </select>
              <button
                className="button button-primary"
                onClick={handleConnect}
                disabled={!selectedWalletValue}
              >
                Connect wallet
              </button>
            </>
          )}
          {activeAccount && (
            <button className="button button-primary" onClick={handlePayment} disabled={isPaying}>
              {isPaying ? <Spinner /> : "Pay now"}
            </button>
          )}
        </div>

        {!walletOptions.length && (
          <div className="status">
            Install a Solana wallet such as Phantom to continue, then refresh this page.
          </div>
        )}

        {status && <div className="status">{status}</div>}
      </div>
    </div>
  );
}

const hasSolanaSigning = (wallet: Wallet): wallet is WalletWithSolanaFeatures =>
  SolanaSignTransaction in wallet.features;
