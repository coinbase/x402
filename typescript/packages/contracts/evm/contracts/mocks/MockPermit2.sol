// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ISignatureTransfer} from "../interfaces/IPermit2.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title MockPermit2
 * @notice Mock implementation of Permit2 for testing
 * @dev Tracks all calls and allows configurable behavior
 */
contract MockPermit2 is ISignatureTransfer {
    // Track calls for verification
    struct PermitWitnessTransferFromCall {
        address token;
        uint256 permittedAmount;
        uint256 nonce;
        uint256 deadline;
        address to;
        uint256 requestedAmount;
        address owner;
        bytes32 witness;
        string witnessTypeString;
        bytes signature;
    }

    PermitWitnessTransferFromCall[] public calls;

    // For nonce tracking
    mapping(address => mapping(uint256 => uint256)) public nonceBitmapStorage;

    // Configuration
    bool public shouldRevert;
    string public revertMessage;
    bool public shouldActuallyTransfer;

    function nonceBitmap(address owner, uint256 wordPos) external view override returns (uint256) {
        return nonceBitmapStorage[owner][wordPos];
    }

    function permitTransferFrom(
        PermitTransferFrom memory,
        SignatureTransferDetails calldata,
        address,
        bytes calldata
    ) external pure override {
        revert("Use permitWitnessTransferFrom");
    }

    function permitWitnessTransferFrom(
        PermitTransferFrom memory permit,
        SignatureTransferDetails calldata transferDetails,
        address owner,
        bytes32 witness,
        string calldata witnessTypeString,
        bytes calldata signature
    ) external override {
        if (shouldRevert) {
            revert(revertMessage);
        }

        // Store call for verification
        calls.push(
            PermitWitnessTransferFromCall({
                token: permit.permitted.token,
                permittedAmount: permit.permitted.amount,
                nonce: permit.nonce,
                deadline: permit.deadline,
                to: transferDetails.to,
                requestedAmount: transferDetails.requestedAmount,
                owner: owner,
                witness: witness,
                witnessTypeString: witnessTypeString,
                signature: signature
            })
        );

        // Mark nonce as used
        uint256 wordPos = permit.nonce >> 8;
        uint256 bitPos = permit.nonce & 0xff;
        nonceBitmapStorage[owner][wordPos] |= (1 << bitPos);

        // Optionally perform actual transfer
        if (shouldActuallyTransfer) {
            IERC20(permit.permitted.token).transferFrom(
                owner,
                transferDetails.to,
                transferDetails.requestedAmount
            );
        }
    }

    // Test helpers
    function setRevert(bool _shouldRevert, string memory _message) external {
        shouldRevert = _shouldRevert;
        revertMessage = _message;
    }

    function setShouldActuallyTransfer(bool _should) external {
        shouldActuallyTransfer = _should;
    }

    function getCallCount() external view returns (uint256) {
        return calls.length;
    }

    function getLastCall() external view returns (PermitWitnessTransferFromCall memory) {
        require(calls.length > 0, "No calls recorded");
        return calls[calls.length - 1];
    }

    function clearCalls() external {
        delete calls;
    }
}
