// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {x402BatchSettlement} from "../src/x402BatchSettlement.sol";

/// @title DeployBatchSettlement
/// @notice Deployment script for x402BatchSettlement using CREATE2
/// @dev Run with: forge script script/DeployBatchSettlement.s.sol --rpc-url $RPC_URL --broadcast --verify
///
///      Uses deterministic bytecode (cbor_metadata = false in foundry.toml) so
///      any machine compiling at the same git commit produces the same initCode
///      and therefore the same CREATE2 address.
contract DeployBatchSettlement is Script {
    /// @notice Canonical Permit2 address (Uniswap's official deployment)
    address constant CANONICAL_PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

    /// @notice Arachnid's deterministic CREATE2 deployer (same on all EVM chains)
    address constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;

    // TODO: Re-mine vanity salt after contract rewrite. Initcode has changed.
    bytes32 constant BATCH_SALT = bytes32(0);

    function run() public {
        address permit2 = vm.envOr("PERMIT2_ADDRESS", CANONICAL_PERMIT2);

        console2.log("");
        console2.log("============================================================");
        console2.log("  x402BatchSettlement Deterministic Deployment (CREATE2)");
        console2.log("  Model: Stateless Channel-Config");
        console2.log("============================================================");
        console2.log("");

        console2.log("Network: chainId", block.chainid);
        console2.log("Permit2:", permit2);
        console2.log("CREATE2 Deployer:", CREATE2_DEPLOYER);
        console2.log("");

        if (block.chainid != 31_337 && block.chainid != 1337) {
            require(permit2.code.length > 0, "Permit2 not found on this network");
            console2.log("Permit2 verified");

            require(CREATE2_DEPLOYER.code.length > 0, "CREATE2 deployer not found on this network");
            console2.log("CREATE2 deployer verified");
        }

        _deploy(permit2);

        console2.log("");
        console2.log("Deployment complete!");
        console2.log("");
    }

    function _deploy(address permit2) internal {
        console2.log("");
        console2.log("------------------------------------------------------------");
        console2.log("  Deploying x402BatchSettlement");
        console2.log("------------------------------------------------------------");

        bytes memory initCode = abi.encodePacked(type(x402BatchSettlement).creationCode, abi.encode(permit2));
        bytes32 initCodeHash = keccak256(initCode);
        address expectedAddress = _computeCreate2Addr(BATCH_SALT, initCodeHash, CREATE2_DEPLOYER);

        console2.log("Salt:", vm.toString(BATCH_SALT));
        console2.log("Expected address:", expectedAddress);
        console2.log("Init code hash:", vm.toString(initCodeHash));

        x402BatchSettlement bs;

        if (expectedAddress.code.length > 0) {
            console2.log("Contract already deployed at", expectedAddress);
            bs = x402BatchSettlement(expectedAddress);
            console2.log("PERMIT2:", address(bs.PERMIT2()));
            return;
        }

        vm.startBroadcast();

        address deployedAddress;
        if (block.chainid == 31_337 || block.chainid == 1337) {
            console2.log("(Using regular deployment for local network)");
            bs = new x402BatchSettlement(permit2);
            deployedAddress = address(bs);
        } else {
            bytes memory deploymentData = abi.encodePacked(BATCH_SALT, initCode);
            (bool success,) = CREATE2_DEPLOYER.call(deploymentData);
            require(success, "CREATE2 deployment failed for BatchSettlement");
            deployedAddress = expectedAddress;
            require(deployedAddress.code.length > 0, "No bytecode at expected address");
            bs = x402BatchSettlement(deployedAddress);
        }

        vm.stopBroadcast();

        console2.log("Deployed to:", deployedAddress);
        console2.log("Verification - PERMIT2:", address(bs.PERMIT2()));
        require(address(bs.PERMIT2()) == permit2, "PERMIT2 mismatch");
    }

    function _computeCreate2Addr(
        bytes32 salt,
        bytes32 initCodeHash,
        address deployer
    ) internal pure returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), deployer, salt, initCodeHash)))));
    }
}
