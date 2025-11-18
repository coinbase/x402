import {
  Account,
  Address,
  Chain,
  getAddress,
  Hex,
  parseErc6492Signature,
  parseSignature,
  Transport,
} from "viem";
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
  ExactEvmPayload,
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

  const exactEvmPayload = payload.payload as ExactEvmPayload;

  // Check if this is an undeployed smart wallet
  // EIP-3009 requires on-chain signature verification which needs the wallet to be deployed
  const payerAddress = exactEvmPayload.authorization.from as Address;
  const bytecode = await client.getCode({ address: payerAddress });
  if (!bytecode || bytecode === "0x") {
    // Check if signature is ERC-6492 wrapped (indicates smart wallet)
    const signature = exactEvmPayload.signature;
    if (signature && signature.length > 200) {
      return {
        isValid: false,
        invalidReason: "invalid_exact_evm_payload_undeployed_smart_wallet",
        payer: payerAddress,
      };
    }
  }

  // Verify payload version
  if (payload.scheme !== SCHEME || paymentRequirements.scheme !== SCHEME) {
    return {
      isValid: false,
      invalidReason: `unsupported_scheme`,
      payer: exactEvmPayload.authorization.from,
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
      payer: (payload.payload as ExactEvmPayload).authorization.from,
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
      from: exactEvmPayload.authorization.from,
      to: exactEvmPayload.authorization.to,
      value: exactEvmPayload.authorization.value,
      validAfter: exactEvmPayload.authorization.validAfter,
      validBefore: exactEvmPayload.authorization.validBefore,
      nonce: exactEvmPayload.authorization.nonce,
    },
  };
  const recoveredAddress = await client.verifyTypedData({
    address: exactEvmPayload.authorization.from as Address,
    ...permitTypedData,
    signature: exactEvmPayload.signature as Hex,
  });
  if (!recoveredAddress) {
    return {
      isValid: false,
      invalidReason: "invalid_exact_evm_payload_signature", //"Invalid permit signature",
      payer: exactEvmPayload.authorization.from,
    };
  }

  // Verify that payment was made to the correct address
  if (getAddress(exactEvmPayload.authorization.to) !== getAddress(paymentRequirements.payTo)) {
    return {
      isValid: false,
      invalidReason: "invalid_exact_evm_payload_recipient_mismatch",
      payer: exactEvmPayload.authorization.from,
    };
  }

  // Verify deadline is not yet expired
  // Pad 3 block to account for round tripping
  if (
    BigInt(exactEvmPayload.authorization.validBefore) < BigInt(Math.floor(Date.now() / 1000) + 6)
  ) {
    return {
      isValid: false,
      invalidReason: "invalid_exact_evm_payload_authorization_valid_before", //"Deadline on permit isn't far enough in the future",
      payer: exactEvmPayload.authorization.from,
    };
  }
  // Verify deadline is not yet valid
  if (BigInt(exactEvmPayload.authorization.validAfter) > BigInt(Math.floor(Date.now() / 1000))) {
    return {
      isValid: false,
      invalidReason: "invalid_exact_evm_payload_authorization_valid_after", //"Deadline on permit is in the future",
      payer: exactEvmPayload.authorization.from,
    };
  }
  // Verify client has enough funds to cover paymentRequirements.maxAmountRequired
  const balance = await getERC20Balance(
    client,
    erc20Address,
    exactEvmPayload.authorization.from as Address,
  );
  if (balance < BigInt(paymentRequirements.maxAmountRequired)) {
    return {
      isValid: false,
      invalidReason: "insufficient_funds", //"Client does not have enough funds",
      payer: exactEvmPayload.authorization.from,
    };
  }
  // Verify value in payload is enough to cover paymentRequirements.maxAmountRequired
  if (BigInt(exactEvmPayload.authorization.value) < BigInt(paymentRequirements.maxAmountRequired)) {
    return {
      isValid: false,
      invalidReason: "invalid_exact_evm_payload_authorization_value", //"Value in payload is not enough to cover paymentRequirements.maxAmountRequired",
      payer: exactEvmPayload.authorization.from,
    };
  }
  return {
    isValid: true,
    invalidReason: undefined,
    payer: exactEvmPayload.authorization.from,
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
  const payload = paymentPayload.payload as ExactEvmPayload;

  // re-verify to ensure the payment is still valid
  const valid = await verify(wallet, paymentPayload, paymentRequirements);

  if (!valid.isValid) {
    return {
      success: false,
      network: paymentPayload.network,
      transaction: "",
      errorReason: valid.invalidReason ?? "invalid_scheme", //`Payment is no longer valid: ${valid.invalidReason}`,
      payer: payload.authorization.from,
    };
  }

  // Returns the original signature (no-op) if the signature is not a 6492 signature
  const { signature } = parseErc6492Signature(payload.signature as Hex);
  const parsedSig = parseSignature(signature);

  const tx = await wallet.writeContract({
    address: paymentRequirements.asset as Address,
    abi,
    functionName: "transferWithAuthorization" as const,
    args: [
      payload.authorization.from as Address,
      payload.authorization.to as Address,
      BigInt(payload.authorization.value),
      BigInt(payload.authorization.validAfter),
      BigInt(payload.authorization.validBefore),
      payload.authorization.nonce as Hex,
      (parsedSig.v as number | undefined) || parsedSig.yParity,
      parsedSig.r,
      parsedSig.s,
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
      payer: payload.authorization.from,
    };
  }

  return {
    success: true,
    transaction: tx,
    network: paymentPayload.network,
    payer: payload.authorization.from,
  };
}
