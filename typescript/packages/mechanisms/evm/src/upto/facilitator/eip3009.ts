import { PendingSettlementStore } from "@x402/core/facilitator";
import {
  FacilitatorContext,
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";
import { getAddress } from "viem";
import { startAssetContractCheck } from "../../assetCache";
import {
  eip3009ABI,
  receiveAuthorizationTypes,
  x402UptoErc3009ProxyABI,
  x402UptoErc3009ProxyAddress,
} from "../../constants";
import { FacilitatorEvmSigner } from "../../signer";
import { ErrSettlementPending } from "../../exact/facilitator/errors";
import { resolveDataSuffix } from "../../shared/extensions";
import { waitAndReturnSettleResponse } from "../../shared/settleReceipt";
import { verifyTypedDataSignature } from "../../shared/verifySignature";
import { UptoEIP3009Payload } from "../../types";
import { getEvmChainId, isValidTxHash, truncateErrorMessage } from "../../utils";
import { createUptoEIP3009Nonce } from "../client/eip3009";
import * as Errors from "./errors";

const MAX_UINT256 = (1n << 256n) - 1n;

type UptoEIP3009PendingFingerprint = {
  network: PaymentRequirements["network"];
  acceptedNetwork: PaymentRequirements["network"];
  amount: string;
  payer: `0x${string}`;
  asset: `0x${string}`;
  payTo: `0x${string}`;
  requiredPayTo: `0x${string}`;
  nonce: `0x${string}`;
};

type UptoEIP3009PendingRecord = UptoEIP3009PendingFingerprint & {
  txHash: `0x${string}`;
};

/**
 * Parses a decimal uint256 wire value.
 *
 * @param value - Decimal integer string.
 * @returns Parsed uint256.
 * @throws When the value is not a decimal uint256.
 */
function parseUint256(value: string): bigint {
  if (!/^\d+$/.test(value)) {
    throw new Error("invalid uint256");
  }
  const parsed = BigInt(value);
  if (parsed > MAX_UINT256) {
    throw new Error("uint256 overflow");
  }
  return parsed;
}

/**
 * Builds a normalized fingerprint for a settlement request.
 *
 * @param payload - Signed upto ERC-3009 payload.
 * @param requirements - Settlement-time requirements.
 * @param acceptedNetwork - Network from the accepted payment envelope.
 * @returns Normalized immutable request fingerprint.
 */
function buildPendingFingerprint(
  payload: UptoEIP3009Payload,
  requirements: PaymentRequirements,
  acceptedNetwork: PaymentRequirements["network"],
): UptoEIP3009PendingFingerprint {
  return {
    network: requirements.network,
    acceptedNetwork,
    amount: parseUint256(requirements.amount).toString(),
    payer: getAddress(payload.authorization.from),
    asset: getAddress(requirements.asset),
    payTo: getAddress(payload.paymentInfo.payTo),
    requiredPayTo: getAddress(requirements.payTo),
    nonce: payload.authorization.nonce.toLowerCase() as `0x${string}`,
  };
}

/**
 * Parses a persisted pending record without trusting store contents.
 *
 * @param value - Opaque JSON value from the pending store.
 * @returns Parsed record, or undefined when malformed.
 */
function parsePendingRecord(value: string): UptoEIP3009PendingRecord | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (
      typeof parsed.txHash !== "string" ||
      typeof parsed.network !== "string" ||
      typeof parsed.acceptedNetwork !== "string" ||
      typeof parsed.amount !== "string" ||
      typeof parsed.payer !== "string" ||
      typeof parsed.asset !== "string" ||
      typeof parsed.payTo !== "string" ||
      typeof parsed.requiredPayTo !== "string" ||
      typeof parsed.nonce !== "string"
    ) {
      return undefined;
    }
    if (
      !isValidTxHash(parsed.txHash) ||
      parseUint256(parsed.amount).toString() !== parsed.amount ||
      !/^0x[0-9a-fA-F]{64}$/.test(parsed.nonce)
    ) {
      return undefined;
    }
    return {
      txHash: parsed.txHash as `0x${string}`,
      network: parsed.network as PaymentRequirements["network"],
      acceptedNetwork: parsed.acceptedNetwork as PaymentRequirements["network"],
      amount: parsed.amount,
      payer: getAddress(parsed.payer),
      asset: getAddress(parsed.asset),
      payTo: getAddress(parsed.payTo),
      requiredPayTo: getAddress(parsed.requiredPayTo),
      nonce: parsed.nonce.toLowerCase() as `0x${string}`,
    };
  } catch {
    return undefined;
  }
}

/**
 * Checks whether a retry describes exactly the transaction already broadcast.
 *
 * @param record - Persisted transaction record.
 * @param fingerprint - Current retry fingerprint.
 * @returns Whether all immutable fields match.
 */
function pendingFingerprintMatches(
  record: UptoEIP3009PendingRecord,
  fingerprint: UptoEIP3009PendingFingerprint,
): boolean {
  return (
    record.network === fingerprint.network &&
    record.acceptedNetwork === fingerprint.acceptedNetwork &&
    record.amount === fingerprint.amount &&
    record.payer === fingerprint.payer &&
    record.asset === fingerprint.asset &&
    record.payTo === fingerprint.payTo &&
    record.requiredPayTo === fingerprint.requiredPayTo &&
    record.nonce === fingerprint.nonce
  );
}

/**
 * Best-effort cleanup of the pending settlement record.
 *
 * @param store - Pending settlement store.
 * @param signature - Primary pending key.
 */
async function deletePendingSettlement(
  store: PendingSettlementStore,
  signature: string,
): Promise<void> {
  try {
    await store.delete(signature);
  } catch {
    // The terminal receipt result is authoritative; stale cache cleanup is best-effort.
  }
}

export interface VerifyUptoEIP3009Options {
  /** Run the full-maximum proxy simulation. Defaults to true. */
  simulate?: boolean;
}

/**
 * Builds the canonical x402UptoERC3009Proxy settle arguments.
 *
 * @param requirements - Token and settlement amount.
 * @param payload - Signed upto ERC-3009 payload.
 * @returns Proxy settle arguments.
 */
export function buildUptoEIP3009SettleArgs(
  requirements: PaymentRequirements,
  payload: UptoEIP3009Payload,
) {
  return [
    getAddress(requirements.asset),
    parseUint256(requirements.amount),
    {
      from: getAddress(payload.authorization.from),
      to: getAddress(payload.authorization.to),
      value: parseUint256(payload.authorization.value),
      validAfter: parseUint256(payload.authorization.validAfter),
      validBefore: parseUint256(payload.authorization.validBefore),
      nonce: payload.authorization.nonce,
    },
    {
      payTo: getAddress(payload.paymentInfo.payTo),
      settler: getAddress(payload.paymentInfo.settler),
      salt: payload.paymentInfo.salt,
    },
    payload.signature,
  ] as const;
}

/**
 * Verifies an upto ERC-3009 authorization and its proxy settlement readiness.
 *
 * @param signer - Facilitator signer used for reads and signature checks.
 * @param payload - x402 payment payload.
 * @param requirements - Maximum payment requirements.
 * @param eip3009Payload - Upto ERC-3009 payload.
 * @param options - Verification options.
 * @returns Verification response.
 */
export async function verifyUptoEIP3009(
  signer: FacilitatorEvmSigner,
  payload: PaymentPayload,
  requirements: PaymentRequirements,
  eip3009Payload: UptoEIP3009Payload,
  options?: VerifyUptoEIP3009Options,
): Promise<VerifyResponse> {
  const payer =
    typeof eip3009Payload?.authorization?.from === "string"
      ? eip3009Payload.authorization.from
      : "";
  try {
    return await verifyUptoEIP3009Unchecked(signer, payload, requirements, eip3009Payload, options);
  } catch {
    return { isValid: false, invalidReason: Errors.ErrUptoInvalidPayload, payer };
  }
}

/**
 * Performs verification after the public boundary has installed malformed-input handling.
 *
 * @param signer - Facilitator signer used for reads and signature checks.
 * @param payload - x402 payment payload.
 * @param requirements - Maximum payment requirements.
 * @param eip3009Payload - Upto ERC-3009 payload.
 * @param options - Verification options.
 * @returns Verification response.
 */
async function verifyUptoEIP3009Unchecked(
  signer: FacilitatorEvmSigner,
  payload: PaymentPayload,
  requirements: PaymentRequirements,
  eip3009Payload: UptoEIP3009Payload,
  options?: VerifyUptoEIP3009Options,
): Promise<VerifyResponse> {
  const payer = eip3009Payload.authorization.from;

  if (payload.accepted.scheme !== "upto" || requirements.scheme !== "upto") {
    return { isValid: false, invalidReason: Errors.ErrUptoInvalidScheme, payer };
  }
  if (payload.accepted.network !== requirements.network) {
    return { isValid: false, invalidReason: Errors.ErrUptoNetworkMismatch, payer };
  }
  if (requirements.extra?.assetTransferMethod !== "eip3009") {
    return { isValid: false, invalidReason: Errors.ErrUptoInvalidPayload, payer };
  }

  const name = requirements.extra?.name;
  const version = requirements.extra?.version;
  if (typeof name !== "string" || typeof version !== "string") {
    return { isValid: false, invalidReason: Errors.ErrUptoEip3009MissingDomain, payer };
  }

  if (getAddress(eip3009Payload.authorization.to) !== getAddress(x402UptoErc3009ProxyAddress)) {
    return { isValid: false, invalidReason: Errors.ErrUptoEip3009ReceiverMismatch, payer };
  }
  if (parseUint256(eip3009Payload.authorization.value) !== parseUint256(requirements.amount)) {
    return { isValid: false, invalidReason: Errors.ErrUptoEip3009AmountMismatch, payer };
  }
  if (getAddress(eip3009Payload.paymentInfo.payTo) !== getAddress(requirements.payTo)) {
    return { isValid: false, invalidReason: Errors.ErrUptoEip3009RecipientMismatch, payer };
  }

  const requiredSettler = requirements.extra?.settlerAddress;
  const settler = getAddress(eip3009Payload.paymentInfo.settler);
  const signerOwnsSettler = signer.getAddresses().some(address => getAddress(address) === settler);
  if (
    typeof requiredSettler !== "string" ||
    getAddress(requiredSettler) !== settler ||
    !signerOwnsSettler
  ) {
    return { isValid: false, invalidReason: Errors.ErrUptoEip3009SettlerMismatch, payer };
  }

  const expectedNonce = createUptoEIP3009Nonce(
    getAddress(eip3009Payload.paymentInfo.payTo),
    settler,
    eip3009Payload.paymentInfo.salt,
  );
  if (eip3009Payload.authorization.nonce.toLowerCase() !== expectedNonce.toLowerCase()) {
    return { isValid: false, invalidReason: Errors.ErrUptoEip3009NonceMismatch, payer };
  }

  const now = Math.floor(Date.now() / 1000);
  if (parseUint256(eip3009Payload.authorization.validBefore) < BigInt(now + 6)) {
    return { isValid: false, invalidReason: Errors.ErrUptoEip3009ValidBefore, payer };
  }
  if (parseUint256(eip3009Payload.authorization.validAfter) > BigInt(now)) {
    return { isValid: false, invalidReason: Errors.ErrUptoEip3009ValidAfter, payer };
  }

  const token = getAddress(requirements.asset);
  const assetCheck = startAssetContractCheck(signer, requirements.network, token);
  const typedData = {
    address: getAddress(payer),
    domain: {
      name,
      version,
      chainId: getEvmChainId(requirements.network),
      verifyingContract: token,
    },
    types: receiveAuthorizationTypes,
    primaryType: "ReceiveWithAuthorization" as const,
    message: {
      from: getAddress(eip3009Payload.authorization.from),
      to: getAddress(eip3009Payload.authorization.to),
      value: parseUint256(eip3009Payload.authorization.value),
      validAfter: parseUint256(eip3009Payload.authorization.validAfter),
      validBefore: parseUint256(eip3009Payload.authorization.validBefore),
      nonce: eip3009Payload.authorization.nonce,
    },
    signature: eip3009Payload.signature,
  };

  try {
    const [signatureValid, balance, authorizationUsed, assetReason] = await Promise.all([
      verifyTypedDataSignature(signer, typedData),
      signer.readContract({
        address: token,
        abi: eip3009ABI,
        functionName: "balanceOf",
        args: [getAddress(payer)],
      }),
      signer.readContract({
        address: token,
        abi: eip3009ABI,
        functionName: "authorizationState",
        args: [getAddress(payer), eip3009Payload.authorization.nonce],
      }),
      assetCheck.await(),
    ]);

    if (assetReason) {
      return { isValid: false, invalidReason: assetReason, payer };
    }
    if (!signatureValid) {
      return { isValid: false, invalidReason: Errors.ErrUptoEip3009InvalidSignature, payer };
    }
    if (authorizationUsed !== false) {
      return { isValid: false, invalidReason: Errors.ErrUptoEip3009NonceAlreadyUsed, payer };
    }
    if (typeof balance !== "bigint" || balance < parseUint256(eip3009Payload.authorization.value)) {
      return { isValid: false, invalidReason: Errors.ErrUptoEip3009InsufficientBalance, payer };
    }
  } catch {
    return { isValid: false, invalidReason: Errors.ErrUptoEip3009SimulationFailed, payer };
  }

  if (options?.simulate === false) {
    return { isValid: true, invalidReason: undefined, payer };
  }

  try {
    await signer.readContract({
      address: x402UptoErc3009ProxyAddress,
      abi: x402UptoErc3009ProxyABI,
      functionName: "settle",
      args: buildUptoEIP3009SettleArgs(requirements, eip3009Payload),
      account: settler,
    });
  } catch {
    return { isValid: false, invalidReason: Errors.ErrUptoEip3009SimulationFailed, payer };
  }

  return { isValid: true, invalidReason: undefined, payer };
}

/**
 * Settles an upto ERC-3009 payment through the canonical proxy.
 *
 * @param signer - Facilitator signer.
 * @param payload - x402 payment payload.
 * @param requirements - Settlement-time requirements carrying the actual amount.
 * @param eip3009Payload - Signed maximum authorization.
 * @param context - Facilitator extension context.
 * @param store - Pending settlement store.
 * @returns Settlement response including the actual amount.
 */
export async function settleUptoEIP3009(
  signer: FacilitatorEvmSigner,
  payload: PaymentPayload,
  requirements: PaymentRequirements,
  eip3009Payload: UptoEIP3009Payload,
  context: FacilitatorContext | undefined,
  store: PendingSettlementStore,
): Promise<SettleResponse> {
  const payer =
    typeof eip3009Payload?.authorization?.from === "string"
      ? eip3009Payload.authorization.from
      : "";
  if (typeof eip3009Payload?.signature !== "string") {
    return {
      success: false,
      network: payload.accepted.network,
      transaction: "",
      errorReason: Errors.ErrUptoInvalidPayload,
      payer,
    };
  }

  let actualAmount: bigint;
  try {
    actualAmount = parseUint256(requirements.amount);
  } catch {
    return {
      success: false,
      network: payload.accepted.network,
      transaction: "",
      errorReason: Errors.ErrUptoInvalidPayload,
      payer,
    };
  }
  const pendingKey = eip3009Payload.signature;
  let fingerprint: UptoEIP3009PendingFingerprint;
  try {
    fingerprint = buildPendingFingerprint(eip3009Payload, requirements, payload.accepted.network);
  } catch {
    return {
      success: false,
      network: payload.accepted.network,
      transaction: "",
      errorReason: Errors.ErrUptoInvalidPayload,
      payer,
    };
  }

  let cachedValue: string | undefined;
  try {
    cachedValue = await store.get(pendingKey);
  } catch (error) {
    return {
      success: false,
      network: payload.accepted.network,
      transaction: "",
      errorReason: Errors.ErrUptoTransactionFailed,
      errorMessage: truncateErrorMessage(
        `failed to read pending settlement: ${
          error instanceof Error ? error.message : String(error)
        }`,
      ),
      payer,
    };
  }
  if (cachedValue !== undefined) {
    const record = parsePendingRecord(cachedValue);
    if (!record || !pendingFingerprintMatches(record, fingerprint)) {
      return {
        success: false,
        network: record?.network ?? payload.accepted.network,
        transaction: record?.txHash ?? "",
        errorReason: Errors.ErrUptoPendingMismatch,
        payer: record?.payer ?? payer,
      };
    }

    const result = await waitAndReturnSettleResponse(
      signer,
      record.txHash,
      record.network,
      record.payer,
      {
        failedStatusReason: Errors.ErrUptoTransactionFailed,
        amount: record.amount,
      },
    );
    if (!result.success && result.errorReason === ErrSettlementPending) {
      return result;
    }
    await deletePendingSettlement(store, pendingKey);
    return result;
  }

  const verifyRequirements = {
    ...requirements,
    amount: eip3009Payload.authorization.value,
  };
  const valid = await verifyUptoEIP3009(signer, payload, verifyRequirements, eip3009Payload, {
    simulate: false,
  });
  if (!valid.isValid) {
    return {
      success: false,
      network: payload.accepted.network,
      transaction: "",
      errorReason: valid.invalidReason ?? Errors.ErrUptoInvalidScheme,
      payer,
    };
  }

  if (actualAmount > parseUint256(eip3009Payload.authorization.value)) {
    return {
      success: false,
      network: payload.accepted.network,
      transaction: "",
      errorReason: Errors.ErrUptoSettlementExceedsAmount,
      payer,
    };
  }
  if (actualAmount === 0n) {
    return {
      success: true,
      network: payload.accepted.network,
      transaction: "",
      payer,
      amount: "0",
    };
  }

  const settler = getAddress(eip3009Payload.paymentInfo.settler);
  try {
    await signer.readContract({
      address: x402UptoErc3009ProxyAddress,
      abi: x402UptoErc3009ProxyABI,
      functionName: "settle",
      args: buildUptoEIP3009SettleArgs(requirements, eip3009Payload),
      account: settler,
    });
  } catch {
    return {
      success: false,
      network: payload.accepted.network,
      transaction: "",
      errorReason: Errors.ErrUptoEip3009SimulationFailed,
      payer,
    };
  }

  const dataSuffix = await resolveDataSuffix(context, {
    paymentPayload: payload,
    paymentRequirements: requirements,
  });

  const settleWrite = {
    address: x402UptoErc3009ProxyAddress,
    abi: x402UptoErc3009ProxyABI,
    functionName: "settle",
    args: buildUptoEIP3009SettleArgs(requirements, eip3009Payload),
    dataSuffix,
  } as const;
  const signerAddresses = signer.getAddresses().map(address => getAddress(address));
  if (
    !signer.writeContractFrom &&
    (signerAddresses.length !== 1 || signerAddresses[0] !== settler)
  ) {
    return {
      success: false,
      network: payload.accepted.network,
      transaction: "",
      errorReason: Errors.ErrUptoEip3009SettlerMismatch,
      payer,
    };
  }

  let tx: `0x${string}`;
  try {
    tx = signer.writeContractFrom
      ? await signer.writeContractFrom(settler, settleWrite)
      : await signer.writeContract(settleWrite);
  } catch (error) {
    return {
      success: false,
      network: payload.accepted.network,
      transaction: "",
      errorReason: Errors.ErrUptoTransactionFailed,
      errorMessage: error instanceof Error ? error.message : String(error),
      payer,
    };
  }

  const pendingRecord: UptoEIP3009PendingRecord = {
    ...fingerprint,
    txHash: tx,
  };
  let persistenceError: unknown;
  try {
    await store.set(pendingKey, JSON.stringify(pendingRecord));
  } catch (error) {
    persistenceError = error;
  }

  const result = await waitAndReturnSettleResponse(signer, tx, fingerprint.network, payer, {
    failedStatusReason: Errors.ErrUptoTransactionFailed,
    amount: fingerprint.amount,
  });
  if (!result.success && result.errorReason === ErrSettlementPending) {
    if (persistenceError) {
      return {
        ...result,
        errorReason: Errors.ErrUptoTransactionFailed,
        errorMessage: truncateErrorMessage(
          `settlement_pending, but failed to persist for retry; manual reconciliation required: ${
            persistenceError instanceof Error ? persistenceError.message : String(persistenceError)
          }`,
        ),
        amount: fingerprint.amount,
      };
    }
    return result;
  }
  await deletePendingSettlement(store, pendingKey);
  return result;
}
