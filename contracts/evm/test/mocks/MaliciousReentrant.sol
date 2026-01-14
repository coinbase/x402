// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ISignatureTransfer} from "../../src/interfaces/ISignatureTransfer.sol";
import {x402Permit2Proxy} from "../../src/x402Permit2Proxy.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title MaliciousReentrant
 * @notice Mock Permit2 that attempts reentrancy attacks
 */
contract MaliciousReentrant is ISignatureTransfer {
    x402Permit2Proxy public target;
    bool public attemptReentry;
    uint256 public reentryCount;

    // Store attack parameters
    ISignatureTransfer.PermitTransferFrom public storedPermit;
    uint256 public storedAmount;
    address public storedOwner;
    x402Permit2Proxy.Witness public storedWitness;
    bytes public storedSignature;

    mapping(address => mapping(uint256 => uint256)) public nonceBitmapStorage;

    function setTarget(
        address _target
    ) external {
        target = x402Permit2Proxy(_target);
    }

    function setAttemptReentry(
        bool _attempt
    ) external {
        attemptReentry = _attempt;
    }

    function setAttackParams(
        ISignatureTransfer.PermitTransferFrom calldata permit,
        uint256 amount,
        address owner,
        x402Permit2Proxy.Witness calldata witness,
        bytes calldata signature
    ) external {
        storedPermit = permit;
        storedAmount = amount;
        storedOwner = owner;
        storedWitness = witness;
        storedSignature = signature;
    }

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
        bytes32,
        string calldata,
        bytes calldata
    ) external override {
        // Mark nonce as used
        uint256 wordPos = permit.nonce >> 8;
        uint256 bitPos = permit.nonce & 0xff;
        nonceBitmapStorage[owner][wordPos] |= (1 << bitPos);

        // Attempt reentrancy if configured
        if (attemptReentry && address(target) != address(0)) {
            reentryCount++;
            // Try to call back into the proxy
            target.settle(storedPermit, storedAmount, storedOwner, storedWitness, storedSignature);
        }

        // Transfer tokens
        IERC20(permit.permitted.token).transferFrom(owner, transferDetails.to, transferDetails.requestedAmount);
    }
}
