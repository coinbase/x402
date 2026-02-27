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
import { findAssociatedTokenPda, TOKEN_2022_PROGRAM_ADDRESS } from "@solana-program/token-2022";
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
  SWIG_PROGRAM_ADDRESS,
  SWIG_SIGN_V1_DISCRIMINATOR,
  SWIG_SIGN_V2_DISCRIMINATOR,
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
 * Returns true when the given program address is the Swig program AND the
 * instruction discriminator is signV1 (4) or signV2 (11).
 *
 * @param programAddress - The instruction's program address string
 * @param data - The raw instruction data bytes
 */
export function isSwigSignInstruction(
  programAddress: string,
  data: Readonly<Uint8Array> | undefined,
): boolean {
  if (programAddress !== SWIG_PROGRAM_ADDRESS) return false;
  if (!data || data.length < 2) return false;
  const discriminator = data[0] | (data[1] << 8); // U16 LE
  return (
    discriminator === SWIG_SIGN_V1_DISCRIMINATOR ||
    discriminator === SWIG_SIGN_V2_DISCRIMINATOR
  );
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

/**
 * Verify that a Swig signV1/signV2 instruction contains a valid SPL TransferChecked
 * compact instruction satisfying the payment requirements.
 *
 * Security invariants checked (mirrors the regular wallet path):
 *   - Swig PDA is not one of the facilitator's signer addresses
 *   - Inner compact instruction uses the correct mint
 *   - Inner destination ATA matches the expected ATA for requirements.payTo
 *   - Inner transfer amount >= requirements.amount
 *
 * @param ix             - Decompiled outer Swig instruction (accounts already resolved)
 * @param staticAccounts - Ordered account list from the compiled transaction message
 * @param requirements   - Payment requirements (asset, payTo, amount)
 * @param signerAddresses - Facilitator signer addresses (must not match Swig PDA)
 * @returns Object with `payer` set to the Swig PDA address
 * @throws A string error reason on any validation failure
 */
export async function verifySwigTransfer(
  ix: { accounts: ReadonlyArray<{ readonly address: Address }>; data?: Readonly<Uint8Array> },
  staticAccounts: ReadonlyArray<Address>,
  requirements: { asset: string; payTo: string; amount: string },
  signerAddresses: string[],
): Promise<{ payer: string }> {
  // Swig PDA is the first account of the outer instruction
  if (!ix.accounts[0]?.address) {
    throw "invalid_exact_svm_payload_no_transfer_instruction";
  }
  const swigPda = ix.accounts[0].address.toString();

  // SECURITY: Swig PDA must not be a facilitator signer address
  if (signerAddresses.includes(swigPda)) {
    throw "invalid_exact_svm_payload_transaction_fee_payer_transferring_funds";
  }

  // Decode compact instructions from the signV1/signV2 data
  const rawData = ix.data ? new Uint8Array(ix.data) : new Uint8Array(0);
  const compactInstructions = decodeSwigCompactInstructions(rawData);

  // Find the SPL TransferChecked compact instruction
  // transferChecked discriminator = 12
  const SPL_TRANSFER_CHECKED_DISCRIMINATOR = 12;
  let transferIx: SwigCompactInstruction | undefined;

  for (const compactIx of compactInstructions) {
    const programAddress = staticAccounts[compactIx.programIdIndex]?.toString();
    if (
      (programAddress === TOKEN_PROGRAM_ADDRESS.toString() ||
        programAddress === TOKEN_2022_PROGRAM_ADDRESS.toString()) &&
      compactIx.data.length >= 1 &&
      compactIx.data[0] === SPL_TRANSFER_CHECKED_DISCRIMINATOR
    ) {
      transferIx = compactIx;
      break;
    }
  }

  if (!transferIx) {
    throw "invalid_exact_svm_payload_no_transfer_instruction";
  }

  const tokenProgramAddress = staticAccounts[transferIx.programIdIndex]?.toString();

  // Verify mint address — accounts[1] for TransferChecked
  const mintAddress = staticAccounts[transferIx.accounts[1]]?.toString();
  if (mintAddress !== requirements.asset) {
    throw "invalid_exact_svm_payload_mint_mismatch";
  }

  // Verify destination ATA — accounts[2] for TransferChecked
  const destATA = staticAccounts[transferIx.accounts[2]]?.toString();
  try {
    const [expectedDestATA] = await findAssociatedTokenPda({
      mint: requirements.asset as Address,
      owner: requirements.payTo as Address,
      tokenProgram:
        tokenProgramAddress === TOKEN_PROGRAM_ADDRESS.toString()
          ? (TOKEN_PROGRAM_ADDRESS as Address)
          : (TOKEN_2022_PROGRAM_ADDRESS as Address),
    });

    if (destATA !== expectedDestATA.toString()) {
      throw "invalid_exact_svm_payload_recipient_mismatch";
    }
  } catch (e) {
    if (typeof e === "string") throw e;
    throw "invalid_exact_svm_payload_recipient_mismatch";
  }

  // Verify amount — bytes 1-8 of compact instruction data (U64 LE)
  // transferChecked data layout: [0]=discriminator, [1..8]=amount, [9]=decimals
  if (transferIx.data.length < 9) {
    throw "invalid_exact_svm_payload_no_transfer_instruction";
  }
  const amountBuf = new Uint8Array(8);
  amountBuf.set(transferIx.data.slice(1, 9));
  const amount = new DataView(amountBuf.buffer).getBigUint64(0, true); // LE

  if (amount < BigInt(requirements.amount)) {
    throw "invalid_exact_svm_payload_amount_insufficient";
  }

  return { payer: swigPda };
}
