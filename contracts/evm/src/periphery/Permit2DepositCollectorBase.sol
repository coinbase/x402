// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IDepositCollector} from "../interfaces/IDepositCollector.sol";
import {ISignatureTransfer} from "../interfaces/ISignatureTransfer.sol";

/// @title Permit2DepositCollectorBase
/// @notice Abstract base for deposit collectors that use Permit2 permitWitnessTransferFrom.
/// @dev Shared witness type constants and Permit2 transfer logic for DRY across
///      Permit2DepositCollector and Permit2WithERC2612DepositCollector.
abstract contract Permit2DepositCollectorBase is IDepositCollector {
    ISignatureTransfer public immutable PERMIT2;

    string public constant DEPOSIT_WITNESS_TYPE_STRING =
        "DepositWitness witness)TokenPermissions(address token,uint256 amount)DepositWitness(bytes32 channelId)";

    bytes32 public constant DEPOSIT_WITNESS_TYPEHASH = keccak256("DepositWitness(bytes32 channelId)");

    error InvalidPermit2Address();

    constructor(
        address _permit2
    ) {
        if (_permit2 == address(0)) revert InvalidPermit2Address();
        PERMIT2 = ISignatureTransfer(_permit2);
    }

    /// @dev Execute a Permit2 witness transfer from payer directly to recipient.
    function _executePermit2Transfer(
        address payer,
        address recipient,
        uint256 amount,
        bytes32 channelId,
        ISignatureTransfer.PermitTransferFrom memory permit,
        bytes memory signature
    ) internal {
        bytes32 witnessHash = keccak256(abi.encode(DEPOSIT_WITNESS_TYPEHASH, channelId));

        PERMIT2.permitWitnessTransferFrom(
            permit,
            ISignatureTransfer.SignatureTransferDetails({to: recipient, requestedAmount: amount}),
            payer,
            witnessHash,
            DEPOSIT_WITNESS_TYPE_STRING,
            signature
        );
    }
}
