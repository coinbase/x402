// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Permit2DepositCollector} from "../../src/periphery/Permit2DepositCollector.sol";
import {Permit2DepositCollectorBase} from "../../src/periphery/Permit2DepositCollectorBase.sol";
import {DepositCollector} from "../../src/periphery/DepositCollector.sol";
import {ISignatureTransfer} from "../../src/interfaces/ISignatureTransfer.sol";
import {MockPermit2} from "../mocks/MockPermit2.sol";
import {MockERC20} from "../mocks/MockERC20.sol";

contract Permit2DepositCollectorTest is Test {
    Permit2DepositCollector public collector;
    MockPermit2 public mockPermit2;
    MockERC20 public token;

    address public payer;

    uint256 constant AMOUNT = 1000e6;

    function setUp() public {
        mockPermit2 = new MockPermit2();
        collector = new Permit2DepositCollector(address(this), address(mockPermit2));
        token = new MockERC20("USDC", "USDC", 6);

        payer = makeAddr("payer");

        token.mint(payer, 100_000e6);

        vm.prank(payer);
        token.approve(address(mockPermit2), type(uint256).max);
        mockPermit2.setShouldActuallyTransfer(true);
    }

    function test_constructor_setsPermit2() public view {
        assertEq(address(collector.PERMIT2()), address(mockPermit2));
    }

    function test_constructor_revert_zeroPermit2() public {
        vm.expectRevert(Permit2DepositCollectorBase.InvalidPermit2Address.selector);
        new Permit2DepositCollector(address(this), address(0));
    }

    function test_witnessConstants() public view {
        assertEq(collector.DEPOSIT_WITNESS_TYPEHASH(), keccak256("DepositWitness(bytes32 channelId)"));
        assertEq(
            keccak256(bytes(collector.DEPOSIT_WITNESS_TYPE_STRING())),
            keccak256(
                "DepositWitness witness)TokenPermissions(address token,uint256 amount)DepositWitness(bytes32 channelId)"
            )
        );
    }

    function test_collect_success() public {
        ISignatureTransfer.PermitTransferFrom memory permit = ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({token: address(token), amount: AMOUNT}),
            nonce: 0,
            deadline: block.timestamp + 3600
        });
        bytes memory signature = abi.encodePacked(bytes32(uint256(1)), bytes32(uint256(2)), uint8(27));
        bytes memory collectorData = abi.encode(permit, signature);

        bytes32 channelId = keccak256("test-channel");
        collector.collect(payer, address(token), AMOUNT, channelId, address(this), collectorData);

        assertEq(token.balanceOf(address(this)), AMOUNT);
        assertEq(token.balanceOf(payer), 100_000e6 - AMOUNT);
    }

    function test_collect_directTransfer_noHop() public {
        ISignatureTransfer.PermitTransferFrom memory permit = ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({token: address(token), amount: AMOUNT}),
            nonce: 0,
            deadline: block.timestamp + 3600
        });
        bytes memory signature = abi.encodePacked(bytes32(uint256(1)), bytes32(uint256(2)), uint8(27));
        bytes memory collectorData = abi.encode(permit, signature);

        bytes32 channelId = keccak256("test-channel");
        collector.collect(payer, address(token), AMOUNT, channelId, address(this), collectorData);

        assertEq(token.balanceOf(address(collector)), 0);
    }

    function test_collect_consumesNonce() public {
        ISignatureTransfer.PermitTransferFrom memory permit = ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({token: address(token), amount: AMOUNT}),
            nonce: 42,
            deadline: block.timestamp + 3600
        });
        bytes memory signature = abi.encodePacked(bytes32(uint256(1)), bytes32(uint256(2)), uint8(27));
        bytes memory collectorData = abi.encode(permit, signature);

        uint256 bitmapBefore = mockPermit2.nonceBitmap(payer, 0);
        assertEq(bitmapBefore, 0);

        collector.collect(payer, address(token), AMOUNT, keccak256("ch"), address(this), collectorData);

        uint256 bitmapAfter = mockPermit2.nonceBitmap(payer, 0);
        assertGt(bitmapAfter, 0);
    }

    function test_collect_revert_onlySettlement() public {
        bytes memory collectorData = abi.encode(
            ISignatureTransfer.PermitTransferFrom({
                permitted: ISignatureTransfer.TokenPermissions({token: address(token), amount: AMOUNT}),
                nonce: 0,
                deadline: block.timestamp + 3600
            }),
            hex"dead"
        );

        vm.prank(makeAddr("attacker"));
        vm.expectRevert(DepositCollector.OnlySettlement.selector);
        collector.collect(payer, address(token), AMOUNT, keccak256("ch"), address(this), collectorData);
    }
}
