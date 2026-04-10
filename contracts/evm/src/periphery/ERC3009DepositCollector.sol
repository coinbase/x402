// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IDepositCollector} from "../interfaces/IDepositCollector.sol";
import {DepositCollector} from "./DepositCollector.sol";
import {IERC3009} from "../interfaces/IERC3009.sol";

/// @title ERC3009DepositCollector
/// @notice Deposit collector that uses ERC-3009 receiveWithAuthorization for gasless token collection.
/// @dev ERC-3009 requires msg.sender == to, so this collector receives tokens first, then forwards
///      them to the settlement contract (msg.sender). This incurs an extra transfer (~30k gas overhead).
contract ERC3009DepositCollector is DepositCollector {
    using SafeERC20 for IERC20;

    constructor(
        address _settlement
    ) DepositCollector(_settlement) {}

    /// @inheritdoc IDepositCollector
    function collect(
        address payer,
        address token,
        uint256 amount,
        bytes32,
        address,
        bytes calldata collectorData
    ) external override onlySettlement {
        (uint256 validAfter, uint256 validBefore, bytes32 nonce, bytes memory signature) =
            abi.decode(collectorData, (uint256, uint256, bytes32, bytes));

        IERC3009(token).receiveWithAuthorization(
            payer, address(this), amount, validAfter, validBefore, nonce, signature
        );

        IERC20(token).safeTransfer(msg.sender, amount);
    }
}
