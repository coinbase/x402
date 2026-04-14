// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";

import {IDepositCollector} from "../interfaces/IDepositCollector.sol";
import {ISignatureTransfer} from "../interfaces/ISignatureTransfer.sol";
import {DepositCollector} from "./DepositCollector.sol";

/// @title Permit2DepositCollector
/// @notice Deposit collector using Permit2 `permitWitnessTransferFrom` with channel witness binding.
/// @dev Tokens flow directly from payer to settlement via Permit2.
///      `collectorData` is `abi.encode(nonce, deadline, permit2Signature, eip2612PermitData)`.
///      Token and amount are taken from `collect` and must match the signed Permit2 transfer.
///      If `eip2612PermitData` is empty, no EIP-2612 `permit` is attempted. If non-empty, it must be
///      `abi.encode(value, permitDeadline, v, r, s)` and `IERC20Permit.permit(owner, Permit2, ...)` is called
///      before the Permit2 transfer (soft-fail: emits events on revert, then continues).
contract Permit2DepositCollector is DepositCollector {
    ISignatureTransfer public immutable PERMIT2;

    string public constant DEPOSIT_WITNESS_TYPE_STRING =
        "DepositWitness witness)TokenPermissions(address token,uint256 amount)DepositWitness(bytes32 channelId)";

    bytes32 public constant DEPOSIT_WITNESS_TYPEHASH = keccak256("DepositWitness(bytes32 channelId)");

    error InvalidPermit2Address();

    /// @dev Signed EIP-2612 `value` must equal `collect` `amount` when the optional permit segment is used.
    error Permit2612AmountMismatch();

    event EIP2612PermitFailedWithReason(address indexed token, address indexed owner, string reason);
    event EIP2612PermitFailedWithPanic(address indexed token, address indexed owner, uint256 errorCode);
    event EIP2612PermitFailedWithData(address indexed token, address indexed owner, bytes data);

    constructor(address _settlement, address _permit2) DepositCollector(_settlement) {
        if (_permit2 == address(0)) revert InvalidPermit2Address();
        PERMIT2 = ISignatureTransfer(_permit2);
    }

    /// @inheritdoc IDepositCollector
    function collect(
        address payer,
        address token,
        uint256 amount,
        bytes32 channelId,
        address,
        bytes calldata collectorData
    ) external override onlySettlement {
        (uint256 nonce, uint256 deadline, bytes memory permit2Signature, bytes memory eip2612PermitData) =
            abi.decode(collectorData, (uint256, uint256, bytes, bytes));

        if (eip2612PermitData.length > 0) {
            _tryEip2612Permit(payer, token, amount, eip2612PermitData);
        }

        ISignatureTransfer.PermitTransferFrom memory permit = ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({token: token, amount: amount}),
            nonce: nonce,
            deadline: deadline
        });

        _executePermit2Transfer(payer, amount, channelId, permit, permit2Signature);
    }

    /// @dev Execute a Permit2 witness transfer from payer directly to the settlement singleton.
    function _executePermit2Transfer(
        address payer,
        uint256 amount,
        bytes32 channelId,
        ISignatureTransfer.PermitTransferFrom memory permit,
        bytes memory signature
    ) internal {
        bytes32 witnessHash = keccak256(abi.encode(DEPOSIT_WITNESS_TYPEHASH, channelId));

        PERMIT2.permitWitnessTransferFrom(
            permit,
            ISignatureTransfer.SignatureTransferDetails({to: address(settlement), requestedAmount: amount}),
            payer,
            witnessHash,
            DEPOSIT_WITNESS_TYPE_STRING,
            signature
        );
    }

    function _tryEip2612Permit(address payer, address token, uint256 amount, bytes memory eip2612PermitData) private {
        (uint256 permitValue, uint256 permitDeadline, uint8 v, bytes32 r, bytes32 s) =
            abi.decode(eip2612PermitData, (uint256, uint256, uint8, bytes32, bytes32));
        if (permitValue != amount) revert Permit2612AmountMismatch();

        try IERC20Permit(token).permit(payer, address(PERMIT2), permitValue, permitDeadline, v, r, s) {}
        catch Error(string memory reason) {
            emit EIP2612PermitFailedWithReason(token, payer, reason);
        } catch Panic(uint256 code) {
            emit EIP2612PermitFailedWithPanic(token, payer, code);
        } catch (bytes memory lowLevelData) {
            emit EIP2612PermitFailedWithData(token, payer, lowLevelData);
        }
    }
}
