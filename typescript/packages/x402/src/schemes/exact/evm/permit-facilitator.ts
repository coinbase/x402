import { Account, Address, Chain, getAddress, Hex, parseErc6492Signature, Transport } from "viem";
import { getNetworkId } from "../../../shared";
import { getERC20Balance } from "../../../shared/evm";
import {
  usdcABI as abi,
  permitTypes,
  ConnectedClient,
  SignerWallet,
} from "../../../types/shared/evm";
import {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
  ExactEvmPermitPayload,
} from "../../../types/verify";
import { SCHEME } from "../../exact";

/**
 * Verifies an ERC-2612 permit payment payload against the required payment details
 *
 * This function performs several verification steps:
 * - Verifies protocol version compatibility
 * - Validates the permit signature
 * - Confirms token contract address is correct for the chain
 * - Checks permit deadline hasn't expired
 * - Verifies owner has sufficient token balance
 * - Ensures permit value meets required minimum
 *
 * @param client - The public client used for blockchain interactions
 * @param payload - The signed permit payment payload containing permit parameters and signature
 * @param paymentRequirements - The payment requirements that the payload must satisfy
 * @returns A VerifyResponse indicating if the permit is valid and any invalidation reason
 */
export async function verifyPermit<
  transport extends Transport,
  chain extends Chain,
  account extends Account | undefined,
>(
  client: ConnectedClient<transport, chain, account>,
  payload: PaymentPayload,
  paymentRequirements: PaymentRequirements,
): Promise<VerifyResponse> {
  const exactEvmPermitPayload = payload.payload as ExactEvmPermitPayload;

  // Verify payload scheme
  if (payload.scheme !== SCHEME || paymentRequirements.scheme !== SCHEME) {
    return {
      isValid: false,
      invalidReason: `unsupported_scheme`,
      payer: exactEvmPermitPayload.permit.owner,
    };
  }

  // Extract domain from the permit payload (cryptographically bound to signature)
  const domain = exactEvmPermitPayload.permit.domain;
  const erc20Address = getAddress(domain.verifyingContract);

  // Verify domain matches payment requirements
  let expectedChainId: number;
  try {
    expectedChainId = getNetworkId(payload.network);
  } catch {
    return {
      isValid: false,
      invalidReason: `invalid_network`,
      payer: exactEvmPermitPayload.permit.owner,
    };
  }

  if (domain.chainId !== expectedChainId) {
    return {
      isValid: false,
      invalidReason: `invalid_exact_evm_permit_payload_domain_chainid_mismatch`,
      payer: exactEvmPermitPayload.permit.owner,
    };
  }

  const expectedAsset = getAddress(paymentRequirements.asset as Address);
  if (getAddress(domain.verifyingContract) !== expectedAsset) {
    return {
      isValid: false,
      invalidReason: `invalid_exact_evm_permit_payload_domain_asset_mismatch`,
      payer: exactEvmPermitPayload.permit.owner,
    };
  }

  // Verify permit signature is recoverable for the owner address
  const permitTypedData = {
    types: permitTypes,
    primaryType: "Permit" as const,
    domain: {
      name: domain.name,
      version: domain.version,
      chainId: domain.chainId,
      verifyingContract: getAddress(domain.verifyingContract),
    },
    message: {
      owner: exactEvmPermitPayload.permit.owner,
      spender: exactEvmPermitPayload.permit.spender,
      value: BigInt(exactEvmPermitPayload.permit.value),
      nonce: BigInt(exactEvmPermitPayload.permit.nonce),
      deadline: BigInt(exactEvmPermitPayload.permit.deadline),
    },
  };

  const recoveredAddress = await client.verifyTypedData({
    address: exactEvmPermitPayload.permit.owner as Address,
    ...permitTypedData,
    signature: exactEvmPermitPayload.signature as Hex,
  });

  if (!recoveredAddress) {
    return {
      isValid: false,
      invalidReason: "invalid_exact_evm_permit_payload_signature",
      payer: exactEvmPermitPayload.permit.owner,
    };
  }

  // Verify that spender is the facilitator or approved address
  const expectedSpender = (paymentRequirements.extra?.facilitatorAddress ||
    paymentRequirements.payTo) as Address;
  if (getAddress(exactEvmPermitPayload.permit.spender) !== getAddress(expectedSpender)) {
    return {
      isValid: false,
      invalidReason: "invalid_exact_evm_permit_payload_spender_mismatch",
      payer: exactEvmPermitPayload.permit.owner,
    };
  }

  // Verify deadline hasn't expired
  // Pad 3 blocks (6 seconds) to account for round tripping
  if (BigInt(exactEvmPermitPayload.permit.deadline) < BigInt(Math.floor(Date.now() / 1000) + 6)) {
    return {
      isValid: false,
      invalidReason: "invalid_exact_evm_permit_payload_deadline",
      payer: exactEvmPermitPayload.permit.owner,
    };
  }

  // Verify owner has enough funds to cover paymentRequirements.maxAmountRequired
  const balance = await getERC20Balance(
    client,
    erc20Address,
    exactEvmPermitPayload.permit.owner as Address,
  );
  if (balance < BigInt(paymentRequirements.maxAmountRequired)) {
    return {
      isValid: false,
      invalidReason: "insufficient_funds",
      payer: exactEvmPermitPayload.permit.owner,
    };
  }

  // Verify value in payload is enough to cover paymentRequirements.maxAmountRequired
  if (BigInt(exactEvmPermitPayload.permit.value) < BigInt(paymentRequirements.maxAmountRequired)) {
    return {
      isValid: false,
      invalidReason: "invalid_exact_evm_permit_payload_value",
      payer: exactEvmPermitPayload.permit.owner,
    };
  }

  return {
    isValid: true,
    invalidReason: undefined,
    payer: exactEvmPermitPayload.permit.owner,
  };
}

/**
 * Settles a permit payment by executing permit + transferFrom transactions
 *
 * This function:
 * 1. Executes the permit to approve the facilitator
 * 2. Executes transferFrom to transfer tokens from owner to recipient
 *
 * @param wallet - The facilitator wallet that will submit the transactions
 * @param paymentPayload - The signed permit payment payload containing the permit parameters and signature
 * @param paymentRequirements - The original payment details that were used to create the payload
 * @returns A SettleResponse containing the transaction status and hash
 */
export async function settlePermit<transport extends Transport, chain extends Chain>(
  wallet: SignerWallet<chain, transport>,
  paymentPayload: PaymentPayload,
  paymentRequirements: PaymentRequirements,
): Promise<SettleResponse> {
  const payload = paymentPayload.payload as ExactEvmPermitPayload;

  // Re-verify to ensure the permit is still valid
  const valid = await verifyPermit(wallet, paymentPayload, paymentRequirements);

  if (!valid.isValid) {
    return {
      success: false,
      network: paymentPayload.network,
      transaction: "",
      errorReason: valid.invalidReason ?? "invalid_scheme",
      payer: payload.permit.owner,
    };
  }

  // Returns the original signature (no-op) if the signature is not a 6492 signature
  const { signature } = parseErc6492Signature(payload.signature as Hex);

  try {
    // Step 1: Execute permit to approve spender
    const permitTx = await wallet.writeContract({
      address: paymentRequirements.asset as Address,
      abi,
      functionName: "permit" as const,
      args: [
        payload.permit.owner as Address,
        payload.permit.spender as Address,
        BigInt(payload.permit.value),
        BigInt(payload.permit.deadline),
        signature,
      ],
      chain: wallet.chain as Chain,
    });

    const permitReceipt = await wallet.waitForTransactionReceipt({ hash: permitTx });

    if (permitReceipt.status !== "success") {
      return {
        success: false,
        errorReason: "invalid_transaction_state",
        transaction: permitTx,
        network: paymentPayload.network,
        payer: payload.permit.owner,
      };
    }

    // Step 2: Execute transferFrom to move tokens
    const transferTx = await wallet.writeContract({
      address: paymentRequirements.asset as Address,
      abi,
      functionName: "transferFrom" as const,
      args: [
        payload.permit.owner as Address,
        paymentRequirements.payTo as Address,
        BigInt(payload.permit.value),
      ],
      chain: wallet.chain as Chain,
    });

    const transferReceipt = await wallet.waitForTransactionReceipt({ hash: transferTx });

    if (transferReceipt.status !== "success") {
      return {
        success: false,
        errorReason: "invalid_transaction_state",
        transaction: transferTx,
        network: paymentPayload.network,
        payer: payload.permit.owner,
      };
    }

    return {
      success: true,
      transaction: transferTx,
      network: paymentPayload.network,
      payer: payload.permit.owner,
    };
  } catch (error) {
    console.error("Error settling permit payment:", error);
    return {
      success: false,
      errorReason: "unexpected_settle_error",
      transaction: "",
      network: paymentPayload.network,
      payer: payload.permit.owner,
    };
  }
}
