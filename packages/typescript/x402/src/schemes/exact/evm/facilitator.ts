import { Account, Address, Chain, Transport, verifyTypedData } from "viem";
import { SettleResponse, PaymentDetails, VerifyResponse } from "../../../types/index.js";
import { PaymentPayload } from "../../exact/evm/types.js";
import { getUsdcAddressForChain, getUSDCBalance } from "../../../shared/evm/usdc.js";
import { usdcABI as abi } from "../../../shared/evm/erc20PermitABI.js";
import { ConnectedClient, SignerWallet } from "../../../shared/evm/wallet.js";
import { authorizationTypes } from "../../../shared/evm/eip3009.js";
import { config } from "../../../shared/evm/config.js";
import { SCHEME } from "../../exact/index.js";

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
export async function verify<
  transport extends Transport,
  chain extends Chain,
  account extends Account | undefined,
>(
  client: ConnectedClient<transport, chain, account>,
  payload: PaymentPayload,
  paymentDetails: PaymentDetails,
): Promise<VerifyResponse> {
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
  if (payload.scheme !== SCHEME || paymentDetails.scheme !== SCHEME) {
    return {
      isValid: false,
      invalidReason: `Incompatible payload scheme. payload: ${payload.scheme}, paymentDetails: ${paymentDetails.scheme}, supported: ${SCHEME}`,
    };
  }

  let usdcName: string;
  let chainId: number;
  let usdcAddress: Address;
  try {
    usdcName = config[payload.networkId].usdcName;
    chainId = parseInt(payload.networkId);
    usdcAddress = getUsdcAddressForChain(chainId);
  } catch (e) {
    return {
      isValid: false,
      invalidReason: `Unsupported network id: ${payload.networkId}`,
    };
  }

  // Verify permit signature is recoverable for the owner address
  const permitTypedData = {
    types: authorizationTypes,
    primaryType: "TransferWithAuthorization" as const,
    domain: {
      name: usdcName,
      version: payload.payload.authorization.version,
      chainId: chainId,
      // This implicitly verifies the usdc address is correct in the signature
      verifyingContract: paymentDetails.usdcAddress as Address,
    },
    message: {
      from: payload.payload.authorization.from,
      to: payload.payload.authorization.to,
      value: payload.payload.authorization.value,
      validAfter: payload.payload.authorization.validAfter,
      validBefore: payload.payload.authorization.validBefore,
      nonce: payload.payload.authorization.nonce,
    },
  };

  const recoveredAddress = await verifyTypedData({
    address: payload.payload.authorization.from,
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
  if (paymentDetails.usdcAddress !== usdcAddress) {
    return {
      isValid: false,
      invalidReason: "Invalid usdc address",
    };
  }

  // Verify deadline is not yet expired
  // Pad 3 block to account for round tripping
  if (payload.payload.authorization.validBefore < Date.now() / 1000 + 6) {
    return {
      isValid: false,
      invalidReason: "Deadline on permit isn't far enough in the future",
    };
  }

  // Verify deadline is not yet valid
  if (payload.payload.authorization.validAfter > Date.now() / 1000) {
    return {
      isValid: false,
      invalidReason: "Deadline on permit is in the future",
    };
  }

  // Verify client has enough funds to cover paymentDetails.maxAmountRequired
  const balance = await getUSDCBalance(client, payload.payload.authorization.from);

  if (balance < paymentDetails.maxAmountRequired) {
    return {
      isValid: false,
      invalidReason: "Client does not have enough funds",
    };
  }

  // Verify value in payload is enough to cover paymentDetails.maxAmountRequired
  if (payload.payload.authorization.value < paymentDetails.maxAmountRequired) {
    return {
      isValid: false,
      invalidReason: "Value in payload is not enough to cover paymentDetails.maxAmountRequired",
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
export async function settle<transport extends Transport, chain extends Chain>(
  wallet: SignerWallet<chain, transport>,
  payload: PaymentPayload,
  paymentDetails: PaymentDetails,
): Promise<SettleResponse> {
  // re-verify to ensure the payment is still valid
  const valid = await verify(wallet, payload, paymentDetails);

  if (!valid.isValid) {
    return {
      success: false,
      error: `Payment is no longer valid: ${valid.invalidReason}`,
    };
  }

  const tx = await wallet.writeContract({
    address: paymentDetails.usdcAddress as Address,
    abi,
    functionName: "transferWithAuthorization" as const,
    args: [
      payload.payload.authorization.from,
      payload.payload.authorization.to,
      payload.payload.authorization.value,
      payload.payload.authorization.validAfter,
      payload.payload.authorization.validBefore,
      payload.payload.authorization.nonce,
      payload.payload.signature,
    ],
    chain: wallet.chain as any,
  });

  const receipt = await wallet.waitForTransactionReceipt({ hash: tx });

  if (receipt.status !== "success") {
    return {
      success: false,
      error: `Transaction failed`,
      txHash: tx,
      networkId: payload.networkId,
    };
  }

  return {
    success: true,
    txHash: tx,
    networkId: payload.networkId,
  };
}
