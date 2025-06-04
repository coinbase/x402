import { Account, Address, Chain, getAddress, Hex, Transport, verifyTypedData } from "viem";
import { getNetworkId } from "../../../shared";
import { getVersion, getERC20Balance } from "../../../shared/evm";
import {
  usdcABI as abi,
  authorizationTypes,
  config,
  ConnectedClient,
  SignerWallet,
} from "../../../types/shared/evm";
import {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
} from "../../../types/verify";
import { SCHEME } from "../../exact";

/**
 * Verifies a payment payload against the required payment details
 *
 * This function performs several verification steps:
 * - Verifies protocol version compatibility
 * - Validates the permit signature
 * - Confirms USDC contract address is correct for the chain
 * - Checks permit deadline is sufficiently in the future
 * - Verifies client has sufficient USDC balance
 * - Ensures payment amount meets required minimum
 *
 * @param client - The public client used for blockchain interactions
 * @param payload - The signed payment payload containing transfer parameters and signature
 * @param paymentRequirements - The payment requirements that the payload must satisfy
 * @returns A ValidPaymentRequest indicating if the payment is valid and any invalidation reason
 */
export async function verify<
  transport extends Transport,
  chain extends Chain,
  account extends Account | undefined,
>(
  client: ConnectedClient<transport, chain, account>,
  payload: PaymentPayload,
  paymentRequirements: PaymentRequirements,
): Promise<VerifyResponse> {
  /* TODO: work with security team on brainstorming more verification steps
  verification steps:
    - ✅ verify payload version
    - ✅ verify usdc address is correct for the chain
    - ✅ verify permit signature
    - ✅ verify deadline
    - verify nonce is current
    - ✅ verify client has enough funds to cover paymentRequirements.maxAmountRequired
    - ✅ verify value in payload is enough to cover paymentRequirements.maxAmountRequired
    - check min amount is above some threshold we think is reasonable for covering gas
    - verify resource is not already paid for (next version)
    */

  // Verify payload version
  if (payload.scheme !== SCHEME || paymentRequirements.scheme !== SCHEME) {
    return {
      isValid: false,
      invalidReason: `unsupported_scheme`,
      payer: payload.payload.authorization.from,
    };
  }

  let name: string;
  let chainId: number;
  let erc20Address: Address;
  let version: string;
  try {
    chainId = getNetworkId(payload.network);
    name = paymentRequirements.extra?.name ?? config[chainId.toString()].usdcName;
    erc20Address = paymentRequirements.asset as Address;
    version = paymentRequirements.extra?.version ?? (await getVersion(client));
  } catch {
    return {
      isValid: false,
      invalidReason: `invalid_network`,
      payer: payload.payload.authorization.from,
    };
  }
  // Verify permit signature is recoverable for the owner address
  const permitTypedData = {
    types: authorizationTypes,
    primaryType: "TransferWithAuthorization" as const,
    domain: {
      name,
      version,
      chainId,
      verifyingContract: erc20Address,
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
    address: payload.payload.authorization.from as Address,
    ...permitTypedData,
    signature: payload.payload.signature as Hex,
  });
  if (!recoveredAddress) {
    return {
      isValid: false,
      invalidReason: "invalid_exact_evm_payload_signature", //"Invalid permit signature",
      payer: payload.payload.authorization.from,
    };
  }

  // Verify that payment was made to the correct address
  if (getAddress(payload.payload.authorization.to) !== getAddress(paymentRequirements.payTo)) {
    return {
      isValid: false,
      invalidReason: "invalid_exact_evm_payload_recipient_mismatch",
      payer: payload.payload.authorization.from,
    };
  }

  // Verify deadline is not yet expired
  // Pad 3 block to account for round tripping
  if (
    BigInt(payload.payload.authorization.validBefore) < BigInt(Math.floor(Date.now() / 1000) + 6)
  ) {
    return {
      isValid: false,
      invalidReason: "invalid_exact_evm_payload_authorization_valid_before", //"Deadline on permit isn't far enough in the future",
      payer: payload.payload.authorization.from,
    };
  }
  // Verify deadline is not yet valid
  if (BigInt(payload.payload.authorization.validAfter) > BigInt(Math.floor(Date.now() / 1000))) {
    return {
      isValid: false,
      invalidReason: "invalid_exact_evm_payload_authorization_valid_after", //"Deadline on permit is in the future",
      payer: payload.payload.authorization.from,
    };
  }
  // Verify client has enough funds to cover paymentRequirements.maxAmountRequired
  const balance = await getERC20Balance(
    client,
    erc20Address,
    payload.payload.authorization.from as Address,
  );
  if (balance < BigInt(paymentRequirements.maxAmountRequired)) {
    return {
      isValid: false,
      invalidReason: "insufficient_funds", //"Client does not have enough funds",
      payer: payload.payload.authorization.from,
    };
  }
  // Verify value in payload is enough to cover paymentRequirements.maxAmountRequired
  if (BigInt(payload.payload.authorization.value) < BigInt(paymentRequirements.maxAmountRequired)) {
    return {
      isValid: false,
      invalidReason: "invalid_exact_evm_payload_authorization_value", //"Value in payload is not enough to cover paymentRequirements.maxAmountRequired",
      payer: payload.payload.authorization.from,
    };
  }
  return {
    isValid: true,
    invalidReason: undefined,
    payer: payload.payload.authorization.from,
  };
}

/**
 * Settles a payment by executing a USDC transferWithAuthorization transaction
 *
 * This function executes the actual USDC transfer using the signed authorization from the user.
 * The facilitator wallet submits the transaction but does not need to hold or transfer any tokens itself.
 *
 * @param wallet - The facilitator wallet that will submit the transaction
 * @param paymentPayload - The signed payment payload containing the transfer parameters and signature
 * @param paymentRequirements - The original payment details that were used to create the payload
 * @returns A PaymentExecutionResponse containing the transaction status and hash
 */
export async function settle<transport extends Transport, chain extends Chain>(
  wallet: SignerWallet<chain, transport>,
  paymentPayload: PaymentPayload,
  paymentRequirements: PaymentRequirements,
): Promise<SettleResponse> {
  // re-verify to ensure the payment is still valid
  const valid = await verify(wallet, paymentPayload, paymentRequirements);

  if (!valid.isValid) {
    return {
      success: false,
      network: paymentPayload.network,
      transaction: "",
      errorReason: valid.invalidReason ?? "invalid_scheme", //`Payment is no longer valid: ${valid.invalidReason}`,
      payer: paymentPayload.payload.authorization.from,
    };
  }

  const tx = await wallet.writeContract({
    address: paymentRequirements.asset as Address,
    abi,
    functionName: "transferWithAuthorization" as const,
    args: [
      paymentPayload.payload.authorization.from as Address,
      paymentPayload.payload.authorization.to as Address,
      BigInt(paymentPayload.payload.authorization.value),
      BigInt(paymentPayload.payload.authorization.validAfter),
      BigInt(paymentPayload.payload.authorization.validBefore),
      paymentPayload.payload.authorization.nonce as Hex,
      paymentPayload.payload.signature as Hex,
    ],
    chain: wallet.chain as Chain,
  });

  const receipt = await wallet.waitForTransactionReceipt({ hash: tx });

  if (receipt.status !== "success") {
    return {
      success: false,
      errorReason: "invalid_transaction_state", //`Transaction failed`,
      transaction: tx,
      network: paymentPayload.network,
      payer: paymentPayload.payload.authorization.from,
    };
  }

  return {
    success: true,
    transaction: tx,
    network: paymentPayload.network,
    payer: paymentPayload.payload.authorization.from,
  };
}
