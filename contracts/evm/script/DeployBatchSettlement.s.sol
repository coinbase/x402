// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {x402BatchSettlement} from "../src/x402BatchSettlement.sol";
import {Permit2DepositCollector} from "../src/periphery/Permit2DepositCollector.sol";
import {Permit2WithPermitDepositCollector} from "../src/periphery/Permit2WithPermitDepositCollector.sol";
import {ERC3009DepositCollector} from "../src/periphery/ERC3009DepositCollector.sol";

/// @title DeployBatchSettlement
/// @notice Deployment script for x402BatchSettlement and deposit collectors using CREATE2
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

    bytes32 constant BATCH_SALT = 0x00000000000000000000000000000000000000000000000020000000041a1d56;

    function run() public {
        address permit2 = vm.envOr("PERMIT2_ADDRESS", CANONICAL_PERMIT2);

        console2.log("");
        console2.log("============================================================");
        console2.log("  x402BatchSettlement Deterministic Deployment (CREATE2)");
        console2.log("  Model: Dual-Authorizer Channel-Config + Deposit Collectors");
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

        _deploySettlement();
        _deployCollectors(permit2);

        console2.log("");
        console2.log("Deployment complete!");
        console2.log("");
    }

    function _deploySettlement() internal {
        console2.log("");
        console2.log("------------------------------------------------------------");
        console2.log("  Deploying x402BatchSettlement");
        console2.log("------------------------------------------------------------");

        bytes memory initCode = type(x402BatchSettlement).creationCode;
        bytes32 initCodeHash = keccak256(initCode);
        address expectedAddress = _computeCreate2Addr(BATCH_SALT, initCodeHash, CREATE2_DEPLOYER);

        console2.log("Salt:", vm.toString(BATCH_SALT));
        console2.log("Expected address:", expectedAddress);
        console2.log("Init code hash:", vm.toString(initCodeHash));

        x402BatchSettlement bs;

        if (expectedAddress.code.length > 0) {
            console2.log("Contract already deployed at", expectedAddress);
            return;
        }

        vm.startBroadcast();

        if (block.chainid == 31_337 || block.chainid == 1337) {
            console2.log("(Using regular deployment for local network)");
            bs = new x402BatchSettlement();
        } else {
            bytes memory deploymentData = abi.encodePacked(BATCH_SALT, initCode);
            (bool success,) = CREATE2_DEPLOYER.call(deploymentData);
            require(success, "CREATE2 deployment failed for BatchSettlement");
            require(expectedAddress.code.length > 0, "No bytecode at expected address");
            bs = x402BatchSettlement(expectedAddress);
        }

        vm.stopBroadcast();

        console2.log("Deployed to:", address(bs));
    }

    function _deployCollectors(address permit2) internal {
        console2.log("");
        console2.log("------------------------------------------------------------");
        console2.log("  Deploying Deposit Collectors");
        console2.log("------------------------------------------------------------");

        vm.startBroadcast();

        ERC3009DepositCollector erc3009Collector = new ERC3009DepositCollector();
        console2.log("ERC3009DepositCollector:", address(erc3009Collector));

        Permit2DepositCollector permit2Collector = new Permit2DepositCollector(permit2);
        console2.log("Permit2DepositCollector:", address(permit2Collector));

        Permit2WithPermitDepositCollector permit2WithPermitCollector = new Permit2WithPermitDepositCollector(permit2);
        console2.log("Permit2WithPermitDepositCollector:", address(permit2WithPermitCollector));

        vm.stopBroadcast();
    }

    function _computeCreate2Addr(
        bytes32 salt,
        bytes32 initCodeHash,
        address deployer
    ) internal pure returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), deployer, salt, initCodeHash)))));
    }
}
