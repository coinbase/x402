// SPDX-License-Identifier: GPL-3.0
// Substrato 1042 - RBB-CATHEDRAL-BRIDGE
// Token ERC-20 com integração Theosis para fees
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract RBB_Cathedral_Token is ERC20, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    // Fee configurations
    uint256 public baseFee = 0.001 ether;
    uint256 public theosisDiscountScale = 1000; // Representing 100% discount max

    event FeeDiscountApplied(address indexed user, uint256 theosisLevel, uint256 finalFee);

    constructor(address admin) ERC20("RBB Cathedral Token", "CATH") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
    }

    /**
     * @notice Mints new tokens. Only callers with MINTER_ROLE (e.g. the Bridge) can call this.
     */
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }

    /**
     * @notice Calculates the fee for an operation based on the user's theosis level.
     * @param theosisLevel The current theosis level of the user (scaled by 1000, where 1000 = 1.0)
     */
    function calculateFeeWithTheosis(uint256 theosisLevel) public view returns (uint256) {
        if (theosisLevel >= theosisDiscountScale) {
            return 0; // 100% discount
        }

        // Fee reduction is proportional to theosis level
        uint256 discount = (baseFee * theosisLevel) / theosisDiscountScale;
        return baseFee - discount;
    }

    /**
     * @notice Set a new base fee.
     */
    function setBaseFee(uint256 _baseFee) external onlyRole(DEFAULT_ADMIN_ROLE) {
        baseFee = _baseFee;
    }
}
