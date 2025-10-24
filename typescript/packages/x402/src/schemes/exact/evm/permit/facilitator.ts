import { Account, Address, Chain, getAddress, Hex, Transport } from "viem";
import { getNetworkId } from "../../../../shared";
import { getERC20Balance, getVersion } from "../../../../shared/evm";
import {
  permitTypes,
  erc20PermitABI,
  ConnectedClient,
  SignerWallet,
} from "../../../../types/shared/evm";
import {
  PaymentRequirements,
  PermitPaymentPayload,
  SettleResponse,
  VerifyResponse,
} from "../../../../types/verify";
import { SCHEME } from "../../../exact";
import { splitSignature } from "./sign";

/**
 * Verifies an EIP-2612 Permit payment payload
 *
 * @param client - The public client used for blockchain interactions
 * @param payload - The signed payment payload containing permit parameters and signature
 * @param paymentRequirements - The payment requirements that the payload must satisfy
 * @returns A VerifyResponse indicating if the payment is valid and any invalidation reason
 */
export async function verify<
  transport extends Transport,
  chain extends Chain,
  account extends Account | undefined,
>(
  client: ConnectedClient<transport, chain, account>,
  payload: PermitPaymentPayload,
  paymentRequirements: PaymentRequirements,
): Promise<VerifyResponse> {
  // Validate payload has correct authorizationType
  if (
    payload.payload.authorizationType !== "permit" ||
    payload.scheme !== SCHEME ||
    paymentRequirements.scheme !== SCHEME
  ) {
    return {
      isValid: false,
      invalidReason: "unsupported_scheme",
    };
  }

  const permitPayload = payload.payload;
  const { owner, spender, value, deadline, nonce } = permitPayload.authorization;

  // Get token name for EIP-712 domain
  let name: string;
  let version: string;
  let erc20Address: Address;
  let chainId: number;

  try {
    chainId = getNetworkId(payload.network);
    erc20Address = paymentRequirements.asset as Address;
    name =
      paymentRequirements.extra?.name ??
      ((await client.readContract({
        address: erc20Address,
        abi: erc20PermitABI,
        functionName: "name",
      })) as string);
    version = paymentRequirements.extra?.version ?? (await getVersion(client));
  } catch {
    return {
      isValid: false,
      invalidReason: "invalid_network",
      payer: owner,
    };
  }

  // Verify permit signature
  const permitTypedData = {
    types: permitTypes,
    domain: {
      name: name,
      version: version,
      chainId,
      verifyingContract: erc20Address,
    },
    primaryType: "Permit" as const,
    message: {
      owner: getAddress(owner),
      spender: getAddress(spender),
      value: BigInt(value),
      nonce: BigInt(nonce),
      deadline: BigInt(deadline),
    },
  };

  const recoveredAddress = await client.verifyTypedData({
    address: owner as Address,
    ...permitTypedData,
    signature: permitPayload.signature as Hex,
  });

  if (!recoveredAddress) {
    return {
      isValid: false,
      invalidReason: "invalid_permit_signature",
      payer: owner,
    };
  }

  // Verify deadline hasn't passed
  const now = Math.floor(Date.now() / 1000);
  if (BigInt(deadline) < now) {
    return {
      isValid: false,
      invalidReason: "permit_expired",
      payer: owner,
    };
  }

  // Verify spender matches the facilitator's wallet address
  // In x402, the facilitator acts as the spender to execute transferFrom
  // The client must authorize the facilitator's wallet address as the spender
  if (client.account && getAddress(spender) !== getAddress(client.account.address)) {
    return {
      isValid: false,
      invalidReason: "invalid_spender_address",
      payer: owner,
    };
  }

  // Verify owner has sufficient balance
  const balance = await getERC20Balance(client, erc20Address, owner as Address);
  if (balance < BigInt(paymentRequirements.maxAmountRequired)) {
    return {
      isValid: false,
      invalidReason: "insufficient_funds",
      payer: owner,
    };
  }

  // Verify value meets the required amount
  if (BigInt(value) < BigInt(paymentRequirements.maxAmountRequired)) {
    return {
      isValid: false,
      invalidReason: "insufficient_payment_amount",
      payer: owner,
    };
  }

  return {
    isValid: true,
    payer: owner,
  };
}

/**
 * Settles an EIP-2612 Permit payment by calling permit() then transferFrom()
 *
 * @param wallet - The facilitator wallet that will execute the permit and transfer
 * @param paymentPayload - The signed payment payload containing permit parameters and signature
 * @param paymentRequirements - The payment requirements
 * @returns A SettleResponse containing the transaction status and hash
 */
export async function settle<transport extends Transport, chain extends Chain>(
  wallet: SignerWallet<chain, transport>,
  paymentPayload: PermitPaymentPayload,
  paymentRequirements: PaymentRequirements,
): Promise<SettleResponse> {
  const permitPayload = paymentPayload.payload;

  if (permitPayload.authorizationType !== "permit") {
    return {
      success: false,
      errorReason: "invalid_authorization_type",
      transaction: "",
      network: paymentPayload.network,
      payer: "",
    };
  }

  // Re-verify to ensure the payment is still valid
  const valid = await verify(wallet, paymentPayload, paymentRequirements);

  if (!valid.isValid) {
    return {
      success: false,
      network: paymentPayload.network,
      transaction: "",
      errorReason: valid.invalidReason ?? "invalid_payment",
      payer: permitPayload.authorization.owner,
    };
  }

  const { owner, spender, value, deadline } = permitPayload.authorization;
  const { v, r, s } = splitSignature(permitPayload.signature as Hex);
  const tokenAddress = paymentRequirements.asset as Address;

  const nonce = await wallet.getTransactionCount({
    address: wallet.account.address,
  });

  // Step 1: Call permit to approve the spender
  const permitTx = await wallet.writeContract({
    address: tokenAddress,
    abi: erc20PermitABI,
    functionName: "permit",
    args: [owner as Address, spender as Address, BigInt(value), BigInt(deadline), v, r, s],
    chain: wallet.chain as Chain,
    nonce: nonce,
  });

  await wallet.waitForTransactionReceipt({ hash: permitTx });

  // Step 2: Call transferFrom to transfer tokens to payTo address
  const transferTx = await wallet.writeContract({
    address: tokenAddress,
    abi: erc20PermitABI,
    functionName: "transferFrom",
    args: [
      owner as Address,
      paymentRequirements.payTo as Address,
      BigInt(paymentRequirements.maxAmountRequired),
    ],
    chain: wallet.chain as Chain,
    nonce: nonce + 1,
  });

  const receipt = await wallet.waitForTransactionReceipt({ hash: transferTx });

  if (receipt.status !== "success") {
    return {
      success: false,
      errorReason: "transaction_failed",
      transaction: transferTx,
      network: paymentPayload.network,
      payer: owner,
    };
  }

  return {
    success: true,
    transaction: transferTx,
    network: paymentPayload.network,
    payer: owner,
  };
}
