// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {SafeSingletonDeployer} from "safe-singleton-deployer/SafeSingletonDeployer.sol";
import {DeferredPaymentEscrow} from "../src/DeferredPaymentEscrow.sol";

contract Deploy is Script {
    // Use meaningful salt for deterministic addresses across chains
    bytes32 constant ESCROW_SALT = keccak256("DeferredPaymentEscrow.v1");

    function run() external returns (address escrow) {
        // Default deployment parameters
        uint256 thawingPeriod = 1 days; // 86400 seconds

        console.log("=== Deploying DeferredPaymentEscrow ===");
        console.log("Deployer:", msg.sender);
        console.log("Thawing Period:", thawingPeriod);
        console.log("");

        vm.startBroadcast();

        // Deploy DeferredPaymentEscrow using Safe Singleton Factory
        console.log("Deploying DeferredPaymentEscrow...");
        escrow = _deploySingleton(
            type(DeferredPaymentEscrow).creationCode, abi.encode(thawingPeriod), ESCROW_SALT, "DeferredPaymentEscrow"
        );

        vm.stopBroadcast();

        // Verify deployment
        DeferredPaymentEscrow escrowContract = DeferredPaymentEscrow(escrow);
        require(escrowContract.THAWING_PERIOD() == thawingPeriod, "Deployment failed");

        // Log deployment summary
        console.log("");
        console.log("=== Deployment Summary ===");
        console.log("DeferredPaymentEscrow:", escrow);
        console.log("");
        console.log("This address will be consistent across all chains!");
        console.log("=========================");
    }

    function _deploySingleton(
        bytes memory creationCode,
        bytes memory constructorArgs,
        bytes32 salt,
        string memory contractName
    ) internal returns (address deployed) {
        // Use SafeSingletonDeployer.deploy (not broadcastDeploy) since we're already broadcasting
        deployed = SafeSingletonDeployer.deploy(creationCode, constructorArgs, salt);

        console.log(string.concat(contractName, " deployed at:"), deployed);

        // Verify deployment
        require(deployed.code.length > 0, string.concat(contractName, " deployment failed"));
    }

    // Helper function to predict addresses without deploying
    function predict() external pure {
        console.log("=== Predicted Addresses ===");

        // Predict DeferredPaymentEscrow address
        address predictedEscrow = SafeSingletonDeployer.computeAddress(
            type(DeferredPaymentEscrow).creationCode, abi.encode(1 days), ESCROW_SALT
        );
        console.log("DeferredPaymentEscrow:", predictedEscrow);

        console.log("===========================");
    }
}
