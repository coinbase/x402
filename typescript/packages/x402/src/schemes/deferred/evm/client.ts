import { Address, Chain, Client, getAddress, Hex, LocalAccount, toHex, Transport } from "viem";
import { getNetworkId } from "../../../shared/network";
import { isSignerWallet, SignerWallet } from "../../../types/shared/evm";
import { PaymentPayload, PaymentRequirements, UnsignedPaymentPayload } from "../../../types/verify";
import {
  DeferredEscrowDepositAuthorization,
  DeferredEscrowDepositAuthorizationConfig,
  DeferredEscrowDepositAuthorizationSchema,
  DeferredEscrowDepositAuthorizationSignedPermit,
  DeferredEvmPayloadVoucher,
  DeferredEvmPaymentRequirementsExtraAggregationVoucherSchema,
  DeferredEvmPaymentRequirementsExtraNewVoucherSchema,
  DeferredPaymentRequirementsSchema,
  DEFERRRED_SCHEME,
  UnsignedDeferredPaymentPayload,
  UnsignedDeferredPaymentPayloadSchema,
} from "../../../types/verify/schemes/deferred";
import {
  signPermit,
  signDepositAuthorizationInner,
  signVoucher,
  verifyVoucherSignature,
} from "./sign";
import { encodePayment } from "./utils/paymentUtils";
import { getUsdcChainConfigForChain } from "../../../shared/evm";
import { randomBytes } from "node:crypto";
import { useDeferredFacilitator } from "../../../verify/useDeferred";

const EXPIRY_TIME = 60 * 60 * 24 * 30; // 30 days

/**
 * Prepares an unsigned payment header with the given sender address and payment requirements.
 *
 * @param buyer - The sender's address from which the payment will be made
 * @param x402Version - The version of the X402 protocol to use
 * @param paymentRequirements - The payment requirements containing scheme and network information
 * @param extraPayload - Extra payload to be included in the payment header creation
 * @returns An unsigned payment payload containing authorization details
 */
export async function preparePaymentHeader(
  buyer: Address,
  x402Version: number,
  paymentRequirements: PaymentRequirements,
  extraPayload?: Record<string, unknown>,
): Promise<UnsignedDeferredPaymentPayload> {
  const deferredPaymentRequirements = DeferredPaymentRequirementsSchema.parse(paymentRequirements);

  const voucher =
    deferredPaymentRequirements.extra.type === "new"
      ? createNewVoucher(buyer, deferredPaymentRequirements)
      : await aggregateVoucher(buyer, deferredPaymentRequirements);

  const depositAuthorization = extraPayload
    ? DeferredEscrowDepositAuthorizationSchema.parse(extraPayload)
    : undefined;

  return {
    x402Version,
    scheme: DEFERRRED_SCHEME,
    network: deferredPaymentRequirements.network,
    payload: {
      signature: undefined,
      voucher: voucher,
      ...(depositAuthorization && { depositAuthorization }),
    },
  } as const satisfies UnsignedDeferredPaymentPayload;
}

/**
 * Creates a new voucher with the given payment requirements
 *
 * @param buyer - The sender's address from which the payment will be made
 * @param paymentRequirements - The payment requirements containing scheme and network information
 * @returns The new voucher
 */
export function createNewVoucher(
  buyer: Address,
  paymentRequirements: PaymentRequirements,
): DeferredEvmPayloadVoucher {
  const extra = DeferredEvmPaymentRequirementsExtraNewVoucherSchema.parse(
    paymentRequirements.extra,
  );

  return {
    id: extra.voucher.id.toLowerCase(),
    buyer: getAddress(buyer),
    seller: getAddress(paymentRequirements.payTo),
    valueAggregate: paymentRequirements.maxAmountRequired,
    asset: getAddress(paymentRequirements.asset),
    timestamp: Math.floor(Date.now() / 1000),
    nonce: 0,
    escrow: getAddress(extra.voucher.escrow),
    chainId: getNetworkId(paymentRequirements.network),
    expiry: Math.floor(Date.now() / 1000) + EXPIRY_TIME,
  };
}

/**
 * Aggregates a voucher with new payment requirements
 *
 * @param buyer - The sender's address from which the payment will be made
 * @param paymentRequirements - The payment requirements containing scheme and network information
 * @returns The aggregated voucher
 */
export async function aggregateVoucher(
  buyer: Address,
  paymentRequirements: PaymentRequirements,
): Promise<DeferredEvmPayloadVoucher> {
  const extra = DeferredEvmPaymentRequirementsExtraAggregationVoucherSchema.parse(
    paymentRequirements.extra,
  );
  const { id, escrow, seller, valueAggregate, asset, nonce, chainId, expiry, timestamp } =
    extra.voucher;
  const now = Math.floor(Date.now() / 1000);

  // verify previous voucher matches payment requirements
  if (getAddress(paymentRequirements.payTo) !== getAddress(seller)) {
    throw new Error("Invalid voucher seller");
  }
  if (getAddress(paymentRequirements.asset) !== getAddress(asset)) {
    throw new Error("Invalid voucher asset");
  }
  if (getNetworkId(paymentRequirements.network) !== chainId) {
    throw new Error("Invalid voucher chainId");
  }
  if (now > expiry) {
    throw new Error("Voucher expired");
  }
  if (now < timestamp) {
    throw new Error("Voucher timestamp is in the future");
  }

  // verify signature is valid and the voucher's buyer is the client
  const isValid = await verifyVoucherSignature(extra.voucher, extra.signature as Hex, buyer);
  if (!isValid) {
    throw new Error("Invalid voucher signature");
  }

  return {
    id,
    buyer,
    seller,
    valueAggregate: (
      BigInt(paymentRequirements.maxAmountRequired) + BigInt(valueAggregate)
    ).toString(),
    asset,
    timestamp: now,
    nonce: nonce + 1,
    escrow,
    chainId,
    expiry: now + EXPIRY_TIME,
  };
}

/**
 * Signs a payment header using the provided client and payment requirements.
 *
 * @param client - The signer wallet instance used to sign the payment header
 * @param unsignedPaymentPayload - The unsigned payment payload to be signed
 * @returns A promise that resolves to the signed payment payload
 */
export async function signPaymentHeader<transport extends Transport, chain extends Chain>(
  client: SignerWallet<chain, transport> | LocalAccount,
  unsignedPaymentPayload: UnsignedPaymentPayload,
): Promise<PaymentPayload> {
  const unsignedDeferredPaymentPayload =
    UnsignedDeferredPaymentPayloadSchema.parse(unsignedPaymentPayload);
  const { signature } = await signVoucher(client, unsignedDeferredPaymentPayload.payload.voucher);

  return {
    ...unsignedDeferredPaymentPayload,
    payload: {
      ...unsignedDeferredPaymentPayload.payload,
      signature,
    },
  };
}

/**
 * Creates a complete payment payload by preparing and signing a payment header.
 *
 * @param client - The signer wallet instance used to create and sign the payment
 * @param x402Version - The version of the X402 protocol to use
 * @param paymentRequirements - The payment requirements containing scheme and network information
 * @param extraPayload - Extra payload to be included in the payment header creation
 * @returns A promise that resolves to the complete signed payment payload
 */
export async function createPayment<transport extends Transport, chain extends Chain>(
  client: SignerWallet<chain, transport> | LocalAccount,
  x402Version: number,
  paymentRequirements: PaymentRequirements,
  extraPayload?: Record<string, unknown>,
): Promise<PaymentPayload> {
  const from = isSignerWallet(client) ? client.account!.address : client.address;
  const unsignedPaymentHeader = await preparePaymentHeader(
    from,
    x402Version,
    paymentRequirements,
    extraPayload,
  );
  return signPaymentHeader(client, unsignedPaymentHeader);
}

/**
 * Creates and encodes a payment header for the given client and payment requirements.
 *
 * @param client - The signer wallet instance used to create the payment header
 * @param x402Version - The version of the X402 protocol to use
 * @param paymentRequirements - The payment requirements containing scheme and network information
 * @param extraPayload - Extra payload to be included in the payment header creation
 * @returns A promise that resolves to the encoded payment header string
 */
export async function createPaymentHeader(
  client: SignerWallet | LocalAccount,
  x402Version: number,
  paymentRequirements: PaymentRequirements,
  extraPayload?: Record<string, unknown>,
): Promise<string> {
  const payment = await createPayment(client, x402Version, paymentRequirements, extraPayload);
  return encodePayment(payment);
}

/**
 * Creates the payment extra payload for deferred scheme with deposit with authorization flow.
 *
 * __Note__: This implementation requires the buyer to trust the seller provided balance to decide if they deposit additional
 * funds to the escrow. A malicious seller could manipulate the value and force additional deposits from the buyer, those funds
 * would not be at risk as they could be withdrawn, however it would be a form of abuse.
 * TODO: We could improve this by having this client-side function verify the balance themselves, that requires however the client
 * to make a direct call to the facilitator.
 *
 * @param client - The signer wallet instance used to create the payment extra payload
 * @param paymentRequirements - The payment requirements containing scheme and network information
 * @param depositConfigs - The auto deposit configurations to use for the deposit with authorization flow
 * @returns The extra payload or undefined
 */
export async function createPaymentExtraPayload(
  client: SignerWallet | LocalAccount,
  paymentRequirements: PaymentRequirements,
  depositConfigs: DeferredEscrowDepositAuthorizationConfig[],
): Promise<DeferredEscrowDepositAuthorization | undefined> {
  const { network, asset, extra, maxAmountRequired } =
    DeferredPaymentRequirementsSchema.parse(paymentRequirements);
  const buyer = (client as LocalAccount).address || (client as Client).account?.address;

  // No account info, no deposit
  if (extra.account === undefined) {
    return;
  }

  let depositConfig = depositConfigs.find(config => getAddress(config.asset) === getAddress(asset));

  if (depositConfig === undefined) {
    const chainId = getNetworkId(network);
    const usdc = getUsdcChainConfigForChain(chainId);

    // No matching asset, no deposit
    if (usdc === undefined) {
      return;
    }

    depositConfig = {
      asset: usdc.usdcAddress,
      assetDomain: {
        name: usdc.usdcName,
        version: "2", // TODO: use getVersion
      },
      threshold: "10000", // 0.01 USDC
      amount: "1000000", // 1 USDC
    };
  }

  // Enough balance, no deposit
  if (
    BigInt(extra.account.balance) >=
    BigInt(depositConfig.threshold) + BigInt(maxAmountRequired)
  ) {
    return;
  }

  // Ensure the deposit is actually needed
  // This creates a client/buyer <> facilitator interaction but it's necessary to avoid having to trust the seller
  const { getBuyerData } = useDeferredFacilitator({
    url: extra.account.facilitator as `${string}://${string}`,
  });
  const buyerData = await getBuyerData(
    buyer,
    paymentRequirements.payTo,
    asset,
    extra.voucher.escrow,
    getNetworkId(network),
  );
  if ("error" in buyerData) {
    return;
  }

  // Re-check balance using the data obtained from the facilitator
  if (BigInt(buyerData.balance) >= BigInt(depositConfig.threshold) + BigInt(maxAmountRequired)) {
    return;
  }

  // Build ERC20 permit if needed
  let signedErc20Permit: DeferredEscrowDepositAuthorizationSignedPermit | undefined;
  if (BigInt(buyerData.assetAllowance) < BigInt(depositConfig.amount)) {
    const erc20Permit = {
      nonce: buyerData.assetPermitNonce,
      value: depositConfig.amount,
      domain: {
        name: depositConfig.assetDomain.name,
        version: depositConfig.assetDomain.version,
      },
      owner: getAddress(buyer),
      spender: getAddress(extra.voucher.escrow),
      deadline: Math.floor(Date.now() / 1000) + EXPIRY_TIME,
    };
    const erc20PermitSignature = await signPermit(
      client,
      erc20Permit,
      getNetworkId(network),
      getAddress(asset),
    );
    signedErc20Permit = {
      ...erc20Permit,
      signature: erc20PermitSignature.signature,
    };
  }

  // Build deposit authorization
  const depositAuthorization = {
    buyer: getAddress(buyer),
    seller: getAddress(paymentRequirements.payTo),
    asset: getAddress(asset),
    amount: depositConfig.amount,
    nonce: toHex(randomBytes(32)),
    expiry: Math.floor(Date.now() / 1000) + EXPIRY_TIME,
  };

  const depositAuthorizationSignature = await signDepositAuthorizationInner(
    client,
    depositAuthorization,
    getNetworkId(network),
    getAddress(extra.voucher.escrow),
  );

  return {
    ...(signedErc20Permit && { permit: signedErc20Permit }),
    depositAuthorization: {
      ...depositAuthorization,
      signature: depositAuthorizationSignature.signature,
    },
  };
}
