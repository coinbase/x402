import { Address, Chain, getAddress, Hex, LocalAccount, Transport } from "viem";
import {
  typedDataTypes,
  isAccount,
  isSignerWallet,
  SignerWallet,
  deferredVoucherPrimaryType,
  createConnectedClient,
  permitPrimaryType,
  depositAuthorizationPrimaryType,
  flushAuthorizationPrimaryType,
  flushAllAuthorizationPrimaryType,
} from "../../../types/shared/evm";
import {
  DeferredEscrowDepositAuthorizationInner,
  DeferredEscrowDepositAuthorizationPermit,
  DeferredEscrowFlushAuthorization,
  DeferredEvmPayloadVoucher,
} from "../../../types/verify/schemes/deferred";
import { getNetworkName } from "../../../shared";

/**
 * Signs a voucher
 *
 * @param walletClient - The wallet client that will sign the authorization
 * @param voucher - The voucher to sign
 * @returns The signature for the authorization
 */
export async function signVoucher<transport extends Transport, chain extends Chain>(
  walletClient: SignerWallet<chain, transport> | LocalAccount,
  voucher: DeferredEvmPayloadVoucher,
): Promise<{ signature: Hex }> {
  const { id, buyer, seller, valueAggregate, asset, timestamp, nonce, escrow, chainId, expiry } =
    voucher;
  const data = {
    types: typedDataTypes,
    primaryType: deferredVoucherPrimaryType,
    domain: {
      name: "DeferredPaymentEscrow",
      version: "1",
      chainId,
      verifyingContract: getAddress(escrow),
    },
    message: {
      id: id.toLowerCase(),
      buyer: getAddress(buyer),
      seller: getAddress(seller),
      valueAggregate,
      asset: getAddress(asset),
      timestamp,
      nonce,
      escrow: getAddress(escrow),
      chainId,
      expiry,
    },
  };

  if (isSignerWallet(walletClient)) {
    const signature = await walletClient.signTypedData(data);
    return {
      signature,
    };
  } else if (isAccount(walletClient) && walletClient.signTypedData) {
    const signature = await walletClient.signTypedData(data);
    return {
      signature,
    };
  } else {
    throw new Error("Invalid wallet client provided does not support signTypedData");
  }
}

/**
 * Verifies a voucher signature
 *
 * @param voucher - The voucher to verify
 * @param signature - The signature to verify
 * @param signer - The address of the signer to verify
 * @returns The address that signed the voucher
 */
export async function verifyVoucherSignature(
  voucher: DeferredEvmPayloadVoucher,
  signature: Hex,
  signer: Address,
) {
  const voucherTypedData = {
    types: typedDataTypes,
    primaryType: deferredVoucherPrimaryType,
    domain: {
      name: "DeferredPaymentEscrow",
      version: "1",
      chainId: voucher.chainId,
      verifyingContract: getAddress(voucher.escrow),
    },
    message: voucher,
  };

  const client = createConnectedClient(getNetworkName(voucher.chainId));
  return await client.verifyTypedData({
    address: signer,
    ...voucherTypedData,
    signature: signature as Hex,
  });
}

/**
 * Signs an EIP-2612 permit
 *
 * Note that the permit input object is not the actual EIP-712 signed message. It contains additional fields.
 *
 * @param walletClient - The wallet client that will sign the authorization
 * @param permit - The permit to sign
 * @param chainId - The chain ID
 * @param asset - The address of the asset
 * @returns The signature for the permit
 */
export async function signPermit<transport extends Transport, chain extends Chain>(
  walletClient: SignerWallet<chain, transport> | LocalAccount,
  permit: DeferredEscrowDepositAuthorizationPermit,
  chainId: number,
  asset: Address,
): Promise<{ signature: Hex }> {
  const { domain, owner, spender, value, nonce, deadline } = permit;
  const data = {
    types: typedDataTypes,
    primaryType: permitPrimaryType,
    domain: {
      name: domain.name,
      version: domain.version,
      chainId: chainId,
      verifyingContract: getAddress(asset),
    },
    message: {
      owner: getAddress(owner),
      spender: getAddress(spender),
      value,
      nonce,
      deadline,
    },
  };

  if (isSignerWallet(walletClient)) {
    const signature = await walletClient.signTypedData(data);
    return {
      signature,
    };
  } else if (isAccount(walletClient) && walletClient.signTypedData) {
    const signature = await walletClient.signTypedData(data);
    return {
      signature,
    };
  } else {
    throw new Error("Invalid wallet client provided does not support signTypedData");
  }
}

/**
 * Verifies a permit signature
 *
 * Note that the permit input object is not the actual EIP-712 signed message. It contains additional fields.
 *
 * @param permit - The permit to verify
 * @param signature - The signature to verify
 * @param signer - The address of the signer to verify
 * @param chainId - The chain ID
 * @param asset - The address of the asset
 * @returns The address that signed the voucher
 */
export async function verifyPermitSignature(
  permit: DeferredEscrowDepositAuthorizationPermit,
  signature: Hex,
  signer: Address,
  chainId: number,
  asset: Address,
) {
  const { domain, ...eip712Permit } = permit;
  const permitTypedData = {
    types: typedDataTypes,
    primaryType: permitPrimaryType,
    domain: {
      name: domain.name,
      version: domain.version,
      chainId: chainId,
      verifyingContract: getAddress(asset),
    },
    message: eip712Permit,
  };

  const client = createConnectedClient(getNetworkName(chainId));
  return await client.verifyTypedData({
    address: signer,
    ...permitTypedData,
    signature: signature as Hex,
  });
}

/**
 * Signs a deferred escrow deposit authorization
 *
 * @param walletClient - The wallet client that will sign the authorization
 * @param depositAuthorization - The deposit authorization to sign
 * @param chainId - The chain ID
 * @param escrow - The address of the escrow contract
 * @returns The signature for the permit
 */
export async function signDepositAuthorizationInner<
  transport extends Transport,
  chain extends Chain,
>(
  walletClient: SignerWallet<chain, transport> | LocalAccount,
  depositAuthorization: DeferredEscrowDepositAuthorizationInner,
  chainId: number,
  escrow: Address,
): Promise<{ signature: Hex }> {
  const { buyer, seller, asset, amount, nonce, expiry } = depositAuthorization;
  const data = {
    types: typedDataTypes,
    primaryType: depositAuthorizationPrimaryType,
    domain: {
      name: "DeferredPaymentEscrow",
      version: "1",
      chainId: chainId,
      verifyingContract: getAddress(escrow),
    },
    message: {
      buyer: getAddress(buyer),
      seller: getAddress(seller),
      asset: getAddress(asset),
      amount,
      nonce,
      expiry,
    },
  };

  if (isSignerWallet(walletClient)) {
    const signature = await walletClient.signTypedData(data);
    return {
      signature,
    };
  } else if (isAccount(walletClient) && walletClient.signTypedData) {
    const signature = await walletClient.signTypedData(data);
    return {
      signature,
    };
  } else {
    throw new Error("Invalid wallet client provided does not support signTypedData");
  }
}

/**
 * Verifies a deposit authorization signature
 *
 * @param depositAuthorization - The deposit authorization to verify
 * @param signature - The signature to verify
 * @param signer - The address of the signer to verify
 * @param chainId - The chain ID
 * @param escrow - The address of the escrow contract
 * @returns The address that signed the voucher
 */
export async function verifyDepositAuthorizationInnerSignature(
  depositAuthorization: DeferredEscrowDepositAuthorizationInner,
  signature: Hex,
  signer: Address,
  chainId: number,
  escrow: Address,
) {
  const depositAuthorizationTypedData = {
    types: typedDataTypes,
    primaryType: depositAuthorizationPrimaryType,
    domain: {
      name: "DeferredPaymentEscrow",
      version: "1",
      chainId: chainId,
      verifyingContract: getAddress(escrow),
    },
    message: {
      buyer: getAddress(depositAuthorization.buyer),
      seller: getAddress(depositAuthorization.seller),
      asset: getAddress(depositAuthorization.asset),
      amount: depositAuthorization.amount,
      nonce: depositAuthorization.nonce,
      expiry: depositAuthorization.expiry,
    },
  };

  const client = createConnectedClient(getNetworkName(chainId));
  return await client.verifyTypedData({
    address: signer,
    ...depositAuthorizationTypedData,
    signature: signature as Hex,
  });
}

/**
 * Signs a flush authorization
 *
 * The function will sign a FlushAuthorization or FlushAllAuthorization depending on the presence of a seller and asset in the message.
 *
 * @param walletClient - The wallet client that will sign the authorization
 * @param flushAuthorization - The flush authorization to sign
 * @param chainId - The chain ID
 * @param escrow - The address of the escrow contract
 * @returns The signature for the authorization
 */
export async function signFlushAuthorization<transport extends Transport, chain extends Chain>(
  walletClient: SignerWallet<chain, transport> | LocalAccount,
  flushAuthorization: DeferredEscrowFlushAuthorization,
  chainId: number,
  escrow: Address,
): Promise<{ signature: Hex }> {
  const { buyer, seller, asset, nonce, expiry } = flushAuthorization;
  const flushAll = seller == undefined || asset == undefined;
  const primaryType = flushAll ? flushAllAuthorizationPrimaryType : flushAuthorizationPrimaryType;
  const data = {
    types: typedDataTypes,
    primaryType: primaryType,
    domain: {
      name: "DeferredPaymentEscrow",
      version: "1",
      chainId: chainId,
      verifyingContract: getAddress(escrow),
    },
    message: {
      buyer: getAddress(buyer),
      ...(flushAll
        ? {}
        : {
            seller: getAddress(seller),
            asset: getAddress(asset),
          }),
      nonce,
      expiry,
    },
  };

  if (isSignerWallet(walletClient)) {
    const signature = await walletClient.signTypedData(data);
    return {
      signature,
    };
  } else if (isAccount(walletClient) && walletClient.signTypedData) {
    const signature = await walletClient.signTypedData(data);
    return {
      signature,
    };
  } else {
    throw new Error("Invalid wallet client provided does not support signTypedData");
  }
}

/**
 * Verifies a flush authorization signature
 *
 * The function will verify a FlushAuthorization or FlushAllAuthorization depending on the presence of a seller and asset in the message.
 *
 * @param flushAuthorization - The flush authorization to verify
 * @param signature - The signature to verify
 * @param signer - The address of the signer to verify
 * @param chainId - The chain ID
 * @param escrow - The address of the escrow contract
 * @returns The address that signed the authorization
 */
export async function verifyFlushAuthorizationSignature(
  flushAuthorization: DeferredEscrowFlushAuthorization,
  signature: Hex,
  signer: Address,
  chainId: number,
  escrow: Address,
) {
  const { seller, asset } = flushAuthorization;
  const flushAll = seller == undefined || asset == undefined;
  const primaryType = flushAll ? flushAllAuthorizationPrimaryType : flushAuthorizationPrimaryType;
  const flushAuthorizationTypedData = {
    types: typedDataTypes,
    primaryType: primaryType,
    domain: {
      name: "DeferredPaymentEscrow",
      version: "1",
      chainId: chainId,
      verifyingContract: getAddress(escrow),
    },
    message: {
      buyer: getAddress(flushAuthorization.buyer),
      ...(flushAll
        ? {}
        : {
            seller: getAddress(seller),
            asset: getAddress(asset),
          }),
      nonce: flushAuthorization.nonce,
      expiry: flushAuthorization.expiry,
    },
  };

  const client = createConnectedClient(getNetworkName(chainId));
  return await client.verifyTypedData({
    address: signer,
    ...flushAuthorizationTypedData,
    signature: signature as Hex,
  });
}
