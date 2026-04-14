// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IDepositCollector} from "../interfaces/IDepositCollector.sol";
import {ISignatureTransfer} from "../interfaces/ISignatureTransfer.sol";
import {Permit2DepositCollectorBase} from "./Permit2DepositCollectorBase.sol";

/// @title Permit2DepositCollector
/// @notice Deposit collector that uses Permit2 permitWitnessTransferFrom with channelId witness binding.
/// @dev Tokens flow directly from payer to settlement via Permit2 (no intermediate hop).
///      The payer's Permit2 signature must name this collector as the spender.
///      `collectorData` is `abi.encode(nonce, deadline, signature)`; token and amount come from `collect`
///      and must match the signed PermitTransferFrom used when producing `signature`.
contract Permit2DepositCollector is Permit2DepositCollectorBase {
    constructor(address _settlement, address _permit2) Permit2DepositCollectorBase(_settlement, _permit2) {}

    /// @inheritdoc IDepositCollector
    function collect(
        address payer,
        address token,
        uint256 amount,
        bytes32 channelId,
        address,
        bytes calldata collectorData
    ) external override onlySettlement {
        (uint256 nonce, uint256 deadline, bytes memory signature) = abi.decode(collectorData, (uint256, uint256, bytes));

        ISignatureTransfer.PermitTransferFrom memory permit = ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({token: token, amount: amount}),
            nonce: nonce,
            deadline: deadline
        });

        _executePermit2Transfer(payer, amount, channelId, permit, signature);
    }
}
