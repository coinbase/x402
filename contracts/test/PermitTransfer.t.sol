// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.18;

import {Test} from "forge-std/Test.sol";
import {PermitTransfer, IToken} from "../src/PermitTransfer.sol";
import {MockERC20Permit} from "./testUtils/MockERC20Permit.t.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

contract PermitTransferTest is Test {
    PermitTransfer public permitTransfer;
    uint256 public privateKey = 420;
    address public user = vm.addr(privateKey);
    address public user2 = vm.addr(privateKey + 1);

    uint256 public userBalance = 100 ether;
    uint256 public user2Balance = 100 ether;

    MockERC20Permit public token;

    function setUp() public {
        permitTransfer = new PermitTransfer();
        token = new MockERC20Permit("TestToken");
        token.mint(user, 100 ether);
        token.mint(user2, 100 ether);
    }

    function test_PermittedTransfer() public {
        uint256 transferAmount = 10 ether;

        PermitTransfer.PermitData memory permitData = PermitTransfer.PermitData({
            owner: user,
            value: transferAmount,
            nonce: token.nonces(user),
            deadline: block.timestamp + 1 days
        });
        bytes memory permitSignature = signPermitData(permitData, privateKey);

        PermitTransfer.TransferData memory transferData =
            PermitTransfer.TransferData({to: user2, amount: transferAmount});
        bytes memory transferSignature = signTransferData(transferData, privateKey);

        permitTransfer.permittedTransferFrom(
            IToken(address(token)), permitData, transferData, permitSignature, transferSignature
        );

        assertEq(token.balanceOf(user), userBalance - transferData.amount);
        assertEq(token.balanceOf(user2), user2Balance + transferData.amount);
    }

    function test_AllowsUpToTransfer() public {
        uint256 allowanceAmount = 20 ether;
        uint256 transferAmount = 10 ether;

        PermitTransfer.PermitData memory permitData = PermitTransfer.PermitData({
            owner: user,
            value: allowanceAmount,
            nonce: token.nonces(user),
            deadline: block.timestamp + 1 days
        });
        bytes memory permitSignature = signPermitData(permitData, privateKey);

        PermitTransfer.TransferData memory transferData =
            PermitTransfer.TransferData({to: user2, amount: transferAmount});
        bytes memory transferSignature = signTransferData(transferData, privateKey);

        permitTransfer.permittedTransferFrom(
            IToken(address(token)), permitData, transferData, permitSignature, transferSignature
        );

        assertEq(token.balanceOf(user), userBalance - transferData.amount);
        assertEq(token.balanceOf(user2), user2Balance + transferData.amount);
    }

    function test_RevertsOnExpiredDeadline() public {
        uint256 transferAmount = 10 ether;

        PermitTransfer.PermitData memory permitData = PermitTransfer.PermitData({
            owner: user,
            value: transferAmount,
            nonce: token.nonces(user),
            deadline: block.timestamp - 1
        });
        bytes memory permitSignature = signPermitData(permitData, privateKey);

        PermitTransfer.TransferData memory transferData =
            PermitTransfer.TransferData({to: user2, amount: transferAmount});
        bytes memory transferSignature = signTransferData(transferData, privateKey);

        vm.expectRevert("PermitTransfer: expired deadline");
        permitTransfer.permittedTransferFrom(
            IToken(address(token)), permitData, transferData, permitSignature, transferSignature
        );
    }

    function test_RevertsOnInvalidNonce() public {
        uint256 transferAmount = 10 ether;

        PermitTransfer.PermitData memory permitData = PermitTransfer.PermitData({
            owner: user,
            value: transferAmount,
            nonce: token.nonces(user) + 1,
            deadline: block.timestamp + 1 days
        });
        bytes memory permitSignature = signPermitData(permitData, privateKey);

        PermitTransfer.TransferData memory transferData =
            PermitTransfer.TransferData({to: user2, amount: transferAmount});
        bytes memory transferSignature = signTransferData(transferData, privateKey);

        vm.expectRevert("PermitTransfer: invalid nonce");
        permitTransfer.permittedTransferFrom(
            IToken(address(token)), permitData, transferData, permitSignature, transferSignature
        );
    }

    function test_RevertsOnInsufficientBalance() public {
        uint256 transferAmount = 200 ether;

        PermitTransfer.PermitData memory permitData = PermitTransfer.PermitData({
            owner: user,
            value: transferAmount,
            nonce: token.nonces(user),
            deadline: block.timestamp + 1 days
        });
        bytes memory permitSignature = signPermitData(permitData, privateKey);

        PermitTransfer.TransferData memory transferData =
            PermitTransfer.TransferData({to: user2, amount: transferAmount});
        bytes memory transferSignature = signTransferData(transferData, privateKey);

        vm.expectRevert("PermitTransfer: insufficient balance");
        permitTransfer.permittedTransferFrom(
            IToken(address(token)), permitData, transferData, permitSignature, transferSignature
        );
    }

    function test_RevertsOnInsufficientPermitValue() public {
        uint256 transferAmount = 20 ether;

        PermitTransfer.PermitData memory permitData = PermitTransfer.PermitData({
            owner: user,
            value: transferAmount,
            nonce: token.nonces(user),
            deadline: block.timestamp + 1 days
        });
        bytes memory permitSignature = signPermitData(permitData, privateKey);

        PermitTransfer.TransferData memory transferData =
            PermitTransfer.TransferData({to: user2, amount: transferAmount + 1});
        bytes memory transferSignature = signTransferData(transferData, privateKey);

        vm.expectRevert("PermitTransfer: insufficient permit value");
        permitTransfer.permittedTransferFrom(
            IToken(address(token)), permitData, transferData, permitSignature, transferSignature
        );
    }

    function test_RevertsOnInvalidTransferSignatureSigner() public {
        uint256 transferAmount = 10 ether;

        PermitTransfer.PermitData memory permitData = PermitTransfer.PermitData({
            owner: user,
            value: transferAmount,
            nonce: token.nonces(user),
            deadline: block.timestamp + 1 days
        });
        bytes memory permitSignature = signPermitData(permitData, privateKey);

        PermitTransfer.TransferData memory transferData =
            PermitTransfer.TransferData({to: user2, amount: transferAmount});
        bytes memory transferSignature = signTransferData(transferData, privateKey + 1);

        vm.expectRevert("PermitTransfer: invalid transfer signature");
        permitTransfer.permittedTransferFrom(
            IToken(address(token)), permitData, transferData, permitSignature, transferSignature
        );
    }

    function test_RevertsOnInvalidTransferSignatureData() public {
        uint256 transferAmount = 10 ether;

        PermitTransfer.PermitData memory permitData = PermitTransfer.PermitData({
            owner: user,
            value: transferAmount,
            nonce: token.nonces(user),
            deadline: block.timestamp + 1 days
        });
        bytes memory permitSignature = signPermitData(permitData, privateKey);

        PermitTransfer.TransferData memory transferData =
            PermitTransfer.TransferData({to: user2, amount: transferAmount});
        bytes memory transferSignature =
            signTransferData(PermitTransfer.TransferData({to: user2, amount: transferAmount - 1}), privateKey);

        vm.expectRevert("PermitTransfer: invalid transfer signature");
        permitTransfer.permittedTransferFrom(
            IToken(address(token)), permitData, transferData, permitSignature, transferSignature
        );
    }

    function test_RevertsOnSameOwnerAndRecipient() public {
        uint256 transferAmount = 10 ether;

        PermitTransfer.PermitData memory permitData = PermitTransfer.PermitData({
            owner: user,
            value: transferAmount,
            nonce: token.nonces(user),
            deadline: block.timestamp + 1 days
        });
        bytes memory permitSignature = signPermitData(permitData, privateKey);

        PermitTransfer.TransferData memory transferData =
            PermitTransfer.TransferData({to: user, amount: transferAmount});
        bytes memory transferSignature = signTransferData(transferData, privateKey);

        vm.expectRevert("PermitTransfer: owner and recipient are the same");
        permitTransfer.permittedTransferFrom(
            IToken(address(token)), permitData, transferData, permitSignature, transferSignature
        );
    }

    function test_RevertsOnZeroAddressOwner() public {
        uint256 transferAmount = 10 ether;

        PermitTransfer.PermitData memory permitData = PermitTransfer.PermitData({
            owner: address(0),
            value: transferAmount,
            nonce: token.nonces(user),
            deadline: block.timestamp + 1 days
        });
        bytes memory permitSignature = signPermitData(permitData, privateKey);

        PermitTransfer.TransferData memory transferData =
            PermitTransfer.TransferData({to: user2, amount: transferAmount});
        bytes memory transferSignature = signTransferData(transferData, privateKey);

        vm.expectRevert("PermitTransfer: recipient/owner cannot be zero address");
        permitTransfer.permittedTransferFrom(
            IToken(address(token)), permitData, transferData, permitSignature, transferSignature
        );
    }

    function test_RevertsOnZeroAddressRecipient() public {
        uint256 transferAmount = 10 ether;

        PermitTransfer.PermitData memory permitData = PermitTransfer.PermitData({
            owner: user,
            value: transferAmount,
            nonce: token.nonces(user),
            deadline: block.timestamp + 1 days
        });
        bytes memory permitSignature = signPermitData(permitData, privateKey);

        PermitTransfer.TransferData memory transferData =
            PermitTransfer.TransferData({to: address(0), amount: transferAmount});
        bytes memory transferSignature = signTransferData(transferData, privateKey);

        vm.expectRevert("PermitTransfer: recipient/owner cannot be zero address");
        permitTransfer.permittedTransferFrom(
            IToken(address(token)), permitData, transferData, permitSignature, transferSignature
        );
    }

    function test_RevertsOnInvalidPermitSignatureSigner() public {
        uint256 transferAmount = 10 ether;

        PermitTransfer.PermitData memory permitData = PermitTransfer.PermitData({
            owner: user,
            value: transferAmount,
            nonce: token.nonces(user),
            deadline: block.timestamp + 1 days
        });
        bytes memory permitSignature = signPermitData(permitData, privateKey + 1);

        PermitTransfer.TransferData memory transferData =
            PermitTransfer.TransferData({to: user2, amount: transferAmount});
        bytes memory transferSignature = signTransferData(transferData, privateKey);

        vm.expectRevert(
            abi.encodeWithSelector(
                ERC20Permit.ERC2612InvalidSigner.selector, 0x296f8bbBde215aE40948c3dEb736C804c9fc64FF, permitData.owner
            )
        );
        permitTransfer.permittedTransferFrom(
            IToken(address(token)), permitData, transferData, permitSignature, transferSignature
        );
    }

    function test_RevertsOnInvalidPermitSignatureData() public {
        uint256 transferAmount = 10 ether;

        PermitTransfer.PermitData memory permitData = PermitTransfer.PermitData({
            owner: user,
            value: transferAmount,
            nonce: token.nonces(user),
            deadline: block.timestamp + 1 days
        });
        bytes memory permitSignature = signPermitData(
            PermitTransfer.PermitData({
                owner: user,
                value: transferAmount - 1,
                nonce: token.nonces(user),
                deadline: block.timestamp + 1 days
            }),
            privateKey
        );

        PermitTransfer.TransferData memory transferData =
            PermitTransfer.TransferData({to: user2, amount: transferAmount});
        bytes memory transferSignature = signTransferData(transferData, privateKey);

        vm.expectRevert(
            abi.encodeWithSelector(
                ERC20Permit.ERC2612InvalidSigner.selector, 0xfc18BeCD5ACF7564c699A43136bC5A489514C33c, permitData.owner
            )
        );
        permitTransfer.permittedTransferFrom(
            IToken(address(token)), permitData, transferData, permitSignature, transferSignature
        );
    }

    function signPermitData(PermitTransfer.PermitData memory permitData, uint256 signer)
        internal
        view
        returns (bytes memory)
    {
        bytes32 digest = keccak256(
            abi.encodePacked(
                hex"1901",
                token.DOMAIN_SEPARATOR(),
                keccak256(
                    abi.encode(
                        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"),
                        permitData.owner,
                        address(permitTransfer),
                        permitData.value,
                        permitData.nonce,
                        permitData.deadline
                    )
                )
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signer, digest);
        return abi.encodePacked(r, s, v);
    }

    function signTransferData(PermitTransfer.TransferData memory transferData, uint256 signer)
        internal
        pure
        returns (bytes memory)
    {
        bytes32 digest = keccak256(
            abi.encode(keccak256("Transfer(address to,uint256 amount)"), transferData.to, transferData.amount)
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signer, digest);
        return abi.encodePacked(r, s, v);
    }
}
