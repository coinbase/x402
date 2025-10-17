// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {BaseTest} from "./BaseTest.sol";
import {IDeferredPaymentEscrow} from "../src/IDeferredPaymentEscrow.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockNonStandardERC20} from "./mocks/MockNonStandardERC20.sol";

contract TokenCompatibilityTest is BaseTest {
    // ============ TOKEN COMPATIBILITY TESTS ============

    function test_DifferentTokenDecimals() public {
        // Create tokens with different decimals
        MockERC20 token6 = new MockERC20("USDC", "USDC", 6); // 6 decimals like real USDC
        MockERC20 token18 = new MockERC20("DAI", "DAI", 18); // 18 decimals like DAI
        MockERC20 token8 = new MockERC20("WBTC", "WBTC", 8); // 8 decimals like WBTC

        // Mint tokens with appropriate amounts for each decimal
        uint256 amount6 = 1000e6; // 1000 USDC
        uint256 amount18 = 500e18; // 500 DAI
        uint256 amount8 = 1e8; // 1 WBTC

        token6.mint(buyer, amount6);
        token18.mint(buyer, amount18);
        token8.mint(buyer, amount8);

        // Approve escrow
        vm.startPrank(buyer);
        token6.approve(address(escrow), amount6);
        token18.approve(address(escrow), amount18);
        token8.approve(address(escrow), amount8);

        // Deposit all tokens to same seller
        escrow.deposit(seller, address(token6), amount6);
        escrow.deposit(seller, address(token18), amount18);
        escrow.deposit(seller, address(token8), amount8);
        vm.stopPrank();

        // Verify all deposits
        assertEq(escrow.getAccount(buyer, seller, address(token6)).balance, amount6);
        assertEq(escrow.getAccount(buyer, seller, address(token18)).balance, amount18);
        assertEq(escrow.getAccount(buyer, seller, address(token8)).balance, amount8);

        // Create vouchers for each token
        bytes32 voucher6Id = keccak256("voucher-usdc");
        bytes32 voucher18Id = keccak256("voucher-dai");
        bytes32 voucher8Id = keccak256("voucher-wbtc");

        IDeferredPaymentEscrow.Voucher memory voucher6 =
            createVoucher(voucher6Id, buyer, seller, amount6, address(token6), voucherTimestamp, 1, voucherExpiry);
        IDeferredPaymentEscrow.Voucher memory voucher18 =
            createVoucher(voucher18Id, buyer, seller, amount18, address(token18), voucherTimestamp, 1, voucherExpiry);
        IDeferredPaymentEscrow.Voucher memory voucher8 =
            createVoucher(voucher8Id, buyer, seller, amount8, address(token8), voucherTimestamp, 1, voucherExpiry);

        // We'll use buyer's address directly (not buyerFromPrivateKey) for this test
        // So we need to get the buyer's private key from the test framework
        uint256 buyerPk = uint256(keccak256(abi.encodePacked("buyer")));

        bytes memory signature6 = signVoucher(voucher6, buyerPk);
        bytes memory signature18 = signVoucher(voucher18, buyerPk);
        bytes memory signature8 = signVoucher(voucher8, buyerPk);

        uint256 sellerBalance6Before = token6.balanceOf(seller);
        uint256 sellerBalance18Before = token18.balanceOf(seller);
        uint256 sellerBalance8Before = token8.balanceOf(seller);

        // Collect all vouchers
        vm.startPrank(seller);
        escrow.collect(voucher6, signature6);
        escrow.collect(voucher18, signature18);
        escrow.collect(voucher8, signature8);
        vm.stopPrank();

        // Verify collections
        assertEq(token6.balanceOf(seller), sellerBalance6Before + amount6);
        assertEq(token18.balanceOf(seller), sellerBalance18Before + amount18);
        assertEq(token8.balanceOf(seller), sellerBalance8Before + amount8);
    }

    function test_NonStandardERC20Token() public {
        MockNonStandardERC20 nonStandardToken = new MockNonStandardERC20("Non-Standard", "NST", 18);
        uint256 depositAmount = 1000e18;

        // Mint tokens to buyer
        nonStandardToken.mint(buyer, depositAmount);

        // Approve and deposit
        vm.startPrank(buyer);
        nonStandardToken.approve(address(escrow), depositAmount);
        escrow.deposit(seller, address(nonStandardToken), depositAmount);
        vm.stopPrank();

        // Verify deposit
        assertEq(escrow.getAccount(buyer, seller, address(nonStandardToken)).balance, depositAmount);

        // Create and collect voucher
        IDeferredPaymentEscrow.Voucher memory voucher = createVoucher(
            VOUCHER_ID, buyer, seller, VOUCHER_VALUE, address(nonStandardToken), voucherTimestamp, 1, voucherExpiry
        );

        uint256 buyerPk = uint256(keccak256(abi.encodePacked("buyer")));
        bytes memory signature = signVoucher(voucher, buyerPk);

        vm.prank(seller);
        escrow.collect(voucher, signature);

        // Verify collection worked with non-standard token
        assertEq(nonStandardToken.balanceOf(seller), VOUCHER_VALUE);
    }

    function test_Collect_ERC1271() public {
        uint256 depositAmount = 1000e18;

        // Mint tokens to smart wallet
        usdc.mint(address(smartWallet), depositAmount);

        // Smart wallet approves escrow
        vm.prank(address(smartWallet));
        usdc.approve(address(escrow), depositAmount);

        // Smart wallet deposits
        vm.prank(address(smartWallet));
        escrow.deposit(seller, address(usdc), depositAmount);

        // Create voucher for smart wallet
        IDeferredPaymentEscrow.Voucher memory voucher = createVoucher(
            VOUCHER_ID, address(smartWallet), seller, VOUCHER_VALUE, address(usdc), voucherTimestamp, 1, voucherExpiry
        );

        // Create digest for smart wallet validation
        bytes32 structHash = keccak256(
            abi.encode(
                escrow.VOUCHER_TYPEHASH(),
                voucher.id,
                voucher.buyer,
                voucher.seller,
                voucher.valueAggregate,
                voucher.asset,
                voucher.timestamp,
                voucher.nonce,
                voucher.escrow,
                voucher.chainId,
                voucher.expiry
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", escrow.DOMAIN_SEPARATOR(), structHash));

        // Set smart wallet to accept this digest
        smartWallet.setValidHash(digest, true);
        bytes memory signature = abi.encodePacked("valid");

        vm.prank(seller);
        escrow.collect(voucher, signature);

        assertEq(escrow.getVoucherCollected(address(smartWallet), seller, address(usdc), VOUCHER_ID), VOUCHER_VALUE);
    }

    function test_DepositMany_DifferentTokenDecimals() public {
        // Create tokens with different decimals
        MockERC20 token6 = new MockERC20("USDC", "USDC", 6);
        MockERC20 token18 = new MockERC20("DAI", "DAI", 18);

        // Test amounts appropriate for each decimal
        uint256 amount6 = 1000e6; // 1000 USDC
        uint256 amount18 = 500e18; // 500 DAI

        // Test with 6-decimal token
        token6.mint(buyer, amount6 * 3);
        vm.startPrank(buyer);
        token6.approve(address(escrow), amount6 * 3);

        address seller2 = makeAddr("seller2");
        address seller3 = makeAddr("seller3");

        IDeferredPaymentEscrow.DepositInput[] memory deposits6 = new IDeferredPaymentEscrow.DepositInput[](3);
        deposits6[0] = IDeferredPaymentEscrow.DepositInput({seller: seller, amount: amount6});
        deposits6[1] = IDeferredPaymentEscrow.DepositInput({seller: seller2, amount: amount6});
        deposits6[2] = IDeferredPaymentEscrow.DepositInput({seller: seller3, amount: amount6});

        escrow.depositMany(address(token6), deposits6);
        vm.stopPrank();

        // Test with 18-decimal token
        token18.mint(buyer, amount18 * 2);
        vm.startPrank(buyer);
        token18.approve(address(escrow), amount18 * 2);

        IDeferredPaymentEscrow.DepositInput[] memory deposits18 = new IDeferredPaymentEscrow.DepositInput[](2);
        deposits18[0] = IDeferredPaymentEscrow.DepositInput({seller: seller, amount: amount18});
        deposits18[1] = IDeferredPaymentEscrow.DepositInput({seller: seller2, amount: amount18});

        escrow.depositMany(address(token18), deposits18);
        vm.stopPrank();

        // Verify all deposits
        assertEq(escrow.getAccount(buyer, seller, address(token6)).balance, amount6);
        assertEq(escrow.getAccount(buyer, seller2, address(token6)).balance, amount6);
        assertEq(escrow.getAccount(buyer, seller3, address(token6)).balance, amount6);
        assertEq(escrow.getAccount(buyer, seller, address(token18)).balance, amount18);
        assertEq(escrow.getAccount(buyer, seller2, address(token18)).balance, amount18);
    }
}
