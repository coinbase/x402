// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/crypto/CathedralSPHINCSVerifier.sol";

contract CathedralSPHINCSVerifierTest is Test {
    CathedralSPHINCSVerifier public verifier;

    function setUp() public {
        verifier = new CathedralSPHINCSVerifier();
    }

    function test_VerifySPHINCS() public {
        string[] memory inputs = new string[](3);
        inputs[0] = "python3";
        inputs[1] = "-c";
        inputs[2] = "import sys; sys.path.insert(0, '../../'); from python.x402.crypto.sphincs_c13 import SPHINCSC13; c13 = SPHINCSC13(); c13.generate_keypair(); msg = b'00000000000000000000000000000000'; sig, pk = c13.sign(msg); print((pk + msg + sig).hex(), end='')";

        bytes memory outputStr = vm.ffi(inputs);

        uint256 expectedLen = 16 + 32 + 3952;
        require(outputStr.length >= expectedLen, "Invalid python output length");

        bytes memory output = new bytes(expectedLen);
        for(uint i=0; i<expectedLen; i++) {
            output[i] = outputStr[i];
        }

        bytes32 pk;
        bytes memory msgData = new bytes(32);
        bytes memory sigData = new bytes(3952);

        for(uint i=0; i<16; i++) {
            pk |= bytes32(uint256(uint8(output[i])) << (8 * (31 - i)));
        }

        for(uint i=0; i<32; i++) {
            msgData[i] = output[16+i];
        }

        for(uint i=0; i<3952; i++) {
            sigData[i] = output[16+32+i];
        }

        bool result = verifier.verifySPHINCS(msgData, sigData, pk);
        assertTrue(result, "Signature should be valid");
    }

    function _fromHexChar(uint8 c) internal pure returns (uint8) {
        if (c >= uint8(bytes1('0')) && c <= uint8(bytes1('9'))) {
            return c - uint8(bytes1('0'));
        }
        if (c >= uint8(bytes1('a')) && c <= uint8(bytes1('f'))) {
            return 10 + c - uint8(bytes1('a'));
        }
        if (c >= uint8(bytes1('A')) && c <= uint8(bytes1('F'))) {
            return 10 + c - uint8(bytes1('A'));
        }
        revert("Invalid hex char");
    }
}
