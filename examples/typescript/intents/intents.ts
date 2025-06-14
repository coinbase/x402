import { AxiosInstance } from "axios";
import {
  BASE_USDC_ASSET_ID,
  NEAR_USDC_ASSET_ID,
  NEAR_INTENTS_REFERRAL,
  NEAR_INTENTS_CONTRACT,
  POA_BRIDGE_BASE_URL,
  NEAR_RPC_URL,
  NEP141_STORAGE_TOKEN_ID,
} from "./constants";
import { randomNonce, transformERC191Signature, wait } from "./utils";
import { Account, WalletClient } from "viem";

// The swap function now supports swap Base USDC to NEAR USDC.
export async function publishSwapIntent({
  axiosInstance,
  url,
  signer,
  amountIn,
  receiverId,
  tokenIn = BASE_USDC_ASSET_ID,
  tokenOut = NEAR_USDC_ASSET_ID,
}: {
  axiosInstance: AxiosInstance;
  url: string;
  signer: WalletClient;
  amountIn: bigint;
  receiverId: string;
  tokenIn?: string;
  tokenOut?: string;
}) {
  const tokenOutId = tokenOut.split(":")[1];

  let quoteStorage: any = null;
  let storageCost = 0n;

  const storageRequired = await getNearNep141StorageRequired(tokenOutId, receiverId);

  if (storageRequired > 0n) {
    const res = await axiosInstance.post(url, {
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "quote",
      params: [
        {
          defuse_asset_identifier_in: tokenOut,
          defuse_asset_identifier_out: NEP141_STORAGE_TOKEN_ID,
          exact_amount_out: storageRequired.toString(),
          min_deadline_ms: 10 * 60 * 1000, // 10 minutes
          wait_ms: 2000, // 2 seconds
        },
      ],
    });
    quoteStorage = res.data.result[0] as any;
    storageCost = BigInt(quoteStorage?.amount_in ?? 0);
  }

  const quoteRes = await axiosInstance.post(url, {
    jsonrpc: "2.0",
    id: crypto.randomUUID(),
    method: "quote",
    params: [
      {
        defuse_asset_identifier_in: tokenIn,
        defuse_asset_identifier_out: tokenOut,
        exact_amount_in: amountIn.toString(),
        min_deadline_ms: 10 * 60 * 1000, // 10 minutes
        wait_ms: 2000, // 2 seconds
      },
    ],
  });

  const quote = quoteRes.data.result[0];
  if (!quote) {
    throw new Error("No quote found");
  }

  const amountOut = BigInt(quote.amount_out);
  const quoteHashes = quoteStorage
    ? [quote.quote_hash, quoteStorage.quote_hash]
    : [quote.quote_hash];

  const intents: any[] = [
    {
      intent: "token_diff",
      diff: {
        [tokenIn]: "-" + amountIn, // Base USDC for example
        [tokenOut]: amountOut.toString(), // NEAR USDC for example
      },
      referral: NEAR_INTENTS_REFERRAL,
    },
  ];

  if (quoteStorage) {
    intents.push(
      {
        intent: "token_diff",
        diff: {
          [tokenOut]: "-" + storageCost.toString(),
          [NEP141_STORAGE_TOKEN_ID]: storageRequired.toString(),
        },
        referral: NEAR_INTENTS_REFERRAL,
      },
      {
        intent: "ft_withdraw",
        token: tokenOutId, // NEAR USDC for example
        receiver_id: receiverId,
        amount: (amountOut - storageCost).toString(),
        storage_deposit: storageRequired.toString(),
      },
    );
  } else {
    intents.push({
      intent: "ft_withdraw",
      token: tokenOutId, // NEAR USDC for example
      receiver_id: receiverId,
      amount: amountOut.toString(),
    });
  }

  const payload = {
    signer_id: signer.account?.address.toLowerCase(),
    verifying_contract: NEAR_INTENTS_CONTRACT,
    deadline: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 1 minute from now
    nonce: randomNonce(),
    intents,
  };

  const signature = await signer.signMessage({
    message: JSON.stringify(payload),
    account: signer.account as Account,
  });

  console.log("Publishing intents...\n", intents);

  const res = await axiosInstance.post(url, {
    jsonrpc: "2.0",
    id: "dontcare",
    method: "publish_intent",
    params: [
      {
        signed_data: {
          standard: "erc191",
          payload: JSON.stringify(payload),
          signature: transformERC191Signature(signature),
        },
        quote_hashes: quoteHashes,
      },
    ],
  });

  if (res.data.result.status === "OK") {
    console.log("The intent has been published");
  } else {
    console.error("The intent failed to publish");
  }
  console.log(res.data.result);

  const intentHash = res.data.result.intent_hash;
  let status = "PENDING";
  while (status !== "SETTLED") {
    await wait(1000);
    const res = await axiosInstance.post(url, {
      jsonrpc: "2.0",
      id: "dontcare",
      method: "get_status",
      params: [
        {
          intent_hash: intentHash,
        },
      ],
    });
    status = res.data.result.status;
  }

  console.log(`Intent ${intentHash} has been settled`);
}

/**
 * Get the deposit address for the account
 * @param accountId - The account ID
 * @returns The deposit address
 */
export async function getDepositAddress(accountId: string) {
  const res = await fetch(`${POA_BRIDGE_BASE_URL}/rpc`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: "dontcare",
      jsonrpc: "2.0",
      method: "deposit_address",
      params: [
        {
          account_id: accountId,
          chain: "eth:8453", // Base
        },
      ],
    }),
  });

  const data = await res.json();
  return data.result;
}

export async function getPendingDeposits(accountId: string) {
  const res = await fetch(`${POA_BRIDGE_BASE_URL}/rpc`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: "dontcare",
      jsonrpc: "2.0",
      method: "recent_deposits",
      params: [
        {
          account_id: accountId,
        },
      ],
    }),
  });

  const data = await res.json();
  return data.result?.deposits?.filter(d => d.status === "PENDING");
}

export async function nearViewFunction({
  contractId,
  method,
  args = {},
}: {
  contractId: string;
  method: string;
  args: object;
}) {
  const res = await fetch(NEAR_RPC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: "dontcare",
      jsonrpc: "2.0",
      method: "query",
      params: {
        account_id: contractId,
        request_type: "call_function",
        method_name: method,
        args_base64: btoa(JSON.stringify(args)),
        finality: "optimistic",
      },
    }),
  });

  const data = await res.json();
  const result = data.result?.result;
  const parsed = JSON.parse(Buffer.from(result).toString("utf8"));
  return parsed;
}

export async function getDepositedBalance(accountId: string) {
  const balances = await nearViewFunction({
    contractId: NEAR_INTENTS_CONTRACT,
    method: "mt_batch_balance_of",
    args: {
      account_id: accountId,
      token_ids: [BASE_USDC_ASSET_ID],
    },
  });
  return BigInt(balances[0]);
}

export async function getNearNep141Balance(contractId: string, accountId: string): Promise<bigint> {
  try {
    const result = await nearViewFunction({
      contractId,
      method: "ft_balance_of",
      args: { account_id: accountId },
    });

    return BigInt(result ?? 0);
  } catch (error) {
    console.error("Error fetching NEP-141 fungible token balance", error);
    return 0n;
  }
}

export async function getNearNep141StorageBalance(
  contractId: string,
  accountId: string,
): Promise<bigint> {
  try {
    const result = await nearViewFunction({
      contractId,
      method: "storage_balance_of",
      args: { account_id: accountId },
    });

    return BigInt(result?.total ?? 0);
  } catch (error) {
    console.error("Error fetching storage balance", error);
    return 0n;
  }
}

export async function getNearNep141MinStorageBalance(contractId: string): Promise<bigint> {
  try {
    const result = await nearViewFunction({
      contractId,
      method: "storage_balance_bounds",
      args: {},
    });
    return BigInt(result.min) ?? 0n;
  } catch (error) {
    console.error("Error fetching storage balance bounds", error);
    return 0n;
  }
}

export async function getNearNep141StorageRequired(
  contractId: string,
  accountId: string,
): Promise<bigint> {
  const [min, balance] = await Promise.all([
    getNearNep141MinStorageBalance(contractId),
    getNearNep141StorageBalance(contractId, accountId),
  ]);
  return min - balance;
}

export async function waitForDepositsConfirmation(accountId: string) {
  await wait(2000);
  let deposits = await getPendingDeposits(accountId);
  while (deposits && deposits.length > 0) {
    console.log("wait 1s for pending deposit in NEAR Intents ...");
    await wait(1000);
    deposits = await getPendingDeposits(accountId);
  }
}

export async function waitForDepositedBalance(accountId: string, minimumBalance: bigint) {
  let balance = await getDepositedBalance(accountId);
  while (balance < minimumBalance) {
    console.log("wait 1s for deposited balance ...");
    await wait(1000);
    balance = await getDepositedBalance(accountId);
  }
}
