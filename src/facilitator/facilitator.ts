import { PublicClient } from "viem";
import {
  PaymentExecutionResponse,
  PaymentNeededDetails,
  PaymentPayloadV1,
  ValidPaymentResponse,
} from "../shared/types";

import { getUsdcAddressForChain, getUSDCBalance } from "../shared/usdc";
import { abi } from "../shared/erc20PermitABI";
import { SignerWallet } from "../shared/wallet";
import { authorizationTypes, authorizationPrimaryType } from "../shared/sign";
import { config } from "../shared/config";

const PROTOCOL_VERSION = 1;

/**
 * Verifies a payment payload against the required payment details
 * @param client - The public client used for blockchain interactions
 * @param payload - The signed payment payload containing transfer parameters and signature
 * @param paymentDetails - The payment requirements that the payload must satisfy
 * @returns A ValidPaymentRequest indicating if the payment is valid and any invalidation reason
 * @remarks This function performs several verification steps:
 * - Verifies protocol version compatibility
 * - Validates the permit signature
 * - Confirms USDC contract address is correct for the chain
 * - Checks permit deadline is sufficiently in the future
 * - Verifies client has sufficient USDC balance
 * - Ensures payment amount meets required minimum
 */
export async function verify(
  client: PublicClient,
  payload: PaymentPayloadV1,
  paymentDetails: PaymentNeededDetails
): Promise<ValidPaymentResponse> {
  /* TODO: work with security team on brainstorming more verification steps
  verification steps:
    - ✅ verify payload version
    - ✅ verify usdc address is correct for the chain
    - ✅ verify permit signature
    - ✅ verify deadline
    - verify nonce is current
    - ✅ verify client has enough funds to cover paymentDetails.maxAmountRequired
    - ✅ verify value in payload is enough to cover paymentDetails.maxAmountRequired
    - check min amount is above some threshold we think is reasonable for covering gas
    - verify resource is not already paid for (next version)
    */

  // Verify payload version
  if (
    payload.version !== PROTOCOL_VERSION ||
    paymentDetails.version !== PROTOCOL_VERSION
  ) {
    return {
      isValid: false,
      invalidReason: `Incompatible payload version. payload: ${payload.version}, paymentDetails: ${paymentDetails.version}, supported: ${PROTOCOL_VERSION}`,
    };
  }

  const usdcName = config[payload.payload.params.chainId].usdcName;

  // Verify permit signature is recoverable for the owner address
  const permitTypedData = {
    types: authorizationTypes,
    primaryType: authorizationPrimaryType,
    domain: {
      name: usdcName,
      version: payload.payload.params.version,
      chainId: payload.payload.params.chainId,
      // This implicitly verifies the usdc address is correct in the signature
      verifyingContract: paymentDetails.usdcAddress,
    },
    message: {
      from: payload.payload.params.from,
      to: payload.payload.params.to,
      value: payload.payload.params.value,
      validAfter: payload.payload.params.validAfter,
      validBefore: payload.payload.params.validBefore,
      nonce: payload.payload.params.nonce,
    },
  };

  const recoveredAddress = await client.verifyTypedData({
    address: payload.payload.params.from,
    ...permitTypedData,
    signature: payload.payload.signature,
  });

  if (!recoveredAddress) {
    return {
      isValid: false,
      invalidReason: "Invalid permit signature",
    };
  }

  // Verify usdc address is correct for the chain
  if (
    paymentDetails.usdcAddress !==
    getUsdcAddressForChain(payload.payload.params.chainId)
  ) {
    return {
      isValid: false,
      invalidReason: "Invalid usdc address",
    };
  }

  // Verify deadline is not yet expired
  // Pad 3 block to account for round tripping
  if (payload.payload.params.validBefore < Date.now() / 1000 + 6) {
    return {
      isValid: false,
      invalidReason: "Deadline on permit isn't far enough in the future",
    };
  }

  // Verify deadline is not yet valid
  if (payload.payload.params.validAfter > Date.now() / 1000) {
    return {
      isValid: false,
      invalidReason: "Deadline on permit is in the future",
    };
  }

  // Verify client has enough funds to cover paymentDetails.maxAmountRequired
  const balance = await getUSDCBalance(client, payload.payload.params.from);

  if (balance < paymentDetails.maxAmountRequired) {
    return {
      isValid: false,
      invalidReason: "Client does not have enough funds",
    };
  }

  // Verify value in payload is enough to cover paymentDetails.maxAmountRequired
  if (payload.payload.params.value < paymentDetails.maxAmountRequired) {
    return {
      isValid: false,
      invalidReason:
        "Value in payload is not enough to cover paymentDetails.maxAmountRequired",
    };
  }

  return {
    isValid: true,
    invalidReason: undefined,
  };
}

/**
 * Settles a payment by executing a USDC transferWithAuthorization transaction
 * @param wallet - The facilitator wallet that will submit the transaction
 * @param payload - The signed payment payload containing the transfer parameters and signature
 * @param paymentDetails - The original payment details that were used to create the payload
 * @returns A PaymentExecutionResponse containing the transaction status and hash
 * @remarks This function executes the actual USDC transfer using the signed authorization from the user.
 * The facilitator wallet submits the transaction but does not need to hold or transfer any tokens itself.
 */
export async function settle(
  wallet: SignerWallet,
  payload: PaymentPayloadV1,
  paymentDetails: PaymentNeededDetails
): Promise<PaymentExecutionResponse> {
  // TODO: probably should store stuff in a db here, but the txs can be recovered from chain if we must

  // re-verify to ensure the payment is still valid
  const valid = await verify(wallet, payload, paymentDetails);

  if (!valid.isValid) {
    return {
      success: false,
      error: `Payment is no longer valid: ${valid.invalidReason}`,
    };
  }

  const tx = await wallet.writeContract({
    address: payload.payload.params.usdcAddress,
    abi,
    functionName: "transferWithAuthorization",
    args: [
      payload.payload.params.from,
      payload.payload.params.to,
      payload.payload.params.value,
      payload.payload.params.validAfter,
      payload.payload.params.validBefore,
      payload.payload.params.nonce,
      payload.payload.signature,
    ],
  });

  const receipt = await wallet.waitForTransactionReceipt({ hash: tx });

  if (receipt.status !== "success") {
    return {
      success: false,
      error: `Transaction failed`,
      txHash: tx,
      chainId: payload.payload.params.chainId,
    };
  }

  return {
    success: true,
    txHash: tx,
    chainId: payload.payload.params.chainId,
  };
}
