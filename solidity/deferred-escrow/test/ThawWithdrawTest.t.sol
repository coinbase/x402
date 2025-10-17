// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {BaseTest} from "./BaseTest.sol";
import {IDeferredPaymentEscrow} from "../src/IDeferredPaymentEscrow.sol";

contract ThawWithdrawTest is BaseTest {
    // ============ THAWING TESTS ============

    function test_Thaw() public {
        uint256 depositAmount = 1000e6;
        uint256 thawAmount = 500e6;

        // First deposit
        vm.prank(buyer);
        escrow.deposit(seller, address(usdc), depositAmount);

        // Then thaw
        vm.expectEmit(true, true, true, true);
        emit ThawInitiated(
            buyer,
            seller,
            address(usdc),
            thawAmount,
            0, // previousThawingAmount
            uint256(block.timestamp + THAWING_PERIOD),
            0 // previousThawEndTime
        );

        vm.prank(buyer);
        escrow.thaw(seller, address(usdc), thawAmount);

        IDeferredPaymentEscrow.EscrowAccount memory account = escrow.getAccount(buyer, seller, address(usdc));
        assertEq(account.balance, depositAmount); // Balance unchanged in new model
        assertEq(account.thawingAmount, thawAmount);
        assertEq(account.thawEndTime, block.timestamp + THAWING_PERIOD);
    }

    function test_Thaw_InsufficientBalance() public {
        uint256 depositAmount = 1000e6;
        uint256 thawAmount = 2000e6;

        vm.prank(buyer);
        escrow.deposit(seller, address(usdc), depositAmount);

        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(IDeferredPaymentEscrow.InsufficientBalance.selector, 1000e6, 2000e6));
        escrow.thaw(seller, address(usdc), thawAmount);
    }

    function test_Thaw_IncreaseAmount() public {
        uint256 depositAmount = 1000e6;
        uint256 firstThawAmount = 300e6;
        uint256 additionalThawAmount = 200e6;
        uint256 totalThawAmount = 500e6;

        vm.prank(buyer);
        escrow.deposit(seller, address(usdc), depositAmount);

        // First thaw
        vm.prank(buyer);
        escrow.thaw(seller, address(usdc), firstThawAmount);

        uint256 firstThawEndTime = block.timestamp + THAWING_PERIOD;

        // Move forward in time
        vm.warp(block.timestamp + 100);

        // Second thaw should increase amount and reset timer
        vm.expectEmit(true, true, true, true);
        emit ThawInitiated(
            buyer,
            seller,
            address(usdc),
            totalThawAmount,
            firstThawAmount,
            uint256(vm.getBlockTimestamp() + THAWING_PERIOD), // Use vm.getBlockTimestamp() with --via-ir
            firstThawEndTime
        );

        vm.prank(buyer);
        escrow.thaw(seller, address(usdc), additionalThawAmount);

        IDeferredPaymentEscrow.EscrowAccount memory account = escrow.getAccount(buyer, seller, address(usdc));
        assertEq(account.balance, depositAmount);
        assertEq(account.thawingAmount, totalThawAmount);
        assertEq(account.thawEndTime, 101 + THAWING_PERIOD); // Timer reset after warp to timestamp 101
    }

    function test_Thaw_IncreaseAmount_InsufficientBalance() public {
        uint256 depositAmount = 1000e6;
        uint256 firstThawAmount = 700e6;
        uint256 additionalThawAmount = 400e6; // Would total 1100e6, exceeding balance

        vm.prank(buyer);
        escrow.deposit(seller, address(usdc), depositAmount);

        // First thaw
        vm.prank(buyer);
        escrow.thaw(seller, address(usdc), firstThawAmount);

        // Second thaw should revert due to insufficient balance
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(IDeferredPaymentEscrow.InsufficientBalance.selector, 1000e6, 1100e6));
        escrow.thaw(seller, address(usdc), additionalThawAmount);
    }

    function test_CancelThaw() public {
        uint256 depositAmount = 1000e6;
        uint256 thawAmount = 500e6;

        vm.prank(buyer);
        escrow.deposit(seller, address(usdc), depositAmount);

        vm.prank(buyer);
        escrow.thaw(seller, address(usdc), thawAmount);

        vm.prank(buyer);
        escrow.cancelThaw(seller, address(usdc));

        IDeferredPaymentEscrow.EscrowAccount memory account = escrow.getAccount(buyer, seller, address(usdc));
        assertEq(account.balance, depositAmount);
        assertEq(account.thawingAmount, 0);
        assertEq(account.thawEndTime, 0);
    }

    function test_Withdraw() public {
        uint256 depositAmount = 1000e6;
        uint256 thawAmount = 500e6;

        vm.prank(buyer);
        escrow.deposit(seller, address(usdc), depositAmount);

        vm.prank(buyer);
        escrow.thaw(seller, address(usdc), thawAmount);

        // Fast forward past thawing period
        vm.warp(block.timestamp + THAWING_PERIOD + 1);

        uint256 balanceBefore = usdc.balanceOf(buyer);

        vm.prank(buyer);
        escrow.withdraw(seller, address(usdc));

        assertEq(usdc.balanceOf(buyer), balanceBefore + thawAmount);

        IDeferredPaymentEscrow.EscrowAccount memory account = escrow.getAccount(buyer, seller, address(usdc));
        assertEq(account.balance, depositAmount - thawAmount);
        assertEq(account.thawingAmount, 0);
        assertEq(account.thawEndTime, 0);
    }

    function test_Withdraw_ThawingNotCompleted() public {
        uint256 depositAmount = 1000e6;
        uint256 thawAmount = 500e6;

        vm.prank(buyer);
        escrow.deposit(seller, address(usdc), depositAmount);

        vm.prank(buyer);
        escrow.thaw(seller, address(usdc), thawAmount);

        uint256 thawEndTime = block.timestamp + THAWING_PERIOD;

        // Try to withdraw before thawing period completes
        vm.prank(buyer);
        vm.expectRevert(
            abi.encodeWithSelector(
                IDeferredPaymentEscrow.ThawingPeriodNotCompleted.selector, block.timestamp, thawEndTime
            )
        );
        escrow.withdraw(seller, address(usdc));
    }

    // ============ INPUT VALIDATION TESTS ============

    function test_Thaw_InvalidSeller() public {
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(IDeferredPaymentEscrow.InvalidAddress.selector, address(0)));
        escrow.thaw(address(0), address(usdc), 1000e6);
    }

    function test_Thaw_InvalidAsset() public {
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(IDeferredPaymentEscrow.InvalidAsset.selector, address(0)));
        escrow.thaw(seller, address(0), 1000e6);
    }

    function test_Thaw_ZeroAmount() public {
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(IDeferredPaymentEscrow.InvalidAmount.selector, 0));
        escrow.thaw(seller, address(usdc), 0);
    }

    function test_CancelThaw_InvalidSeller() public {
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(IDeferredPaymentEscrow.InvalidAddress.selector, address(0)));
        escrow.cancelThaw(address(0), address(usdc));
    }

    function test_CancelThaw_InvalidAsset() public {
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(IDeferredPaymentEscrow.InvalidAsset.selector, address(0)));
        escrow.cancelThaw(seller, address(0));
    }

    function test_Withdraw_InvalidSeller() public {
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(IDeferredPaymentEscrow.InvalidAddress.selector, address(0)));
        escrow.withdraw(address(0), address(usdc));
    }

    function test_Withdraw_InvalidAsset() public {
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(IDeferredPaymentEscrow.InvalidAsset.selector, address(0)));
        escrow.withdraw(seller, address(0));
    }

    // ============ FLUSH AUTHORIZATION TESTS ============

    function test_FlushWithAuthorization_WithdrawReady() public {
        uint256 depositAmount = 1000e6;
        bytes32 nonce = keccak256("flush-nonce-1");

        // Setup: deposit and thaw funds using buyerFromPrivateKey
        vm.startPrank(buyerFromPrivateKey);
        escrow.deposit(seller, address(usdc), depositAmount);
        escrow.thaw(seller, address(usdc), depositAmount);
        vm.stopPrank();

        // Warp to after thawing period
        vm.warp(block.timestamp + THAWING_PERIOD + 1);

        // Set expiry AFTER warping to avoid expiry issues
        uint64 expiry = uint64(block.timestamp + 1 hours);

        // Create flush authorization
        IDeferredPaymentEscrow.FlushAuthorization memory auth = IDeferredPaymentEscrow.FlushAuthorization({
            buyer: buyerFromPrivateKey,
            seller: seller,
            asset: address(usdc),
            nonce: nonce,
            expiry: expiry
        });

        // Sign with buyer's private key using helper
        bytes memory signature = signFlushAuthorization(auth, buyerPrivateKey);

        // Execute flush - should withdraw
        uint256 balanceBefore = usdc.balanceOf(buyerFromPrivateKey);

        // Expect both Withdrawn and FlushAuthorized events
        vm.expectEmit(true, true, true, true);
        emit Withdrawn(buyerFromPrivateKey, seller, address(usdc), depositAmount, 0);
        vm.expectEmit(true, true, true, false);
        emit FlushAuthorized(buyerFromPrivateKey, seller, address(usdc), nonce, false); // false = no thawing

        escrow.flushWithAuthorization(auth, signature);

        // Verify funds were withdrawn
        assertEq(usdc.balanceOf(buyerFromPrivateKey), balanceBefore + depositAmount);
        IDeferredPaymentEscrow.EscrowAccount memory account =
            escrow.getAccount(buyerFromPrivateKey, seller, address(usdc));
        assertEq(account.balance, 0);
        assertEq(account.thawingAmount, 0);
    }

    function test_FlushWithAuthorization_NonceReplayReverts() public {
        uint256 depositAmount = 1000e6;
        bytes32 nonce = keccak256("flush-nonce-replay");
        uint64 expiry = uint64(block.timestamp + 1 hours);

        // Setup: deposit funds
        vm.prank(buyerFromPrivateKey);
        escrow.deposit(seller, address(usdc), depositAmount);

        // Create flush authorization
        IDeferredPaymentEscrow.FlushAuthorization memory auth = IDeferredPaymentEscrow.FlushAuthorization({
            buyer: buyerFromPrivateKey,
            seller: seller,
            asset: address(usdc),
            nonce: nonce,
            expiry: expiry
        });

        // Sign authorization
        bytes memory signature = signFlushAuthorization(auth, buyerPrivateKey);

        // Execute first flush
        escrow.flushWithAuthorization(auth, signature);

        // Try to replay the same authorization
        vm.expectRevert(abi.encodeWithSelector(IDeferredPaymentEscrow.NonceAlreadyUsed.selector, nonce));
        escrow.flushWithAuthorization(auth, signature);
    }

    function test_FlushWithAuthorization_ThawNotReady() public {
        uint256 depositAmount = 1000e6;
        bytes32 nonce = keccak256("flush-nonce-2");
        uint64 expiry = uint64(block.timestamp + 1 hours);

        // Setup: deposit funds (not thawed)
        vm.prank(buyerFromPrivateKey);
        escrow.deposit(seller, address(usdc), depositAmount);

        // Create flush authorization
        IDeferredPaymentEscrow.FlushAuthorization memory auth = IDeferredPaymentEscrow.FlushAuthorization({
            buyer: buyerFromPrivateKey,
            seller: seller,
            asset: address(usdc),
            nonce: nonce,
            expiry: expiry
        });

        // Sign with buyer's private key
        bytes memory signature = signFlushAuthorization(auth, buyerPrivateKey);

        // Execute flush - should initiate thaw
        vm.expectEmit(true, true, true, false);
        emit FlushAuthorized(buyerFromPrivateKey, seller, address(usdc), nonce, true); // true = thawing initiated

        escrow.flushWithAuthorization(auth, signature);

        // Verify thaw was initiated
        IDeferredPaymentEscrow.EscrowAccount memory account =
            escrow.getAccount(buyerFromPrivateKey, seller, address(usdc));
        assertEq(account.balance, depositAmount);
        assertEq(account.thawingAmount, depositAmount);
        assert(account.thawEndTime > block.timestamp);
    }

    function test_FlushAllWithAuthorization_EmptyAccountSet() public {
        bytes32 nonce = keccak256("flush-all-empty");
        uint64 expiry = uint64(block.timestamp + 1 hours);

        // Create flush all authorization without any accounts
        IDeferredPaymentEscrow.FlushAllAuthorization memory auth =
            IDeferredPaymentEscrow.FlushAllAuthorization({buyer: buyerFromPrivateKey, nonce: nonce, expiry: expiry});

        // Sign authorization
        bytes memory signature = signFlushAllAuthorization(auth, buyerPrivateKey);

        // Execute flush all - should work but do nothing
        vm.expectEmit(true, false, false, true);
        emit FlushAllAuthorized(buyerFromPrivateKey, nonce, 0); // 0 accounts flushed

        escrow.flushAllWithAuthorization(auth, signature);
    }

    function test_FlushAllWithAuthorization_NonceReplayReverts() public {
        uint256 depositAmount = 1000e6;
        bytes32 nonce = keccak256("flush-all-replay");
        uint64 expiry = uint64(block.timestamp + 1 hours);

        // Setup: deposit funds
        vm.prank(buyerFromPrivateKey);
        escrow.deposit(seller, address(usdc), depositAmount);

        // Create flush all authorization
        IDeferredPaymentEscrow.FlushAllAuthorization memory auth =
            IDeferredPaymentEscrow.FlushAllAuthorization({buyer: buyerFromPrivateKey, nonce: nonce, expiry: expiry});

        // Sign authorization
        bytes memory signature = signFlushAllAuthorization(auth, buyerPrivateKey);

        // Execute first flush all
        escrow.flushAllWithAuthorization(auth, signature);

        // Try to replay the same authorization
        vm.expectRevert(abi.encodeWithSelector(IDeferredPaymentEscrow.NonceAlreadyUsed.selector, nonce));
        escrow.flushAllWithAuthorization(auth, signature);
    }

    function test_FlushWithAuthorization_Idempotent() public {
        uint256 depositAmount = 1000e6;
        bytes32 nonce = keccak256("flush-idempotent");

        // Setup: deposit and thaw funds
        vm.startPrank(buyerFromPrivateKey);
        escrow.deposit(seller, address(usdc), depositAmount);
        escrow.thaw(seller, address(usdc), depositAmount);
        vm.stopPrank();

        // Warp to after thawing period
        vm.warp(block.timestamp + THAWING_PERIOD + 1);

        // Set expiry AFTER warping to avoid expiry issues
        uint64 expiry = uint64(block.timestamp + 1 hours);

        // Create flush authorization with updated expiry
        IDeferredPaymentEscrow.FlushAuthorization memory auth = IDeferredPaymentEscrow.FlushAuthorization({
            buyer: buyerFromPrivateKey,
            seller: seller,
            asset: address(usdc),
            nonce: nonce,
            expiry: expiry
        });

        bytes memory signature = signFlushAuthorization(auth, buyerPrivateKey);

        // First flush - should withdraw
        escrow.flushWithAuthorization(auth, signature);

        // Second flush with same nonce should fail (nonce replay protection)
        vm.expectRevert(abi.encodeWithSelector(IDeferredPaymentEscrow.NonceAlreadyUsed.selector, nonce));
        escrow.flushWithAuthorization(auth, signature);
    }

    function test_FlushAllWithAuthorization_MultipleAccounts() public {
        bytes32 nonce = keccak256("flush-all-nonce-1");

        // Setup multiple escrow accounts
        address seller2 = makeAddr("seller2");
        vm.startPrank(buyerFromPrivateKey);
        escrow.deposit(seller, address(usdc), 1000e6);
        escrow.deposit(seller2, address(usdc), 500e6);
        escrow.deposit(seller, address(usdt), 800e6); // Different asset

        // Thaw some funds
        escrow.thaw(seller, address(usdc), 1000e6);
        vm.stopPrank();

        // Warp to after thawing
        vm.warp(block.timestamp + THAWING_PERIOD + 1);

        // Set expiry AFTER warping to avoid expiry issues
        uint64 expiry = uint64(block.timestamp + 1 hours);

        // Create flush all authorization
        IDeferredPaymentEscrow.FlushAllAuthorization memory auth =
            IDeferredPaymentEscrow.FlushAllAuthorization({buyer: buyerFromPrivateKey, nonce: nonce, expiry: expiry});

        // Sign with buyer's private key
        bytes memory signature = signFlushAllAuthorization(auth, buyerPrivateKey);

        // Execute flush all
        uint256 usdcBalanceBefore = usdc.balanceOf(buyerFromPrivateKey);
        vm.expectEmit(true, false, false, true);
        emit FlushAllAuthorized(buyerFromPrivateKey, nonce, 3); // 3 accounts affected

        escrow.flushAllWithAuthorization(auth, signature);

        // Verify results
        assertEq(usdc.balanceOf(buyerFromPrivateKey), usdcBalanceBefore + 1000e6); // Withdrawn from ready account

        // Check that other accounts had thawing initiated
        IDeferredPaymentEscrow.EscrowAccount memory account2 =
            escrow.getAccount(buyerFromPrivateKey, seller2, address(usdc));
        assertEq(account2.thawingAmount, 500e6); // Should have thaw initiated

        IDeferredPaymentEscrow.EscrowAccount memory account3 =
            escrow.getAccount(buyerFromPrivateKey, seller, address(usdt));
        assertEq(account3.thawingAmount, 800e6); // Should have thaw initiated
    }

    function test_FlushWithAuthorization_WithdrawAndThaw() public {
        uint256 depositAmount = 1000e6;
        uint256 thawAmount = 400e6;
        bytes32 nonce = keccak256("flush-nonce-3");

        // Setup: deposit, partially thaw
        vm.startPrank(buyerFromPrivateKey);
        escrow.deposit(seller, address(usdc), depositAmount);
        escrow.thaw(seller, address(usdc), thawAmount);
        vm.stopPrank();

        // Warp to after thawing period
        vm.warp(block.timestamp + THAWING_PERIOD + 1);

        // Set expiry AFTER warping to avoid expiry issues
        uint64 expiry = uint64(block.timestamp + 1 hours);

        // Create flush authorization
        IDeferredPaymentEscrow.FlushAuthorization memory auth = IDeferredPaymentEscrow.FlushAuthorization({
            buyer: buyerFromPrivateKey,
            seller: seller,
            asset: address(usdc),
            nonce: nonce,
            expiry: expiry
        });

        // Sign with buyer's private key
        bytes memory signature = signFlushAuthorization(auth, buyerPrivateKey);

        // Execute flush - should withdraw ready funds AND thaw remaining
        uint256 balanceBefore = usdc.balanceOf(buyerFromPrivateKey);
        vm.expectEmit(true, true, true, false);
        emit FlushAuthorized(buyerFromPrivateKey, seller, address(usdc), nonce, true); // true = also thawed remaining

        escrow.flushWithAuthorization(auth, signature);

        // Verify: withdrew 400, thawed remaining 600
        assertEq(usdc.balanceOf(buyerFromPrivateKey), balanceBefore + thawAmount);
        IDeferredPaymentEscrow.EscrowAccount memory account =
            escrow.getAccount(buyerFromPrivateKey, seller, address(usdc));
        assertEq(account.balance, depositAmount - thawAmount);
        assertEq(account.thawingAmount, depositAmount - thawAmount);
    }

    function test_FlushWithAuthorization_ResetsThawTimer() public {
        uint256 depositAmount = 1000e6;
        uint256 thawAmount = 600e6;
        bytes32 nonce = keccak256("flush-reset-timer");

        // Setup: deposit and thaw funds
        vm.startPrank(buyerFromPrivateKey);
        escrow.deposit(seller, address(usdc), depositAmount);
        escrow.thaw(seller, address(usdc), thawAmount);
        vm.stopPrank();

        uint256 originalThawEndTime = escrow.getAccount(buyerFromPrivateKey, seller, address(usdc)).thawEndTime;

        // Wait some time but not full thawing period
        vm.warp(block.timestamp + THAWING_PERIOD / 2);

        // Set expiry
        uint64 expiry = uint64(block.timestamp + 1 hours);

        // Create flush authorization
        IDeferredPaymentEscrow.FlushAuthorization memory auth = IDeferredPaymentEscrow.FlushAuthorization({
            buyer: buyerFromPrivateKey,
            seller: seller,
            asset: address(usdc),
            nonce: nonce,
            expiry: expiry
        });

        // Sign authorization
        bytes memory signature = signFlushAuthorization(auth, buyerPrivateKey);

        // Execute flush - should thaw remaining balance and reset timer
        escrow.flushWithAuthorization(auth, signature);

        // Verify timer was reset
        IDeferredPaymentEscrow.EscrowAccount memory account =
            escrow.getAccount(buyerFromPrivateKey, seller, address(usdc));
        uint256 newThawEndTime = account.thawEndTime;

        // New timer should be later than original (reset to full period from current time)
        assert(newThawEndTime > originalThawEndTime);
        assertEq(account.thawingAmount, depositAmount); // All funds now thawing
    }

    function test_FlushAllWithAuthorization_MultipleAssets_ComplexScenario() public {
        bytes32 nonce = keccak256("flush-all-complex");

        // Setup complex scenario with multiple sellers and assets
        address seller2 = makeAddr("seller2");
        uint256 usdcAmount1 = 1000e6;
        uint256 usdcAmount2 = 500e6;
        uint256 usdtAmount = 800e6;

        vm.startPrank(buyerFromPrivateKey);
        escrow.deposit(seller, address(usdc), usdcAmount1);
        escrow.deposit(seller2, address(usdc), usdcAmount2);
        escrow.deposit(seller, address(usdt), usdtAmount);

        // Thaw funds from first account only
        escrow.thaw(seller, address(usdc), usdcAmount1);
        vm.stopPrank();

        // Warp to after thawing period
        vm.warp(block.timestamp + THAWING_PERIOD + 1);
        uint64 expiry = uint64(block.timestamp + 1 hours);

        // Create flush all authorization
        IDeferredPaymentEscrow.FlushAllAuthorization memory auth =
            IDeferredPaymentEscrow.FlushAllAuthorization({buyer: buyerFromPrivateKey, nonce: nonce, expiry: expiry});

        bytes memory signature = signFlushAllAuthorization(auth, buyerPrivateKey);

        // Execute flush all
        uint256 usdcBalanceBefore = usdc.balanceOf(buyerFromPrivateKey);
        uint256 usdtBalanceBefore = usdt.balanceOf(buyerFromPrivateKey);

        vm.expectEmit(true, false, false, true);
        emit FlushAllAuthorized(buyerFromPrivateKey, nonce, 3); // 3 accounts affected

        escrow.flushAllWithAuthorization(auth, signature);

        // Verify withdrawn from ready account
        assertEq(usdc.balanceOf(buyerFromPrivateKey), usdcBalanceBefore + usdcAmount1);
        assertEq(usdt.balanceOf(buyerFromPrivateKey), usdtBalanceBefore); // No withdrawal from USDT

        // Verify thawing initiated for other accounts
        IDeferredPaymentEscrow.EscrowAccount memory account2 =
            escrow.getAccount(buyerFromPrivateKey, seller2, address(usdc));
        assertEq(account2.thawingAmount, usdcAmount2);

        IDeferredPaymentEscrow.EscrowAccount memory account3 =
            escrow.getAccount(buyerFromPrivateKey, seller, address(usdt));
        assertEq(account3.thawingAmount, usdtAmount);
    }
}
