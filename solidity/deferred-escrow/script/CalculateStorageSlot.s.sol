// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {SlotDerivation} from "@openzeppelin/contracts/utils/SlotDerivation.sol";

contract CalculateStorageSlot is Script {
    using SlotDerivation for string;

    function run() public {
        string memory namespace = "deferred.payment.escrow.main";
        bytes32 slot = namespace.erc7201Slot();
        console.log("Namespace:", namespace);
        console.log("Storage slot:");
        console.logBytes32(slot);
    }
}
