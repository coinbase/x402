// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {BaseTest} from "./BaseTest.sol";
import {IDeferredPaymentEscrow} from "../src/IDeferredPaymentEscrow.sol";

contract ViewFunctionTest is BaseTest {
    // ============ VIEW FUNCTION TESTS ============

    function test_GetOutstandingAndCollectableAmount() public {
        uint256 depositAmount = 1000e18;
        uint256 voucherAmount = 2000e18;

        vm.prank(buyerFromPrivateKey);
        escrow.deposit(seller, address(usdc), depositAmount);

        IDeferredPaymentEscrow.Voucher memory voucher = createVoucher(
            VOUCHER_ID, buyerFromPrivateKey, seller, voucherAmount, address(usdc), voucherTimestamp, 1, voucherExpiry
        );

        (uint256 outstanding, uint256 collectable) = escrow.getOutstandingAndCollectableAmount(voucher);
        assertEq(outstanding, voucherAmount); // Full voucher amount is outstanding
        assertEq(collectable, depositAmount); // Limited by balance
    }

    function test_GetOutstandingAndCollectableAmount_PartialBalance() public {
        uint256 depositAmount = 500e18;
        uint256 voucherAmount = 1000e18;

        // Deposit partial amount
        vm.prank(buyerFromPrivateKey);
        escrow.deposit(seller, address(usdc), depositAmount);

        IDeferredPaymentEscrow.Voucher memory voucher = createVoucher(
            VOUCHER_ID, buyerFromPrivateKey, seller, voucherAmount, address(usdc), voucherTimestamp, 1, voucherExpiry
        );

        (uint256 outstanding, uint256 collectable) = escrow.getOutstandingAndCollectableAmount(voucher);
        assertEq(outstanding, voucherAmount);
        assertEq(collectable, depositAmount); // Limited by available balance
    }

    function test_GetOutstandingAndCollectableAmount_FullyCollected() public {
        uint256 depositAmount = 1000e18;

        // Deposit and collect
        vm.prank(buyerFromPrivateKey);
        escrow.deposit(seller, address(usdc), depositAmount);

        IDeferredPaymentEscrow.Voucher memory voucher = createVoucher(
            VOUCHER_ID, buyerFromPrivateKey, seller, VOUCHER_VALUE, address(usdc), voucherTimestamp, 1, voucherExpiry
        );

        bytes memory signature = signVoucher(voucher, buyerPrivateKey);

        vm.prank(seller);
        escrow.collect(voucher, signature);

        // Check after collection
        (uint256 outstanding, uint256 collectable) = escrow.getOutstandingAndCollectableAmount(voucher);
        assertEq(outstanding, 0);
        assertEq(collectable, 0);
    }

    function test_IsSignatureValid() public {
        IDeferredPaymentEscrow.Voucher memory voucher = createVoucher(
            VOUCHER_ID, buyerFromPrivateKey, seller, VOUCHER_VALUE, address(usdc), voucherTimestamp, 1, voucherExpiry
        );

        bytes memory signature = signVoucher(voucher, buyerPrivateKey);
        assertTrue(escrow.isVoucherSignatureValid(voucher, signature));

        bytes memory invalidSignature = abi.encodePacked(uint256(123), uint256(456), uint8(27));
        assertFalse(escrow.isVoucherSignatureValid(voucher, invalidSignature));
    }

    function test_AlternativeViewFunctions() public {
        // Test all the signature validation functions
        IDeferredPaymentEscrow.Voucher memory voucher = createVoucher(
            VOUCHER_ID, buyerFromPrivateKey, seller, VOUCHER_VALUE, address(usdc), voucherTimestamp, 1, voucherExpiry
        );

        bytes memory voucherSignature = signVoucher(voucher, buyerPrivateKey);
        assertTrue(escrow.isVoucherSignatureValid(voucher, voucherSignature));

        // Test deposit authorization validation
        IDeferredPaymentEscrow.DepositAuthorization memory depositAuth = IDeferredPaymentEscrow.DepositAuthorization({
            buyer: buyerFromPrivateKey,
            seller: seller,
            asset: address(usdc),
            amount: 1000e6,
            nonce: keccak256("deposit-nonce"),
            expiry: voucherExpiry
        });

        bytes memory depositSignature = signDepositAuthorization(depositAuth, buyerPrivateKey);
        assertTrue(escrow.isDepositAuthorizationValid(depositAuth, depositSignature));

        // Test flush authorization validation
        IDeferredPaymentEscrow.FlushAuthorization memory flushAuth = IDeferredPaymentEscrow.FlushAuthorization({
            buyer: buyerFromPrivateKey,
            seller: seller,
            asset: address(usdc),
            nonce: keccak256("flush-nonce"),
            expiry: voucherExpiry
        });

        bytes memory flushSignature = signFlushAuthorization(flushAuth, buyerPrivateKey);
        assertTrue(escrow.isFlushAuthorizationValid(flushAuth, flushSignature));

        // Test flush all authorization validation
        IDeferredPaymentEscrow.FlushAllAuthorization memory flushAllAuth = IDeferredPaymentEscrow.FlushAllAuthorization({
            buyer: buyerFromPrivateKey,
            nonce: keccak256("flush-all-nonce"),
            expiry: voucherExpiry
        });

        bytes memory flushAllSignature = signFlushAllAuthorization(flushAllAuth, buyerPrivateKey);
        assertTrue(escrow.isFlushAllAuthorizationValid(flushAllAuth, flushAllSignature));
    }
}
