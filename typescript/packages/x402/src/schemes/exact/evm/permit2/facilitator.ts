import { Account, Address, Chain, getAddress, Hex, Transport } from "viem";
import { getNetworkId } from "../../../../shared";
import { getERC20Balance, getERC20Allowance } from "../../../../shared/evm";
import {
  permit2Types,
  permit2ABI,
  PERMIT2_ADDRESS,
  ConnectedClient,
  SignerWallet,
} from "../../../../types/shared/evm";
import {
  PaymentRequirements,
  Permit2PaymentPayload,
  SettleResponse,
  VerifyResponse,
} from "../../../../types/verify";
import { SCHEME } from "../../../exact";

/**
 * Verifies a Permit2 payment payload
 *
 * @param client - The public client used for blockchain interactions
 * @param payload - The signed payment payload containing permit2 parameters and signature
 * @param paymentRequirements - The payment requirements that the payload must satisfy
 * @returns A VerifyResponse indicating if the payment is valid and any invalidation reason
 */
export async function verify<
  transport extends Transport,
  chain extends Chain,
  account extends Account | undefined,
>(
  client: ConnectedClient<transport, chain, account>,
  payload: Permit2PaymentPayload,
  paymentRequirements: PaymentRequirements,
): Promise<VerifyResponse> {
  // Validate payload has correct authorizationType
  if (
    payload.payload.authorizationType !== "permit2" ||
    payload.scheme !== SCHEME ||
    paymentRequirements.scheme !== SCHEME
  ) {
    return {
      isValid: false,
      invalidReason: "unsupported_scheme",
    };
  }

  const permit2Payload = payload.payload;
  const { owner, spender, token, amount, deadline, nonce } = permit2Payload.authorization;

  const chainId = getNetworkId(payload.network);
  const tokenAddress = getAddress(token);
  const ownerAddress = getAddress(owner);

  // Verify permit2 signature
  const permit2TypedData = {
    types: permit2Types,
    domain: {
      name: "Permit2",
      chainId,
      verifyingContract: PERMIT2_ADDRESS,
    },
    primaryType: "PermitTransferFrom" as const,
    message: {
      permitted: {
        token: tokenAddress,
        amount: BigInt(amount),
      },
      spender: getAddress(spender),
      nonce: BigInt(nonce),
      deadline: BigInt(deadline),
    },
  };

  const recoveredAddress = await client.verifyTypedData({
    address: ownerAddress,
    ...permit2TypedData,
    signature: permit2Payload.signature as Hex,
  });

  if (!recoveredAddress) {
    return {
      isValid: false,
      invalidReason: "invalid_permit2_signature",
      payer: owner,
    };
  }

  // Verify deadline hasn't passed
  const now = Math.floor(Date.now() / 1000);
  if (BigInt(deadline) < now) {
    return {
      isValid: false,
      invalidReason: "permit2_expired",
      payer: owner,
    };
  }

  // Verify spender matches the facilitator's wallet address
  // In x402, the facilitator acts as the spender to execute permitTransferFrom
  // The client must authorize the facilitator's wallet address as the spender
  if (client.account && getAddress(spender) !== getAddress(client.account.address)) {
    return {
      isValid: false,
      invalidReason: "invalid_spender_address",
      payer: owner,
    };
  }

  // Verify token address matches payment requirements
  if (tokenAddress.toLowerCase() !== (paymentRequirements.asset as string).toLowerCase()) {
    return {
      isValid: false,
      invalidReason: "token_mismatch",
      payer: owner,
    };
  }

  // Verify owner has approved Permit2 contract
  // This is a critical check - users must approve Uniswap Permit2 once before using it
  const allowance = await getERC20Allowance(client, tokenAddress, ownerAddress, PERMIT2_ADDRESS);
  if (allowance < BigInt(paymentRequirements.maxAmountRequired)) {
    return {
      isValid: false,
      invalidReason: "permit2_not_approved",
      payer: owner,
    };
  }

  // Verify owner has sufficient token balance
  const balance = await getERC20Balance(client, tokenAddress, ownerAddress);
  if (balance < BigInt(paymentRequirements.maxAmountRequired)) {
    return {
      isValid: false,
      invalidReason: "insufficient_funds",
      payer: owner,
    };
  }

  // Verify amount meets the required amount
  if (BigInt(amount) < BigInt(paymentRequirements.maxAmountRequired)) {
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
 * Settles a Permit2 payment by calling permitTransferFrom()
 *
 * @param wallet - The facilitator wallet that will execute the permit transfer
 * @param paymentPayload - The signed payment payload containing permit2 parameters and signature
 * @param paymentRequirements - The payment requirements
 * @returns A SettleResponse containing the transaction status and hash
 */
export async function settle<transport extends Transport, chain extends Chain>(
  wallet: SignerWallet<chain, transport>,
  paymentPayload: Permit2PaymentPayload,
  paymentRequirements: PaymentRequirements,
): Promise<SettleResponse> {
  const permit2Payload = paymentPayload.payload;

  if (permit2Payload.authorizationType !== "permit2") {
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
      payer: permit2Payload.authorization.owner,
    };
  }

  const { owner, token, amount, deadline, nonce } = permit2Payload.authorization;
  const tokenAddress = getAddress(token);
  const ownerAddress = getAddress(owner);

  try {
    // Call permitTransferFrom on Permit2 contract
    const tx = await wallet.writeContract({
      address: PERMIT2_ADDRESS,
      abi: permit2ABI,
      functionName: "permitTransferFrom",
      args: [
        {
          permitted: {
            token: tokenAddress,
            amount: BigInt(amount),
          },
          nonce: BigInt(nonce),
          deadline: BigInt(deadline),
        },
        {
          to: paymentRequirements.payTo as Address,
          requestedAmount: BigInt(paymentRequirements.maxAmountRequired),
        },
        ownerAddress,
        permit2Payload.signature as Hex,
      ],
      chain: wallet.chain as Chain,
    });

    const receipt = await wallet.waitForTransactionReceipt({ hash: tx });

    if (receipt.status !== "success") {
      return {
        success: false,
        errorReason: "transaction_failed",
        transaction: tx,
        network: paymentPayload.network,
        payer: owner,
      };
    }

    return {
      success: true,
      transaction: tx,
      network: paymentPayload.network,
      payer: owner,
    };
  } catch {
    return {
      success: false,
      errorReason: "settlement_failed",
      transaction: "",
      network: paymentPayload.network,
      payer: owner,
    };
  }
}
