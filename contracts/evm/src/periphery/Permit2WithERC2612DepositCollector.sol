// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";

import {IDepositCollector} from "../interfaces/IDepositCollector.sol";
import {ISignatureTransfer} from "../interfaces/ISignatureTransfer.sol";
import {Permit2DepositCollectorBase} from "./Permit2DepositCollectorBase.sol";

/// @title Permit2WithERC2612DepositCollector
/// @notice Deposit collector combining EIP-2612 permit (to approve Permit2) with Permit2 witness transfer.
/// @dev Enables a single-tx deposit for tokens that implement EIP-2612, without requiring the payer
///      to have previously approved Permit2. The EIP-2612 permit call is soft-fail (try/catch) so that
///      pre-existing approvals or replayed permits don't revert the entire deposit.
contract Permit2WithERC2612DepositCollector is Permit2DepositCollectorBase {
    struct EIP2612Permit {
        uint256 value;
        uint256 deadline;
        bytes32 r;
        bytes32 s;
        uint8 v;
    }

    error Permit2612AmountMismatch();

    event EIP2612PermitFailedWithReason(address indexed token, address indexed owner, string reason);
    event EIP2612PermitFailedWithPanic(address indexed token, address indexed owner, uint256 errorCode);
    event EIP2612PermitFailedWithData(address indexed token, address indexed owner, bytes data);

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
        (EIP2612Permit memory permit2612, ISignatureTransfer.PermitTransferFrom memory permit, bytes memory signature) =
            abi.decode(collectorData, (EIP2612Permit, ISignatureTransfer.PermitTransferFrom, bytes));

        _executeEIP2612Permit(token, payer, permit2612, permit.permitted.amount);

        _executePermit2Transfer(payer, amount, channelId, permit, signature);
    }

    function _executeEIP2612Permit(
        address token,
        address owner,
        EIP2612Permit memory permit2612,
        uint256 permittedAmount
    ) internal {
        if (permit2612.value != permittedAmount) {
            revert Permit2612AmountMismatch();
        }

        try IERC20Permit(token).permit(
            owner, address(PERMIT2), permit2612.value, permit2612.deadline, permit2612.v, permit2612.r, permit2612.s
        ) {} catch Error(string memory reason) {
            emit EIP2612PermitFailedWithReason(token, owner, reason);
        } catch Panic(uint256 errorCode) {
            emit EIP2612PermitFailedWithPanic(token, owner, errorCode);
        } catch (bytes memory data) {
            emit EIP2612PermitFailedWithData(token, owner, data);
        }
    }
}
