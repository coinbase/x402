// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/**
 * @title MockERC20Permit
 * @notice ERC20 token with EIP-2612 permit support for testing
 */
contract MockERC20Permit is ERC20, ERC20Permit {
    uint8 private _decimals;

    // Track permit calls for verification
    struct PermitCall {
        address owner;
        address spender;
        uint256 value;
        uint256 deadline;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    PermitCall[] public permitCalls;
    bool public shouldPermitRevert;
    string public permitRevertMessage;

    constructor(
        string memory name,
        string memory symbol,
        uint8 decimals_
    ) ERC20(name, symbol) ERC20Permit(name) {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external {
        _burn(from, amount);
    }

    // Override permit to track calls and optionally revert
    function permit(
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public override {
        if (shouldPermitRevert) {
            revert(permitRevertMessage);
        }

        // Track the call
        permitCalls.push(
            PermitCall({
                owner: owner,
                spender: spender,
                value: value,
                deadline: deadline,
                v: v,
                r: r,
                s: s
            })
        );

        // For testing, we just approve directly without signature verification
        // In real usage, the parent ERC20Permit.permit would verify the signature
        _approve(owner, spender, value);
    }

    // Test helpers
    function setPermitRevert(bool _shouldRevert, string memory _message) external {
        shouldPermitRevert = _shouldRevert;
        permitRevertMessage = _message;
    }

    function getPermitCallCount() external view returns (uint256) {
        return permitCalls.length;
    }

    function getLastPermitCall() external view returns (PermitCall memory) {
        require(permitCalls.length > 0, "No permit calls");
        return permitCalls[permitCalls.length - 1];
    }

    function clearPermitCalls() external {
        delete permitCalls;
    }
}
