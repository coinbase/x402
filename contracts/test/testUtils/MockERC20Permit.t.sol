// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.18;

import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20Permit is ERC20Permit {
    constructor(string memory name) ERC20Permit(name) ERC20(name, name) {}

    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) public {
        _burn(from, amount);
    }
}
