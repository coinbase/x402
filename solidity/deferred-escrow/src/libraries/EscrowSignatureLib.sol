// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {SignatureChecker} from "../../lib/openzeppelin-contracts/contracts/utils/cryptography/SignatureChecker.sol";
import {IDeferredPaymentEscrow} from "../IDeferredPaymentEscrow.sol";

/**
 * @title EscrowSignatureLib
 * @notice Library for escrow-related signature validation using EIP-712
 */
library EscrowSignatureLib {
    /// @notice EIP-712 type hash for voucher structure
    bytes32 public constant VOUCHER_TYPEHASH = keccak256(
        "Voucher(bytes32 id,address buyer,address seller,uint256 valueAggregate,address asset,uint64 timestamp,uint256 nonce,address escrow,uint256 chainId,uint64 expiry)"
    );

    /// @notice EIP-712 type hash for deposit authorization
    bytes32 public constant DEPOSIT_AUTHORIZATION_TYPEHASH = keccak256(
        "DepositAuthorization(address buyer,address seller,address asset,uint256 amount,bytes32 nonce,uint64 expiry)"
    );

    /// @notice EIP-712 type hash for flush authorization
    bytes32 public constant FLUSH_AUTHORIZATION_TYPEHASH =
        keccak256("FlushAuthorization(address buyer,address seller,address asset,bytes32 nonce,uint64 expiry)");

    /// @notice EIP-712 type hash for flush all authorization
    bytes32 public constant FLUSH_ALL_AUTHORIZATION_TYPEHASH =
        keccak256("FlushAllAuthorization(address buyer,bytes32 nonce,uint64 expiry)");

    /**
     * @notice Validate voucher signature
     * @param voucher The voucher to validate
     * @param signature The signature to validate
     * @param domainSeparator The EIP-712 domain separator
     * @return True if signature is valid
     */
    function isVoucherSignatureValid(
        IDeferredPaymentEscrow.Voucher calldata voucher,
        bytes calldata signature,
        bytes32 domainSeparator
    ) external view returns (bool) {
        bytes32 structHash = keccak256(
            abi.encode(
                VOUCHER_TYPEHASH,
                voucher.id,
                voucher.buyer,
                voucher.seller,
                voucher.valueAggregate,
                voucher.asset,
                voucher.timestamp,
                voucher.nonce,
                voucher.escrow,
                voucher.chainId,
                voucher.expiry
            )
        );

        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));

        // Use OpenZeppelin's SignatureChecker for both EOA and ERC-1271
        return SignatureChecker.isValidSignatureNow(voucher.buyer, digest, signature);
    }

    /**
     * @notice Validate deposit authorization signature
     * @param auth The deposit authorization to validate
     * @param signature The signature to validate
     * @param domainSeparator The EIP-712 domain separator
     * @return True if signature is valid
     */
    function isDepositAuthorizationValid(
        IDeferredPaymentEscrow.DepositAuthorization calldata auth,
        bytes calldata signature,
        bytes32 domainSeparator
    ) external view returns (bool) {
        bytes32 structHash = keccak256(
            abi.encode(
                DEPOSIT_AUTHORIZATION_TYPEHASH,
                auth.buyer,
                auth.seller,
                auth.asset,
                auth.amount,
                auth.nonce,
                auth.expiry
            )
        );

        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));

        // Use OpenZeppelin's SignatureChecker for both EOA and ERC-1271
        return SignatureChecker.isValidSignatureNow(auth.buyer, digest, signature);
    }

    /**
     * @notice Validate flush authorization signature
     * @param auth The flush authorization to validate
     * @param signature The signature to validate
     * @param domainSeparator The EIP-712 domain separator
     * @return True if signature is valid
     */
    function isFlushAuthorizationValid(
        IDeferredPaymentEscrow.FlushAuthorization calldata auth,
        bytes calldata signature,
        bytes32 domainSeparator
    ) external view returns (bool) {
        bytes32 structHash = keccak256(
            abi.encode(FLUSH_AUTHORIZATION_TYPEHASH, auth.buyer, auth.seller, auth.asset, auth.nonce, auth.expiry)
        );

        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));

        // Use OpenZeppelin's SignatureChecker for both EOA and ERC-1271
        return SignatureChecker.isValidSignatureNow(auth.buyer, digest, signature);
    }

    /**
     * @notice Validate flush all authorization signature
     * @param auth The flush all authorization to validate
     * @param signature The signature to validate
     * @param domainSeparator The EIP-712 domain separator
     * @return True if signature is valid
     */
    function isFlushAllAuthorizationValid(
        IDeferredPaymentEscrow.FlushAllAuthorization calldata auth,
        bytes calldata signature,
        bytes32 domainSeparator
    ) external view returns (bool) {
        bytes32 structHash =
            keccak256(abi.encode(FLUSH_ALL_AUTHORIZATION_TYPEHASH, auth.buyer, auth.nonce, auth.expiry));

        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));

        // Use OpenZeppelin's SignatureChecker for both EOA and ERC-1271
        return SignatureChecker.isValidSignatureNow(auth.buyer, digest, signature);
    }
}
