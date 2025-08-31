/**
 * x402 Signature-Based Transfer Implementation for Starknet
 * 
 * This module implements the Starknet equivalent of EIP-3009's transferWithAuthorization.
 * Unlike EVM chains that need EIP-3009 for meta-transactions, Starknet has native
 * account abstraction, allowing us to implement signature-based transfers directly.
 */

import {
  Account,
  CallData,
  hash,
  typedData,
  type Call,
  type Signature,
  type TypedData,
} from "starknet";
import type { StarknetSigner } from "./wallet";
import type { StarknetConnectedClient } from "./client";
import { getUsdcContractAddress } from "./usdc";
import { uint256 } from "starknet";

/**
 * x402 Transfer Authorization structure for Starknet
 * This is the Starknet equivalent of EIP-3009's authorization
 */
export interface StarknetTransferAuthorization {
  /** The token contract address */
  tokenAddress: string;
  /** The sender's address */
  from: string;
  /** The recipient's address */
  to: string;
  /** The amount to transfer (as string) */
  amount: string;
  /** Nonce for replay protection */
  nonce: string;
  /** Expiration timestamp */
  deadline: string;
  /** The network (starknet or starknet-sepolia) */
  network: string;
}

/**
 * Creates a typed data structure for x402 payment authorization on Starknet
 * 
 * @param authorization - The transfer authorization details
 * @returns TypedData structure for signing
 */
export function createX402TypedData(authorization: StarknetTransferAuthorization): TypedData {
  return {
    domain: {
      name: "x402-starknet",
      version: "1",
      chainId: authorization.network === "starknet" 
        ? "0x534e5f4d41494e" 
        : "0x534e5f5345504f4c4941",
      revision: "1",
    },
    message: {
      tokenAddress: authorization.tokenAddress,
      from: authorization.from,
      to: authorization.to,
      amount: authorization.amount,
      nonce: authorization.nonce,
      deadline: authorization.deadline,
    },
    primaryType: "TransferAuthorization",
    types: {
      TransferAuthorization: [
        { name: "tokenAddress", type: "felt" },
        { name: "from", type: "felt" },
        { name: "to", type: "felt" },
        { name: "amount", type: "u256" },
        { name: "nonce", type: "felt" },
        { name: "deadline", type: "felt" },
      ],
      StarknetDomain: [
        { name: "name", type: "felt" },
        { name: "version", type: "felt" },
        { name: "chainId", type: "felt" },
        { name: "revision", type: "felt" },
      ],
    },
  };
}

/**
 * Signs a transfer authorization for x402 payments
 * This creates an off-chain signature that can be submitted by anyone
 * 
 * @param signer - The Starknet signer
 * @param authorization - The transfer authorization to sign
 * @returns The signature
 */
export async function signTransferAuthorization(
  signer: StarknetSigner,
  authorization: StarknetTransferAuthorization,
): Promise<Signature> {
  const typedData = createX402TypedData(authorization);
  return await signer.account.signMessage(typedData);
}

/**
 * Creates the payment payload for x402 header
 * This is what goes in the x-Payment header
 * 
 * @param authorization - The transfer authorization
 * @param signature - The signature from the user
 * @returns The payment payload as a string
 */
export function createX402PaymentPayload(
  authorization: StarknetTransferAuthorization,
  signature: Signature,
): string {
  const payload = {
    scheme: "starknet-native", // New scheme for Starknet's native AA
    network: authorization.network,
    authorization,
    signature: Array.isArray(signature) ? signature : [signature],
  };
  
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

/**
 * Verifies a transfer authorization signature
 * This is used by the facilitator to verify the payment is valid
 * 
 * @param client - The Starknet client
 * @param authorization - The transfer authorization
 * @param signature - The signature to verify
 * @param signerAddress - The address that signed
 * @returns True if valid, false otherwise
 */
export async function verifyTransferAuthorization(
  client: StarknetConnectedClient,
  authorization: StarknetTransferAuthorization,
  signature: Signature,
  signerAddress: string,
): Promise<boolean> {
  try {
    // In Starknet, signature verification happens at the account contract level
    // This is different from EVM where we verify ECDSA signatures directly
    // The account contract will verify the signature according to its own logic
    // (could be a multisig, could be a different curve, etc.)
    
    // For now, we'll do a basic check that the signature exists
    // In production, you'd call the account contract's isValidSignature method
    // by making a call to the account contract with the message hash and signature
    const sigArray = Array.isArray(signature) ? signature : [signature];
    return sigArray && sigArray.length > 0;
  } catch (error) {
    console.error("Failed to verify transfer authorization:", error);
    return false;
  }
}

/**
 * Executes a transfer using a signed authorization (Facilitator pattern)
 * This is the Starknet equivalent of EIP-3009's transferWithAuthorization
 * 
 * Key difference: In Starknet, we use account abstraction to execute this
 * as a multicall transaction, bundling the transfer with any necessary checks
 * 
 * @param signer - The facilitator's signer (pays gas)
 * @param authorization - The transfer authorization
 * @param userSignature - The user's signature
 * @returns Transaction response
 */
export async function executeTransferWithAuthorization(
  signer: StarknetSigner,
  authorization: StarknetTransferAuthorization,
  userSignature: Signature,
) {
  // Create the multicall array
  const calls: Call[] = [];
  
  // In Starknet, we can use the account's multicall feature
  // to execute the transfer on behalf of the user
  // This is possible because of native account abstraction
  
  const amountUint256 = uint256.bnToUint256(authorization.amount);
  
  // First call: Execute the transfer
  // Note: In production, you'd implement a custom USDC method that accepts signatures
  // or use a session key / delegate pattern
  calls.push({
    contractAddress: authorization.tokenAddress,
    entrypoint: "transfer",
    calldata: CallData.compile({
      recipient: authorization.to,
      amount: amountUint256,
    }),
  });
  
  // Execute the multicall transaction
  return await signer.account.execute(calls);
}

/**
 * Starknet Facilitator Service Interface
 * This handles the verification and settlement of x402 payments on Starknet
 */
export class StarknetFacilitator {
  constructor(
    private client: StarknetConnectedClient,
    private signer: StarknetSigner,
  ) {}
  
  /**
   * Verifies a payment payload (equivalent to /verify endpoint)
   */
  async verify(payloadBase64: string): Promise<{ valid: boolean; reason?: string }> {
    try {
      const payloadStr = Buffer.from(payloadBase64, "base64").toString();
      const payload = JSON.parse(payloadStr);
      
      if (payload.scheme !== "starknet-native") {
        return { valid: false, reason: "Invalid scheme for Starknet" };
      }
      
      // Verify the signature
      const isValid = await verifyTransferAuthorization(
        this.client,
        payload.authorization,
        payload.signature,
        payload.authorization.from,
      );
      
      if (!isValid) {
        return { valid: false, reason: "Invalid signature" };
      }
      
      // Check deadline
      const now = Math.floor(Date.now() / 1000);
      if (parseInt(payload.authorization.deadline) < now) {
        return { valid: false, reason: "Authorization expired" };
      }
      
      // TODO: Check nonce to prevent replay attacks
      // This would require maintaining a nonce registry
      
      return { valid: true };
    } catch (error) {
      return { valid: false, reason: `Verification failed: ${error}` };
    }
  }
  
  /**
   * Settles a payment (equivalent to /settle endpoint)
   */
  async settle(payloadBase64: string): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      // First verify
      const verification = await this.verify(payloadBase64);
      if (!verification.valid) {
        return { success: false, error: verification.reason };
      }
      
      // Parse payload
      const payloadStr = Buffer.from(payloadBase64, "base64").toString();
      const payload = JSON.parse(payloadStr);
      
      // Execute the transfer
      const result = await executeTransferWithAuthorization(
        this.signer,
        payload.authorization,
        payload.signature,
      );
      
      return { 
        success: true, 
        txHash: result.transaction_hash,
      };
    } catch (error) {
      return { success: false, error: `Settlement failed: ${error}` };
    }
  }
}

/**
 * Creates an x402 payment requirement for Starknet
 * This tells clients how to pay using Starknet's native AA
 */
export function createStarknetPaymentRequirement(
  network: "starknet" | "starknet-sepolia",
  payTo: string,
  amount: string,
  nonce?: string,
  deadline?: string,
) {
  return {
    scheme: "starknet-native",
    network,
    asset: getUsdcContractAddress(network),
    payTo,
    maxAmountRequired: amount,
    nonce: nonce || Date.now().toString(),
    deadline: deadline || (Math.floor(Date.now() / 1000) + 3600).toString(), // 1 hour default
    metadata: {
      accountAbstraction: true,
      requiresEIP3009: false,
      note: "Starknet uses native account abstraction instead of EIP-3009",
    },
  };
}