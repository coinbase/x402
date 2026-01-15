// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

contract MockERC20Permit is ERC20, ERC20Permit {
    uint8 private _decimals;
    bool public shouldPermitRevert;
    string public permitRevertMessage;

    constructor(string memory name, string memory symbol, uint8 decimals_) ERC20(name, symbol) ERC20Permit(name) {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function permit(address owner, address spender, uint256 value, uint256, uint8, bytes32, bytes32) public override {
        if (shouldPermitRevert) {
            revert(permitRevertMessage);
        }
        _approve(owner, spender, value);
    }

    function setPermitRevert(bool _shouldRevert, string memory _message) external {
        shouldPermitRevert = _shouldRevert;
        permitRevertMessage = _message;
    }
}
