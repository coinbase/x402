// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.18;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";

interface IToken is IERC20, IERC20Permit {}

contract PermitTransfer {
    struct PermitData {
        address owner;
        uint256 value;
        uint256 nonce;
        uint256 deadline;
    }

    struct TransferData {
        address to;
        uint256 amount;
    }

    function permittedTransferFrom(
        IToken token,
        PermitData memory permitData,
        TransferData memory transferData,
        bytes memory permitSignature,
        bytes memory transferSignature
    ) public {
        require(permitData.owner != transferData.to, "PermitTransfer: owner and recipient are the same");
        require(
            permitData.owner != address(0) && transferData.to != address(0),
            "PermitTransfer: recipient/owner cannot be zero address"
        );

        (bytes32 r, bytes32 s, uint8 v) = decodeSignature(transferSignature);
        bytes32 transferHash = keccak256(
            abi.encode(keccak256("Transfer(address to,uint256 amount)"), transferData.to, transferData.amount)
        );
        address signer = ecrecover(transferHash, v, r, s);
        require(signer == permitData.owner, "PermitTransfer: invalid transfer signature");

        require(permitData.deadline >= block.timestamp, "PermitTransfer: expired deadline");
        require(permitData.nonce == token.nonces(permitData.owner), "PermitTransfer: invalid nonce");
        require(permitData.value >= transferData.amount, "PermitTransfer: insufficient permit value");
        require(token.balanceOf(permitData.owner) >= transferData.amount, "PermitTransfer: insufficient balance");

        (r, s, v) = decodeSignature(permitSignature);

        token.permit(permitData.owner, address(this), permitData.value, permitData.deadline, v, r, s);
        token.transferFrom(permitData.owner, transferData.to, transferData.amount);
    }

    function decodeSignature(bytes memory signature) public pure returns (bytes32 r, bytes32 s, uint8 v) {
        require(signature.length == 65, "PermitTransfer: invalid signature length");
        assembly {
            r := mload(add(signature, 0x20))
            s := mload(add(signature, 0x40))
            v := byte(0, mload(add(signature, 0x60)))
        }
    }
}
