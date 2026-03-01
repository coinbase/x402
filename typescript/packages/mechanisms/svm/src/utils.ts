import {
  getBase64Encoder,
  getTransactionDecoder,
  getCompiledTransactionMessageDecoder,
  type Transaction,
  type Address,
  createSolanaRpc,
  devnet,
  testnet,
  mainnet,
  type RpcDevnet,
  type SolanaRpcApiDevnet,
  type RpcTestnet,
  type SolanaRpcApiTestnet,
  type RpcMainnet,
  type SolanaRpcApiMainnet,
} from "@solana/kit";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { TOKEN_2022_PROGRAM_ADDRESS } from "@solana-program/token-2022";
import type { Network } from "@x402/core/types";
import {
  SVM_ADDRESS_REGEX,
  DEVNET_RPC_URL,
  TESTNET_RPC_URL,
  MAINNET_RPC_URL,
  USDC_MAINNET_ADDRESS,
  USDC_DEVNET_ADDRESS,
  USDC_TESTNET_ADDRESS,
  SOLANA_MAINNET_CAIP2,
  SOLANA_DEVNET_CAIP2,
  SOLANA_TESTNET_CAIP2,
  V1_TO_V2_NETWORK_MAP,
  COMPUTE_BUDGET_PROGRAM_ADDRESS,
  SWIG_PROGRAM_ADDRESS,
  SWIG_SIGN_V2_DISCRIMINATOR,
  SECP256R1_PRECOMPILE_ADDRESS,
} from "./constants";
import type { ExactSvmPayloadV1 } from "./types";

/**
 * Normalize network identifier to CAIP-2 format
 * Handles both V1 names (solana, solana-devnet) and V2 CAIP-2 format
 *
 * @param network - Network identifier (V1 or V2 format)
 * @returns CAIP-2 network identifier
 */
export function normalizeNetwork(network: Network): string {
  // If it's already CAIP-2 format (contains ":"), validate it's supported
  if (network.includes(":")) {
    const supported = [SOLANA_MAINNET_CAIP2, SOLANA_DEVNET_CAIP2, SOLANA_TESTNET_CAIP2];
    if (!supported.includes(network)) {
      throw new Error(`Unsupported SVM network: ${network}`);
    }
    return network;
  }

  // Otherwise, it's a V1 network name, convert to CAIP-2
  const caip2Network = V1_TO_V2_NETWORK_MAP[network];
  if (!caip2Network) {
    throw new Error(`Unsupported SVM network: ${network}`);
  }
  return caip2Network;
}

/**
 * Validate Solana address format
 *
 * @param address - Base58 encoded address string
 * @returns true if address is valid, false otherwise
 */
export function validateSvmAddress(address: string): boolean {
  return SVM_ADDRESS_REGEX.test(address);
}

/**
 * Decode a base64 encoded transaction from an SVM payload
 *
 * @param svmPayload - The SVM payload containing a base64 encoded transaction
 * @returns Decoded Transaction object
 */
export function decodeTransactionFromPayload(svmPayload: ExactSvmPayloadV1): Transaction {
  try {
    const base64Encoder = getBase64Encoder();
    const transactionBytes = base64Encoder.encode(svmPayload.transaction);
    const transactionDecoder = getTransactionDecoder();
    return transactionDecoder.decode(transactionBytes);
  } catch (error) {
    console.error("Error decoding transaction:", error);
    throw new Error("invalid_exact_svm_payload_transaction");
  }
}

/**
 * Extract the token sender (owner of the source token account) from a TransferChecked instruction
 *
 * @param transaction - The decoded transaction
 * @returns The token payer address as a base58 string
 */
export function getTokenPayerFromTransaction(transaction: Transaction): string {
  const compiled = getCompiledTransactionMessageDecoder().decode(transaction.messageBytes);
  const staticAccounts = compiled.staticAccounts ?? [];
  const instructions = compiled.instructions ?? [];

  for (const ix of instructions) {
    const programIndex = ix.programAddressIndex;
    const programAddress = staticAccounts[programIndex].toString();

    // Check if this is a token program instruction
    if (
      programAddress === TOKEN_PROGRAM_ADDRESS.toString() ||
      programAddress === TOKEN_2022_PROGRAM_ADDRESS.toString()
    ) {
      const accountIndices: number[] = ix.accountIndices ?? [];
      // TransferChecked account order: [source, mint, destination, owner, ...]
      if (accountIndices.length >= 4) {
        const ownerIndex = accountIndices[3];
        const ownerAddress = staticAccounts[ownerIndex].toString();
        if (ownerAddress) return ownerAddress;
      }
    }
  }

  return "";
}

/**
 * Create an RPC client for the specified network
 *
 * @param network - Network identifier (CAIP-2 or V1 format)
 * @param customRpcUrl - Optional custom RPC URL
 * @returns RPC client for the specified network
 */
export function createRpcClient(
  network: Network,
  customRpcUrl?: string,
):
  | RpcDevnet<SolanaRpcApiDevnet>
  | RpcTestnet<SolanaRpcApiTestnet>
  | RpcMainnet<SolanaRpcApiMainnet> {
  const caip2Network = normalizeNetwork(network);

  switch (caip2Network) {
    case SOLANA_DEVNET_CAIP2: {
      const url = customRpcUrl || DEVNET_RPC_URL;
      return createSolanaRpc(devnet(url)) as RpcDevnet<SolanaRpcApiDevnet>;
    }
    case SOLANA_TESTNET_CAIP2: {
      const url = customRpcUrl || TESTNET_RPC_URL;
      return createSolanaRpc(testnet(url)) as RpcTestnet<SolanaRpcApiTestnet>;
    }
    case SOLANA_MAINNET_CAIP2: {
      const url = customRpcUrl || MAINNET_RPC_URL;
      return createSolanaRpc(mainnet(url)) as RpcMainnet<SolanaRpcApiMainnet>;
    }
    default:
      throw new Error(`Unsupported network: ${network}`);
  }
}

/**
 * Get the default USDC mint address for a network
 *
 * @param network - Network identifier (CAIP-2 or V1 format)
 * @returns USDC mint address for the network
 */
export function getUsdcAddress(network: Network): string {
  const caip2Network = normalizeNetwork(network);

  switch (caip2Network) {
    case SOLANA_MAINNET_CAIP2:
      return USDC_MAINNET_ADDRESS;
    case SOLANA_DEVNET_CAIP2:
      return USDC_DEVNET_ADDRESS;
    case SOLANA_TESTNET_CAIP2:
      return USDC_TESTNET_ADDRESS;
    default:
      throw new Error(`No USDC address configured for network: ${network}`);
  }
}

/**
 * Convert a decimal amount to token smallest units
 *
 * @param decimalAmount - The decimal amount (e.g., "0.10")
 * @param decimals - The number of decimals for the token (e.g., 6 for USDC)
 * @returns The amount in smallest units as a string
 */
export function convertToTokenAmount(decimalAmount: string, decimals: number): string {
  const amount = parseFloat(decimalAmount);
  if (isNaN(amount)) {
    throw new Error(`Invalid amount: ${decimalAmount}`);
  }
  // Convert to smallest unit (e.g., for USDC with 6 decimals: 0.10 * 10^6 = 100000)
  const [intPart, decPart = ""] = String(amount).split(".");
  const paddedDec = decPart.padEnd(decimals, "0").slice(0, decimals);
  const tokenAmount = (intPart + paddedDec).replace(/^0+/, "") || "0";
  return tokenAmount;
}

// ─── Swig wallet support ──────────────────────────────────────────────────────

/**
 * A decoded compact instruction extracted from a Swig signV1/signV2 payload.
 * Indices reference the outer transaction's static account list.
 */
export interface SwigCompactInstruction {
  programIdIndex: number;
  accounts: number[];
  data: Uint8Array;
}

/**
 * Returns true when the transaction has a Swig layout:
 *   - All instructions except the last are compute budget or secp256r1 precompile
 *   - The last instruction is Swig program with SignV2 discriminator
 *
 * @param instructions - Decompiled instruction array
 */
export function isSwigTransaction(
  instructions: ReadonlyArray<{ programAddress: { toString(): string }; data?: Readonly<Uint8Array> }>,
): boolean {
  if (instructions.length === 0) return false;

  // All instructions except the last must be compute budget or secp256r1 precompile
  for (let i = 0; i < instructions.length - 1; i++) {
    const addr = instructions[i].programAddress.toString();
    if (addr !== COMPUTE_BUDGET_PROGRAM_ADDRESS && addr !== SECP256R1_PRECOMPILE_ADDRESS) {
      return false;
    }
  }

  // Last instruction must be Swig program with SignV2 discriminator
  const lastIx = instructions[instructions.length - 1];
  if (lastIx.programAddress.toString() !== SWIG_PROGRAM_ADDRESS) return false;

  const data = lastIx.data;
  if (!data || data.length < 2) return false;

  const discriminator = data[0] | (data[1] << 8); // U16 LE
  return discriminator === SWIG_SIGN_V2_DISCRIMINATOR;
}

/**
 * Flatten a Swig transaction into the same instruction layout as a regular one.
 * Collects non-precompile outer instructions (compute budgets) and resolves
 * the compact instructions embedded in the SignV2 instruction.
 *
 * @param instructions  - Decompiled instruction array (from a Swig transaction)
 * @param staticAccounts - Ordered account list from the compiled transaction message
 * @returns Object with flattened `instructions` array and `swigPda` address
 */
export function parseSwigTransaction(
  instructions: ReadonlyArray<{
    programAddress: { toString(): string };
    accounts?: ReadonlyArray<{ address: { toString(): string } }>;
    data?: Readonly<Uint8Array>;
  }>,
  staticAccounts: ReadonlyArray<Address>,
): { instructions: Array<{ programAddress: Address; accounts: Array<{ address: Address; role: number }>; data: Uint8Array }>; swigPda: string } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any[] = [];

  // 1. Collect non-precompile outer instructions (compute budgets)
  for (let i = 0; i < instructions.length - 1; i++) {
    if (instructions[i].programAddress.toString() !== SECP256R1_PRECOMPILE_ADDRESS) {
      result.push(instructions[i]);
    }
  }

  // 2. Extract Swig PDA from SignV2's first account
  const signV2Ix = instructions[instructions.length - 1];
  const swigPda = signV2Ix.accounts?.[0]?.address?.toString() ?? "";
  if (!swigPda) throw "invalid_exact_svm_payload_no_transfer_instruction";

  // 3. Decode compact instructions from SignV2 data
  const rawData = signV2Ix.data ? new Uint8Array(signV2Ix.data) : new Uint8Array(0);
  const compactInstructions = decodeSwigCompactInstructions(rawData);

  // 4. Resolve compact instruction indices to addresses using staticAccounts
  for (const ci of compactInstructions) {
    result.push({
      programAddress: staticAccounts[ci.programIdIndex],
      accounts: ci.accounts.map(idx => ({
        address: staticAccounts[idx],
        role: 1, // AccountRole.WRITABLE — exact role doesn't matter for parsing
      })),
      data: ci.data,
    });
  }

  return { instructions: result, swigPda };
}

/**
 * Decode the compact instructions embedded inside a Swig signV1/signV2 instruction.
 *
 * Layout of the outer instruction data:
 *   [0..1]  discriminator         U16 LE
 *   [2..3]  instructionPayloadLen U16 LE (byte count of compact instructions)
 *   [4..7]  roleId                U32 LE
 *   [8..]   compact instructions  (instructionPayloadLen bytes)
 *
 * Each CompactInstruction:
 *   [0]       programIdIndex U8
 *   [1]       numAccounts    U8
 *   [2..N+1]  accounts       U8[numAccounts]
 *   [N+2..N+3] dataLen       U16 LE
 *   [N+4..]   data           raw bytes
 *
 * @param data - The full instruction data bytes of the outer Swig instruction
 * @returns Array of decoded compact instructions (may be empty if data is malformed)
 */
export function decodeSwigCompactInstructions(data: Uint8Array): SwigCompactInstruction[] {
  if (data.length < 4) return [];

  // instructionPayloadLen at bytes 2-3 (U16 LE)
  const instructionPayloadLen = data[2] | (data[3] << 8);

  // Compact instructions start at byte 8 (after discriminator + payloadLen + roleId)
  const startOffset = 8;
  if (data.length < startOffset + instructionPayloadLen) return [];

  const results: SwigCompactInstruction[] = [];
  let offset = startOffset;
  const endOffset = startOffset + instructionPayloadLen;

  while (offset < endOffset) {
    if (offset >= data.length) break;

    // programIdIndex: U8
    const programIdIndex = data[offset];
    offset += 1;

    // numAccounts: U8
    if (offset >= endOffset) break;
    const numAccounts = data[offset];
    offset += 1;

    // accounts: U8[numAccounts]
    if (offset + numAccounts > endOffset) break;
    const accounts = Array.from(data.slice(offset, offset + numAccounts));
    offset += numAccounts;

    // dataLen: U16 LE
    if (offset + 2 > endOffset) break;
    const dataLen = data[offset] | (data[offset + 1] << 8);
    offset += 2;

    // instruction data
    if (offset + dataLen > endOffset) break;
    const instrData = new Uint8Array(data.slice(offset, offset + dataLen));
    offset += dataLen;

    results.push({ programIdIndex, accounts, data: instrData });
  }

  return results;
}

