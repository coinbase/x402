import { x402Client, wrapFetchWithPayment, x402HTTPClient } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { ExactSvmScheme } from "@x402/svm/exact/client";
import type { ClientEvmSigner } from "@x402/evm/signer";
import {
  getTransactionEncoder,
  getTransactionDecoder,
  address as addressFn,
  type SignatureDictionary,
  type Transaction,
  type TransactionPartialSigner,
  type TransactionWithinSizeLimit,
  type TransactionWithLifetime,
  type BaseTransactionSignerConfig,
} from "@solana/kit";

const proxyUrl = process.env.PROXY_SIGNER_URL || "http://localhost:8080";
const baseURL = process.env.RESOURCE_SERVER_URL || "http://localhost:4021";
const endpointPath = process.env.ENDPOINT_PATH || "/weather";
const url = `${baseURL}${endpointPath}`;

// ---------------------------------------------------------------------------
// ProxyEvmSigner – routes signTypedData to the Java proxy server
// ---------------------------------------------------------------------------

async function createProxyEvmSigner(): Promise<ClientEvmSigner> {
  const res = await fetch(`${proxyUrl}/evm/address`);
  const { address } = (await res.json()) as { address: string };

  return {
    address: address as `0x${string}`,

    async signTypedData(message) {
      const res = await fetch(`${proxyUrl}/evm/sign-typed-data`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message, (_, v) => (typeof v === "bigint" ? v.toString() : v)),
      });
      const data = (await res.json()) as { signature: string };
      return data.signature as `0x${string}`;
    },

    async readContract() {
      throw new Error("readContract not implemented – not needed for basic x402 payments");
    },
  };
}

// ---------------------------------------------------------------------------
// ProxySvmSigner – routes signTransactions to the Java proxy server
// ---------------------------------------------------------------------------

type FullTransaction = Transaction & TransactionWithinSizeLimit & TransactionWithLifetime;

async function createProxySvmSigner(): Promise<TransactionPartialSigner> {
  const res = await fetch(`${proxyUrl}/svm/address`);
  const { address } = (await res.json()) as { address: string };

  const encoder = getTransactionEncoder();
  const decoder = getTransactionDecoder();

  return {
    address: addressFn(address),

    async signTransactions(
      transactions: readonly FullTransaction[],
      _config?: BaseTransactionSignerConfig,
    ): Promise<readonly SignatureDictionary[]> {
      const signatures: SignatureDictionary[] = [];

      for (const transaction of transactions) {
        const serialized = new Uint8Array(encoder.encode(transaction));
        const wireBase64 = btoa(String.fromCharCode(...serialized));

        const res = await fetch(`${proxyUrl}/svm/partial-sign-transaction`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transaction: wireBase64 }),
        });
        const data = (await res.json()) as { signedTransaction: string };

        const signedBytes = Uint8Array.from(atob(data.signedTransaction), c => c.charCodeAt(0));
        const decodedTx = decoder.decode(signedBytes);
        const sig = decodedTx.signatures[address];

        if (!sig) {
          throw new Error("Proxy did not return a signature for our account");
        }

        signatures.push(Object.freeze({ [address]: sig }) as SignatureDictionary);
      }

      return signatures;
    },
  };
}

// ---------------------------------------------------------------------------
// Helper: make a paid request and print results
// ---------------------------------------------------------------------------

async function payForResource(
  label: string,
  fetchWithPayment: typeof fetch,
  httpClient: x402HTTPClient,
): Promise<void> {
  console.log(`--- ${label} ---`);
  const response = await fetchWithPayment(url, { method: "GET" });
  const body = await response.json();
  console.log("Response:", JSON.stringify(body));

  if (response.ok) {
    const settle = httpClient.getPaymentSettleResponse(name => response.headers.get(name));
    console.log(`Settled on ${settle?.network} tx=${settle?.transaction}\n`);
  } else {
    console.log(`Status: ${response.status}\n`);
  }
}

// ---------------------------------------------------------------------------
// Helper: create an x402 client that prefers a given network prefix
// ---------------------------------------------------------------------------

function createClientPreferring(
  networkPrefix: string,
  evmSigner: ClientEvmSigner,
  svmSigner: TransactionPartialSigner,
): x402Client {
  return new x402Client()
    .register("eip155:*", new ExactEvmScheme(evmSigner))
    .register("solana:*", new ExactSvmScheme(svmSigner as any))
    .registerPolicy((_, reqs) => {
      const preferred = reqs.filter(r => r.network.startsWith(networkPrefix));
      const rest = reqs.filter(r => !r.network.startsWith(networkPrefix));
      return [...preferred, ...rest];
    })
    .onBeforePaymentCreation(async ctx => {
      console.log(`[before] Signing payment on ${ctx.selectedRequirements.network} (${ctx.selectedRequirements.scheme})`);
    })
    .onAfterPaymentCreation(async ctx => {
      console.log(`[after]  Payment created (v${ctx.paymentPayload.x402Version})`);
    });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(`Proxy signer URL: ${proxyUrl}`);

  const evmSigner = await createProxyEvmSigner();
  console.log(`EVM address (from proxy): ${evmSigner.address}`);

  const svmSigner = await createProxySvmSigner();
  console.log(`SVM address (from proxy): ${svmSigner.address}\n`);

  // -- Request 1: prefer EVM (Base Sepolia) over Solana --
  const evmClient = createClientPreferring("eip155:", evmSigner, svmSigner);
  const fetchEvm = wrapFetchWithPayment(fetch, evmClient);
  await payForResource("Request 1: prefer EVM", fetchEvm, new x402HTTPClient(evmClient));

  // -- Request 2: prefer Solana over EVM --
  const solClient = createClientPreferring("solana:", evmSigner, svmSigner);
  const fetchSol = wrapFetchWithPayment(fetch, solClient);
  await payForResource("Request 2: prefer Solana", fetchSol, new x402HTTPClient(solClient));
}

main().catch(error => {
  console.error(error?.response?.data?.error ?? error);
  process.exit(1);
});
