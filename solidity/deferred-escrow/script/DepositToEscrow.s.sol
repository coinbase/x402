// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IDeferredPaymentEscrow} from "../src/IDeferredPaymentEscrow.sol";

contract DepositToEscrow is Script {
    address constant DEFAULT_TOKEN = 0x036CbD53842c5426634e7929541eC2318f3dCF7e; // USDC
    uint256 constant DEFAULT_AMOUNT = 10_000; // 0.01 USDC

    function run() external {
        // Get escrow address based on chain ID
        address escrowAddress = getEscrowAddress();
        require(escrowAddress != address(0), "Escrow address not found for this chain");

        // Get parameters from environment variables or use defaults
        address seller = vm.envOr("SELLER", address(0));
        address token = vm.envOr("TOKEN", DEFAULT_TOKEN);
        uint256 amount = vm.envOr("AMOUNT", DEFAULT_AMOUNT);

        // Validate inputs
        require(seller != address(0), "Seller address must be provided via SELLER env var");
        require(token != address(0), "Non-zero token address must be provided via TOKEN env var");
        require(amount > 0, "Amount must be provided via AMOUNT env var");

        // Log deposit parameters
        console.log("Depositing to DeferredPaymentEscrow...");
        console.log("  Escrow:", escrowAddress);
        console.log("  Seller:", seller);
        console.log("  Token:", token);
        console.log("  Amount:", amount);

        // Start broadcasting transactions
        vm.startBroadcast();

        // Get token contract
        IERC20 tokenContract = IERC20(token);

        // Check current allowance
        uint256 currentAllowance = tokenContract.allowance(msg.sender, escrowAddress);
        console.log("  Current allowance:", currentAllowance);

        // Approve if needed
        if (currentAllowance < amount) {
            console.log("  Approving escrow to spend tokens...");
            tokenContract.approve(escrowAddress, amount);
        }

        // Get escrow contract
        IDeferredPaymentEscrow escrow = IDeferredPaymentEscrow(escrowAddress);

        // Check balance before deposit
        IDeferredPaymentEscrow.EscrowAccount memory accountBefore = escrow.getAccount(msg.sender, seller, token);
        console.log("  Balance before:", accountBefore.balance);

        // Deposit tokens
        escrow.deposit(seller, token, amount);

        // Check balance after deposit
        IDeferredPaymentEscrow.EscrowAccount memory accountAfter = escrow.getAccount(msg.sender, seller, token);
        console.log("  Balance after:", accountAfter.balance);

        vm.stopBroadcast();

        console.log("\n=== Deposit Summary ===");
        console.log("Deposited:", amount);
        console.log("From buyer:", msg.sender);
        console.log("To seller:", seller);
        console.log("Token:", token);
        console.log("New balance:", accountAfter.balance);
        console.log("======================");
    }

    function getEscrowAddress() internal view returns (address) {
        uint256 chainId = block.chainid;

        // Read addresses from JSON file
        string memory root = vm.projectRoot();
        string memory path = string.concat(root, "/addresses.json");
        string memory json = vm.readFile(path);

        // Parse JSON to get escrow address for current chain
        string memory key = string.concat(".", vm.toString(chainId), ".deferredPaymentEscrow");
        address escrowAddress = vm.parseJsonAddress(json, key);

        return escrowAddress;
    }
}
