// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {BaseTest} from "./BaseTest.sol";
import {IDeferredPaymentEscrow} from "../src/IDeferredPaymentEscrow.sol";

contract VoucherCollectionTest is BaseTest {
    // ============ VOUCHER COLLECTION TESTS ============

    function test_Collect() public {
        uint256 depositAmount = 2000e18;
        uint256 collectAmount = 1000e18;

        // Deposit funds
        vm.prank(buyerFromPrivateKey);
        escrow.deposit(seller, address(usdc), depositAmount);

        // Create and sign voucher
        IDeferredPaymentEscrow.Voucher memory voucher = createVoucher(
            VOUCHER_ID, buyerFromPrivateKey, seller, collectAmount, address(usdc), voucherTimestamp, 1, voucherExpiry
        );

        bytes memory signature = signVoucher(voucher, buyerPrivateKey);

        vm.expectEmit(true, true, true, true);
        emit VoucherCollected(VOUCHER_ID, buyerFromPrivateKey, seller, address(usdc), collectAmount, collectAmount);

        uint256 sellerBalanceBefore = usdc.balanceOf(seller);

        vm.prank(seller);
        escrow.collect(voucher, signature);

        assertEq(usdc.balanceOf(seller), sellerBalanceBefore + collectAmount); // Seller gets full amount
        assertEq(escrow.getVoucherCollected(buyerFromPrivateKey, seller, address(usdc), VOUCHER_ID), collectAmount);
    }

    function test_Collect_AdjustsThawingAmount() public {
        uint256 depositAmount = 1000e18;
        uint256 thawAmount = 800e18;
        uint256 voucherAmount = 600e18;

        // Deposit funds
        vm.prank(buyerFromPrivateKey);
        escrow.deposit(seller, address(usdc), depositAmount);

        // Start thawing most of the funds
        vm.prank(buyerFromPrivateKey);
        escrow.thaw(seller, address(usdc), thawAmount);

        // Create voucher that will bring balance below thawing amount
        IDeferredPaymentEscrow.Voucher memory voucher = createVoucher(
            VOUCHER_ID, buyerFromPrivateKey, seller, voucherAmount, address(usdc), voucherTimestamp, 1, voucherExpiry
        );

        bytes memory signature = signVoucher(voucher, buyerPrivateKey);

        // Collect
        vm.prank(seller);
        escrow.collect(voucher, signature);

        // Check that thawing amount was adjusted down
        IDeferredPaymentEscrow.EscrowAccount memory accountAfter =
            escrow.getAccount(buyerFromPrivateKey, seller, address(usdc));
        assertEq(accountAfter.balance, 400e18); // 1000e18 - 600e18
        assertEq(accountAfter.thawingAmount, 400e18); // Adjusted down to match balance
    }

    function test_Collect_FullBalanceAvailableDuringThaw() public {
        uint256 depositAmount = 1000e18;
        uint256 thawAmount = 800e18;
        uint256 voucherAmount = 900e18; // More than thawing amount

        // Deposit funds
        vm.prank(buyerFromPrivateKey);
        escrow.deposit(seller, address(usdc), depositAmount);

        // Start thawing most of the funds
        vm.prank(buyerFromPrivateKey);
        escrow.thaw(seller, address(usdc), thawAmount);

        // Verify initial state - balance unchanged, thawing active
        IDeferredPaymentEscrow.EscrowAccount memory accountBefore =
            escrow.getAccount(buyerFromPrivateKey, seller, address(usdc));
        assertEq(accountBefore.balance, 1000e18);
        assertEq(accountBefore.thawingAmount, 800e18);

        // Create voucher for amount greater than thawing (but less than balance)
        IDeferredPaymentEscrow.Voucher memory voucher = createVoucher(
            VOUCHER_ID, buyerFromPrivateKey, seller, voucherAmount, address(usdc), voucherTimestamp, 1, voucherExpiry
        );

        bytes memory signature = signVoucher(voucher, buyerPrivateKey);

        // Collect should succeed - full balance is available
        vm.prank(seller);
        escrow.collect(voucher, signature);

        // Verify collection succeeded and thawing was adjusted
        IDeferredPaymentEscrow.EscrowAccount memory accountAfter =
            escrow.getAccount(buyerFromPrivateKey, seller, address(usdc));
        assertEq(accountAfter.balance, 100e18); // 1000e18 - 900e18
        assertEq(accountAfter.thawingAmount, 100e18); // Adjusted to match remaining balance
        assertEq(escrow.getVoucherCollected(buyerFromPrivateKey, seller, address(usdc), VOUCHER_ID), voucherAmount);
    }

    function test_Collect_PartialCollection() public {
        uint256 depositAmount = 500e18;
        uint256 voucherAmount = 1000e18;

        // Deposit less than voucher amount
        vm.prank(buyerFromPrivateKey);
        escrow.deposit(seller, address(usdc), depositAmount);

        IDeferredPaymentEscrow.Voucher memory voucher = createVoucher(
            VOUCHER_ID, buyerFromPrivateKey, seller, voucherAmount, address(usdc), voucherTimestamp, 1, voucherExpiry
        );

        bytes memory signature = signVoucher(voucher, buyerPrivateKey);

        // Should only collect the available balance
        vm.expectEmit(true, true, true, true);
        emit VoucherCollected(VOUCHER_ID, buyerFromPrivateKey, seller, address(usdc), depositAmount, depositAmount);

        vm.prank(seller);
        escrow.collect(voucher, signature);

        assertEq(escrow.getVoucherCollected(buyerFromPrivateKey, seller, address(usdc), VOUCHER_ID), depositAmount);
        assertEq(escrow.getAccount(buyerFromPrivateKey, seller, address(usdc)).balance, 0);
    }

    function test_Collect_PermissionlessCollection() public {
        uint256 depositAmount = 1000e18;

        // Deposit funds
        vm.prank(buyerFromPrivateKey);
        escrow.deposit(seller, address(usdc), depositAmount);

        IDeferredPaymentEscrow.Voucher memory voucher = createVoucher(
            VOUCHER_ID, buyerFromPrivateKey, seller, VOUCHER_VALUE, address(usdc), voucherTimestamp, 1, voucherExpiry
        );

        bytes memory signature = signVoucher(voucher, buyerPrivateKey);

        // Anyone can collect on behalf of the seller
        address randomUser = makeAddr("randomUser");
        vm.prank(randomUser);
        escrow.collect(voucher, signature);

        // Seller still gets the funds
        assertEq(usdc.balanceOf(seller), VOUCHER_VALUE);
        assertEq(escrow.getVoucherCollected(buyerFromPrivateKey, seller, address(usdc), VOUCHER_ID), VOUCHER_VALUE);
    }

    function test_Collect_IdempotentBehavior() public {
        uint256 depositAmount = 1000e18;

        // Deposit funds
        vm.prank(buyerFromPrivateKey);
        escrow.deposit(seller, address(usdc), depositAmount);

        IDeferredPaymentEscrow.Voucher memory voucher = createVoucher(
            VOUCHER_ID, buyerFromPrivateKey, seller, VOUCHER_VALUE, address(usdc), voucherTimestamp, 1, voucherExpiry
        );

        bytes memory signature = signVoucher(voucher, buyerPrivateKey);

        // First collection
        vm.prank(seller);
        escrow.collect(voucher, signature);

        uint256 sellerBalanceAfterFirst = usdc.balanceOf(seller);

        // Second collection - should emit VoucherAlreadyCollected and do nothing
        vm.expectEmit(true, true, true, true);
        emit VoucherAlreadyCollected(VOUCHER_ID, buyerFromPrivateKey, seller, address(usdc), VOUCHER_VALUE);

        vm.prank(seller);
        escrow.collect(voucher, signature);

        // No additional transfer
        assertEq(usdc.balanceOf(seller), sellerBalanceAfterFirst);
    }

    function test_CollectMany_IdempotentBehavior() public {
        uint256 depositAmount = 2000e18;

        // Deposit funds
        vm.prank(buyerFromPrivateKey);
        escrow.deposit(seller, address(usdc), depositAmount);

        // Create multiple vouchers
        bytes32 voucher1Id = keccak256("voucher-1");
        bytes32 voucher2Id = keccak256("voucher-2");

        IDeferredPaymentEscrow.Voucher memory voucher1 = createVoucher(
            voucher1Id, buyerFromPrivateKey, seller, 800e18, address(usdc), voucherTimestamp, 1, voucherExpiry
        );
        IDeferredPaymentEscrow.Voucher memory voucher2 = createVoucher(
            voucher2Id, buyerFromPrivateKey, seller, 700e18, address(usdc), voucherTimestamp, 2, voucherExpiry
        );

        IDeferredPaymentEscrow.SignedVoucher[] memory signedVouchers = new IDeferredPaymentEscrow.SignedVoucher[](2);
        signedVouchers[0] =
            IDeferredPaymentEscrow.SignedVoucher({voucher: voucher1, signature: signVoucher(voucher1, buyerPrivateKey)});
        signedVouchers[1] =
            IDeferredPaymentEscrow.SignedVoucher({voucher: voucher2, signature: signVoucher(voucher2, buyerPrivateKey)});

        // First batch collection
        vm.prank(seller);
        escrow.collectMany(signedVouchers);

        uint256 sellerBalanceAfterFirst = usdc.balanceOf(seller);

        // Second batch collection - should be idempotent
        vm.prank(seller);
        escrow.collectMany(signedVouchers);

        // No additional transfer
        assertEq(usdc.balanceOf(seller), sellerBalanceAfterFirst);
    }

    // ============ COLLECTION VALIDATION TESTS ============

    function test_Collect_ExpiredVoucher() public {
        // Deposit funds
        vm.prank(buyerFromPrivateKey);
        escrow.deposit(seller, address(usdc), 1000e18);

        // Create expired voucher
        IDeferredPaymentEscrow.Voucher memory expiredVoucher = createVoucher(
            VOUCHER_ID,
            buyerFromPrivateKey,
            seller,
            VOUCHER_VALUE,
            address(usdc),
            voucherTimestamp,
            1,
            uint64(block.timestamp - 1) // Already expired
        );

        bytes memory signature = signVoucher(expiredVoucher, buyerPrivateKey);

        vm.prank(seller);
        vm.expectRevert(
            abi.encodeWithSelector(
                IDeferredPaymentEscrow.VoucherExpired.selector, VOUCHER_ID, block.timestamp, expiredVoucher.expiry
            )
        );
        escrow.collect(expiredVoucher, signature);
    }

    function test_Collect_InvalidSignature() public {
        // Deposit funds
        vm.prank(buyerFromPrivateKey);
        escrow.deposit(seller, address(usdc), 1000e18);

        IDeferredPaymentEscrow.Voucher memory voucher = createVoucher(
            VOUCHER_ID, buyerFromPrivateKey, seller, VOUCHER_VALUE, address(usdc), voucherTimestamp, 1, voucherExpiry
        );

        // Wrong signature
        bytes memory wrongSignature = hex"1234567890abcdef";

        vm.prank(seller);
        vm.expectRevert(
            abi.encodeWithSelector(IDeferredPaymentEscrow.InvalidSignature.selector, VOUCHER_ID, buyerFromPrivateKey)
        );
        escrow.collect(voucher, wrongSignature);
    }

    function test_CollectMany_EmptyVouchers() public {
        IDeferredPaymentEscrow.SignedVoucher[] memory emptyVouchers = new IDeferredPaymentEscrow.SignedVoucher[](0);

        vm.prank(seller);
        vm.expectRevert(IDeferredPaymentEscrow.NoVouchersProvided.selector);
        escrow.collectMany(emptyVouchers);
    }

    function test_Collect_InvalidVoucherBuyer() public {
        IDeferredPaymentEscrow.Voucher memory voucher = createVoucher(
            VOUCHER_ID, address(0), seller, VOUCHER_VALUE, address(usdc), voucherTimestamp, 1, voucherExpiry
        );

        bytes memory signature = signVoucher(voucher, buyerPrivateKey);

        vm.expectRevert(abi.encodeWithSelector(IDeferredPaymentEscrow.InvalidAddress.selector, address(0)));
        escrow.collect(voucher, signature);
    }

    function test_Collect_InvalidVoucherAsset() public {
        IDeferredPaymentEscrow.Voucher memory voucher = createVoucher(
            VOUCHER_ID, buyerFromPrivateKey, seller, VOUCHER_VALUE, address(0), voucherTimestamp, 1, voucherExpiry
        );

        bytes memory signature = signVoucher(voucher, buyerPrivateKey);

        vm.expectRevert(abi.encodeWithSelector(IDeferredPaymentEscrow.InvalidAsset.selector, address(0)));
        escrow.collect(voucher, signature);
    }

    function test_Collect_ZeroVoucherValue() public {
        IDeferredPaymentEscrow.Voucher memory voucher =
            createVoucher(VOUCHER_ID, buyerFromPrivateKey, seller, 0, address(usdc), voucherTimestamp, 1, voucherExpiry);

        bytes memory signature = signVoucher(voucher, buyerPrivateKey);

        vm.expectRevert(abi.encodeWithSelector(IDeferredPaymentEscrow.InvalidAmount.selector, 0));
        escrow.collect(voucher, signature);
    }

    function test_Collect_ZeroFundsAvailable() public {
        // Don't deposit any funds, just try to collect
        IDeferredPaymentEscrow.Voucher memory voucher = createVoucher(
            VOUCHER_ID, buyerFromPrivateKey, seller, VOUCHER_VALUE, address(usdc), voucherTimestamp, 1, voucherExpiry
        );

        bytes memory signature = signVoucher(voucher, buyerPrivateKey);

        vm.expectEmit(true, true, true, true);
        emit VoucherNoCollectableBalance(VOUCHER_ID, buyerFromPrivateKey, seller, address(usdc), VOUCHER_VALUE, 0);

        vm.prank(seller);
        escrow.collect(voucher, signature);

        // No funds should be transferred
        assertEq(usdc.balanceOf(seller), 0);
        assertEq(escrow.getVoucherCollected(buyerFromPrivateKey, seller, address(usdc), VOUCHER_ID), 0);
    }

    function test_Collect_PartialThenZeroBalance() public {
        uint256 depositAmount = 500e18;
        uint256 voucherAmount = 1000e18;

        // Deposit partial amount
        vm.prank(buyerFromPrivateKey);
        escrow.deposit(seller, address(usdc), depositAmount);

        IDeferredPaymentEscrow.Voucher memory voucher = createVoucher(
            VOUCHER_ID, buyerFromPrivateKey, seller, voucherAmount, address(usdc), voucherTimestamp, 1, voucherExpiry
        );

        bytes memory signature = signVoucher(voucher, buyerPrivateKey);

        // First collection - partial
        vm.expectEmit(true, true, true, true);
        emit VoucherCollected(VOUCHER_ID, buyerFromPrivateKey, seller, address(usdc), depositAmount, depositAmount);

        vm.prank(seller);
        escrow.collect(voucher, signature);

        // Second collection attempt - should emit NoCollectableBalance
        vm.expectEmit(true, true, true, true);
        emit VoucherNoCollectableBalance(VOUCHER_ID, buyerFromPrivateKey, seller, address(usdc), 500e18, depositAmount);

        vm.prank(seller);
        escrow.collect(voucher, signature);

        // Verify state
        assertEq(escrow.getVoucherCollected(buyerFromPrivateKey, seller, address(usdc), VOUCHER_ID), depositAmount);
        assertEq(escrow.getAccount(buyerFromPrivateKey, seller, address(usdc)).balance, 0);
    }
}
