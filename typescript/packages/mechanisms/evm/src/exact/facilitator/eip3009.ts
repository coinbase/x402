import {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";
import {
  encodeFunctionData,
  getAddress,
  Hex,
  isAddressEqual,
  parseErc6492Signature,
  parseSignature,
} from "viem";
import { authorizationTypes, eip3009ABI } from "../../constants";
import { multicall, ContractCall, RawContractCall } from "../../multicall";
import { FacilitatorEvmSigner } from "../../signer";
import { getEvmChainId } from "../../utils";
import { ExactEIP3009Payload } from "../../types";
import * as Errors from "./errors";

export interface VerifyEIP3009Options {
  /** Run onchain simulation. Defaults to true. */
  simulate?: boolean;
}

export interface EIP3009FacilitatorConfig {
  /**
   * If enabled, the facilitator will deploy ERC-4337 smart wallets
   * via EIP-6492 when encountering undeployed contract signatures.
   *
   * @default false
   */
  deployERC4337WithEIP6492: boolean;
  /**
   * If enabled, simulates transaction before settling. Defaults to false, ie only simulate during verify.
   *
   * @default false
   */
  simulateInSettle?: boolean;
}

/**
 * Verifies an EIP-3009 payment payload.
 *
 * @param signer - The facilitator signer for contract reads
 * @param payload - The payment payload to verify
 * @param requirements - The payment requirements
 * @param eip3009Payload - The EIP-3009 specific payload
 * @param options - Optional verification options
 * @returns Promise resolving to verification response
 */
export async function verifyEIP3009(
  signer: FacilitatorEvmSigner,
  payload: PaymentPayload,
  requirements: PaymentRequirements,
  eip3009Payload: ExactEIP3009Payload,
  options?: VerifyEIP3009Options,
): Promise<VerifyResponse> {
  const payer = eip3009Payload.authorization.from;
  let eip6492Deployment: { factoryAddress: string; factoryCalldata: string } | undefined;

  // Verify scheme matches
  if (payload.accepted.scheme !== "exact" || requirements.scheme !== "exact") {
    return {
      isValid: false,
      invalidReason: Errors.ErrInvalidScheme,
      payer,
    };
  }

  // Get chain configuration
  if (!requirements.extra?.name || !requirements.extra?.version) {
    return {
      isValid: false,
      invalidReason: Errors.ErrMissingEip712Domain,
      payer,
    };
  }

  const { name, version } = requirements.extra;
  const erc20Address = getAddress(requirements.asset);

  // Verify network matches
  if (payload.accepted.network !== requirements.network) {
    return {
      isValid: false,
      invalidReason: Errors.ErrNetworkMismatch,
      payer,
    };
  }

  // Build typed data for signature verification
  const permitTypedData = {
    types: authorizationTypes,
    primaryType: "TransferWithAuthorization" as const,
    domain: {
      name,
      version,
      chainId: getEvmChainId(requirements.network),
      verifyingContract: erc20Address,
    },
    message: {
      from: eip3009Payload.authorization.from,
      to: eip3009Payload.authorization.to,
      value: BigInt(eip3009Payload.authorization.value),
      validAfter: BigInt(eip3009Payload.authorization.validAfter),
      validBefore: BigInt(eip3009Payload.authorization.validBefore),
      nonce: eip3009Payload.authorization.nonce,
    },
  };

  // Verify signature
  // Note: verifyTypedData is implementation-dependent and pluggable on FacilitatorEvmSigner
  // Some implementations only do EOA-style ECDSA recovery (e.g. viem/utils verifyTypedData, ethers.verifyTypedData)
  // Viem's publicClient.verifyTypedData supports EOA and Smart Contract Account (ERC-1271 / ERC-6492) signature verification
  let isValid = false;
  try {
    isValid = await signer.verifyTypedData({
      address: eip3009Payload.authorization.from,
      ...permitTypedData,
      signature: eip3009Payload.signature!,
    });
  } catch {
    isValid = false;
  }
  const signature = eip3009Payload.signature!;
  const sigLen = signature.startsWith("0x") ? signature.length - 2 : signature.length;

  // Extract EIP-6492 deployment info (factory address + calldata) if present
  const erc6492Data = parseErc6492Signature(signature);
  const hasDeploymentInfo =
    erc6492Data.address &&
    erc6492Data.data &&
    !isAddressEqual(erc6492Data.address, "0x0000000000000000000000000000000000000000");

  if (hasDeploymentInfo) {
    eip6492Deployment = {
      factoryAddress: erc6492Data.address!,
      factoryCalldata: erc6492Data.data!,
    };
  }

  if (!isValid) {
    // Check if signature is from a smart wallet
    const isSmartWallet = sigLen > 130; // 65 bytes = 130 hex chars for EOA

    // EOA signature that failed verification — definitely invalid
    if (!isSmartWallet) {
      return {
        isValid: false,
        invalidReason: Errors.ErrInvalidSignature,
        payer,
      };
    }

    // Smart wallet signature: check if deployed or has ERC-6492 deployment info
    const bytecode = await signer.getCode({ address: payer });
    const isDeployed = bytecode && bytecode !== "0x";

    if (!isDeployed && !hasDeploymentInfo) {
      // Undeployed smart wallet with no factory info
      return {
        isValid: false,
        invalidReason: Errors.ErrUndeployedSmartWallet,
        payer,
      };
    }
    // Deployed smart wallet or undeployed with ERC-6492 factory info
    // fall through to remaining field checks and onchain simulation
  }

  // Verify payment recipient matches
  if (getAddress(eip3009Payload.authorization.to) !== getAddress(requirements.payTo)) {
    return {
      isValid: false,
      invalidReason: Errors.ErrRecipientMismatch,
      payer,
    };
  }

  // Verify validBefore is in the future (with 6 second buffer for block time)
  const now = Math.floor(Date.now() / 1000);
  if (BigInt(eip3009Payload.authorization.validBefore) < BigInt(now + 6)) {
    return {
      isValid: false,
      invalidReason: Errors.ErrValidBeforeExpired,
      payer,
    };
  }

  // Verify validAfter is not in the future
  if (BigInt(eip3009Payload.authorization.validAfter) > BigInt(now)) {
    return {
      isValid: false,
      invalidReason: Errors.ErrValidAfterInFuture,
      payer,
    };
  }

  // Verify amount exactly matches requirements
  if (BigInt(eip3009Payload.authorization.value) !== BigInt(requirements.amount)) {
    return {
      isValid: false,
      invalidReason: Errors.ErrInvalidAuthorizationValue,
      payer,
    };
  }

  // Transaction simulation
  if (options?.simulate !== false) {
    const auth = eip3009Payload.authorization;
    const transferArgs = [
      getAddress(auth.from),
      getAddress(auth.to),
      BigInt(auth.value),
      BigInt(auth.validAfter),
      BigInt(auth.validBefore),
      auth.nonce,
    ] as const;

    let simulationFailed = false;

    if (eip6492Deployment) {
      // Undeployed EIP-6492: simulate via multicall (deploy + transfer in one eth_call)
      const { signature: innerSignature } = parseErc6492Signature(eip3009Payload.signature!);
      const transferCalldata = encodeFunctionData({
        abi: eip3009ABI,
        functionName: "transferWithAuthorization",
        args: [...transferArgs, innerSignature],
      });

      const results = await multicall(signer.readContract.bind(signer), [
        {
          address: getAddress(eip6492Deployment.factoryAddress),
          callData: eip6492Deployment.factoryCalldata as Hex,
        } satisfies RawContractCall,
        {
          address: erc20Address,
          callData: transferCalldata,
        } satisfies RawContractCall,
      ]);

      // If the transfer call fails, the simulation failed
      // Smart wallet deployment might succeed even if the inner signature is invalid, but the transfer will fail
      if (results[1]?.status !== "success") {
        simulationFailed = true;
      }
    } else {
      // EOA or deployed smart wallet
      const sig = eip3009Payload.signature!;
      const sigLength = sig.startsWith("0x") ? sig.length - 2 : sig.length;
      const isECDSA = sigLength === 130;

      try {
        if (isECDSA) {
          const parsedSig = parseSignature(sig);
          await signer.readContract({
            address: erc20Address,
            abi: eip3009ABI,
            functionName: "transferWithAuthorization",
            args: [
              ...transferArgs,
              (parsedSig.v as number | undefined) ?? parsedSig.yParity,
              parsedSig.r,
              parsedSig.s,
            ],
          });
        } else {
          await signer.readContract({
            address: erc20Address,
            abi: eip3009ABI,
            functionName: "transferWithAuthorization",
            args: [...transferArgs, sig],
          });
        }
      } catch {
        simulationFailed = true;
      }
    }

    if (simulationFailed) {
      return diagnoseSimulationFailure(signer, erc20Address, eip3009Payload, requirements);
    }
  }

  return {
    isValid: true,
    invalidReason: undefined,
    payer,
  };
}

/**
 * After simulation fails, runs a single diagnostic multicall to determine the most specific error reason.
 * Checks balanceOf, name, version and authorizationState in one RPC round-trip.
 *
 * @param signer - EVM signer used for the payment
 * @param erc20Address - Address of the ERC-20 token contract
 * @param eip3009Payload - The EIP-3009 transfer authorization payload
 * @param requirements - Payment requirements to validate against
 * @returns A promise that resolves to the verification result with validity and optional invalid reason
 */
async function diagnoseSimulationFailure(
  signer: FacilitatorEvmSigner,
  erc20Address: `0x${string}`,
  eip3009Payload: ExactEIP3009Payload,
  requirements: PaymentRequirements,
): Promise<VerifyResponse> {
  const payer = eip3009Payload.authorization.from;

  const diagnosticCalls: ContractCall[] = [
    {
      address: erc20Address,
      abi: eip3009ABI,
      functionName: "balanceOf",
      args: [eip3009Payload.authorization.from],
    },
    {
      address: erc20Address,
      abi: eip3009ABI,
      functionName: "name",
    },
    {
      address: erc20Address,
      abi: eip3009ABI,
      functionName: "version",
    },
    {
      address: erc20Address,
      abi: eip3009ABI,
      functionName: "authorizationState",
      args: [eip3009Payload.authorization.from, eip3009Payload.authorization.nonce],
    },
  ];

  try {
    const results = await multicall(signer.readContract.bind(signer), diagnosticCalls);

    const [balanceResult, nameResult, versionResult, authStateResult] = results;

    // authorizationState reverted -> token doesn't support EIP-3009
    if (authStateResult.status === "failure") {
      return { isValid: false, invalidReason: Errors.ErrEip3009NotSupported, payer };
    }

    // authorizationState == true -> nonce already used
    if (authStateResult.status === "success" && authStateResult.result === true) {
      return { isValid: false, invalidReason: Errors.ErrEip3009NonceAlreadyUsed, payer };
    }

    // name mismatch
    if (
      nameResult.status === "success" &&
      requirements.extra?.name &&
      nameResult.result !== requirements.extra.name
    ) {
      return { isValid: false, invalidReason: Errors.ErrEip3009TokenNameMismatch, payer };
    }

    // version mismatch
    if (
      versionResult.status === "success" &&
      requirements.extra?.version &&
      versionResult.result !== requirements.extra.version
    ) {
      return { isValid: false, invalidReason: Errors.ErrEip3009TokenVersionMismatch, payer };
    }

    // insufficient balance
    if (balanceResult.status === "success") {
      const balance = balanceResult.result as bigint;
      if (balance < BigInt(requirements.amount)) {
        return { isValid: false, invalidReason: Errors.ErrEip3009InsufficientBalance, payer };
      }
    }
  } catch {
    // Diagnostic multicall failed — fall through to generic error
  }

  return { isValid: false, invalidReason: Errors.ErrEip3009SimulationFailed, payer };
}

/**
 * Settles an EIP-3009 payment by executing transferWithAuthorization.
 *
 * @param signer - The facilitator signer for contract writes
 * @param payload - The payment payload to settle
 * @param requirements - The payment requirements
 * @param eip3009Payload - The EIP-3009 specific payload
 * @param config - Facilitator configuration
 * @returns Promise resolving to settlement response
 */
export async function settleEIP3009(
  signer: FacilitatorEvmSigner,
  payload: PaymentPayload,
  requirements: PaymentRequirements,
  eip3009Payload: ExactEIP3009Payload,
  config: EIP3009FacilitatorConfig,
): Promise<SettleResponse> {
  const payer = eip3009Payload.authorization.from;

  // Re-verify before settling
  const valid = await verifyEIP3009(signer, payload, requirements, eip3009Payload, {
    simulate: config.simulateInSettle ?? false,
  });
  if (!valid.isValid) {
    return {
      success: false,
      network: payload.accepted.network,
      transaction: "",
      errorReason: valid.invalidReason ?? Errors.ErrInvalidScheme,
      payer,
    };
  }

  try {
    // Parse ERC-6492 signature if applicable
    const parseResult = parseErc6492Signature(eip3009Payload.signature!);
    const { signature, address: factoryAddress, data: factoryCalldata } = parseResult;

    // Deploy ERC-4337 smart wallet via EIP-6492 if configured and needed
    if (
      config.deployERC4337WithEIP6492 &&
      factoryAddress &&
      factoryCalldata &&
      !isAddressEqual(factoryAddress, "0x0000000000000000000000000000000000000000")
    ) {
      // Check if smart wallet is already deployed
      const bytecode = await signer.getCode({ address: payer });

      if (!bytecode || bytecode === "0x") {
        // Wallet not deployed - attempt deployment
        const deployTx = await signer.sendTransaction({
          to: factoryAddress as Hex,
          data: factoryCalldata as Hex,
        });

        // Wait for deployment transaction
        await signer.waitForTransactionReceipt({ hash: deployTx });
      }
    }

    // Determine if this is an ECDSA signature (EOA) or smart wallet signature
    const signatureLength = signature.startsWith("0x") ? signature.length - 2 : signature.length;
    const isECDSA = signatureLength === 130;

    let tx: Hex;
    if (isECDSA) {
      // For EOA wallets, parse signature into v, r, s and use that overload
      const parsedSig = parseSignature(signature);

      tx = await signer.writeContract({
        address: getAddress(requirements.asset),
        abi: eip3009ABI,
        functionName: "transferWithAuthorization",
        args: [
          getAddress(eip3009Payload.authorization.from),
          getAddress(eip3009Payload.authorization.to),
          BigInt(eip3009Payload.authorization.value),
          BigInt(eip3009Payload.authorization.validAfter),
          BigInt(eip3009Payload.authorization.validBefore),
          eip3009Payload.authorization.nonce,
          (parsedSig.v as number | undefined) || parsedSig.yParity,
          parsedSig.r,
          parsedSig.s,
        ],
      });
    } else {
      // For smart wallets, use the bytes signature overload
      tx = await signer.writeContract({
        address: getAddress(requirements.asset),
        abi: eip3009ABI,
        functionName: "transferWithAuthorization",
        args: [
          getAddress(eip3009Payload.authorization.from),
          getAddress(eip3009Payload.authorization.to),
          BigInt(eip3009Payload.authorization.value),
          BigInt(eip3009Payload.authorization.validAfter),
          BigInt(eip3009Payload.authorization.validBefore),
          eip3009Payload.authorization.nonce,
          signature,
        ],
      });
    }

    // Wait for transaction confirmation
    const receipt = await signer.waitForTransactionReceipt({ hash: tx });

    if (receipt.status !== "success") {
      return {
        success: false,
        errorReason: Errors.ErrTransactionFailed,
        transaction: tx,
        network: payload.accepted.network,
        payer,
      };
    }

    return {
      success: true,
      transaction: tx,
      network: payload.accepted.network,
      payer,
    };
  } catch {
    return {
      success: false,
      errorReason: Errors.ErrTransactionFailed,
      transaction: "",
      network: payload.accepted.network,
      payer,
    };
  }
}
