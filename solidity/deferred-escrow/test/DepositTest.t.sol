// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {BaseTest} from "./BaseTest.sol";
import {DeferredPaymentEscrow} from "../src/DeferredPaymentEscrow.sol";
import {IDeferredPaymentEscrow} from "../src/IDeferredPaymentEscrow.sol";

contract DepositTest is BaseTest {
    // ============ INITIALIZATION TESTS ============

    function test_Initialize() public {
        assertEq(escrow.THAWING_PERIOD(), THAWING_PERIOD);
    }

    function test_Initialize_InvalidThawingPeriod() public {
        uint256 invalidPeriod = 31 days; // Greater than MAX_THAWING_PERIOD (30 days)
        vm.expectRevert(
            abi.encodeWithSelector(IDeferredPaymentEscrow.InvalidThawingPeriod.selector, invalidPeriod, 30 days)
        );
        new DeferredPaymentEscrow(invalidPeriod);
    }

    // ============ DEPOSIT TESTS ============

    function test_Deposit() public {
        uint256 amount = 1000e6;

        vm.expectEmit(true, true, true, true);
        emit Deposited(buyer, seller, address(usdc), amount, amount);

        vm.prank(buyer);
        escrow.deposit(seller, address(usdc), amount);

        IDeferredPaymentEscrow.EscrowAccount memory account = escrow.getAccount(buyer, seller, address(usdc));
        assertEq(account.balance, amount);
        assertEq(account.thawingAmount, 0);
        assertEq(account.thawEndTime, 0);
        assertEq(usdc.balanceOf(address(escrow)), amount);
    }

    function test_Deposit_InvalidSeller() public {
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(IDeferredPaymentEscrow.InvalidAddress.selector, address(0)));
        escrow.deposit(address(0), address(usdc), 1000e6);
    }

    function test_Deposit_InvalidAsset() public {
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(IDeferredPaymentEscrow.InvalidAsset.selector, address(0)));
        escrow.deposit(seller, address(0), 1000e6);
    }

    function test_Deposit_ZeroAmount() public {
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(IDeferredPaymentEscrow.InvalidAmount.selector, 0));
        escrow.deposit(seller, address(usdc), 0);
    }

    function test_DepositMany() public {
        address seller2 = makeAddr("seller2");
        uint256 amount1 = 1000e6;
        uint256 amount2 = 2000e6;
        uint256 totalAmount = amount1 + amount2;

        IDeferredPaymentEscrow.DepositInput[] memory deposits = new IDeferredPaymentEscrow.DepositInput[](2);
        deposits[0] = IDeferredPaymentEscrow.DepositInput({seller: seller, amount: amount1});
        deposits[1] = IDeferredPaymentEscrow.DepositInput({seller: seller2, amount: amount2});

        vm.expectEmit(true, true, true, true);
        emit Deposited(buyer, seller, address(usdc), amount1, amount1);
        vm.expectEmit(true, true, true, true);
        emit Deposited(buyer, seller2, address(usdc), amount2, amount2);

        vm.prank(buyer);
        escrow.depositMany(address(usdc), deposits);

        assertEq(escrow.getAccount(buyer, seller, address(usdc)).balance, amount1);
        assertEq(escrow.getAccount(buyer, seller2, address(usdc)).balance, amount2);
        assertEq(usdc.balanceOf(address(escrow)), totalAmount);
    }

    function test_DepositMany_InvalidAsset() public {
        IDeferredPaymentEscrow.DepositInput[] memory deposits = new IDeferredPaymentEscrow.DepositInput[](1);
        deposits[0] = IDeferredPaymentEscrow.DepositInput({seller: seller, amount: 1000e6});

        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(IDeferredPaymentEscrow.InvalidAsset.selector, address(0)));
        escrow.depositMany(address(0), deposits);
    }

    function test_DepositMany_EmptyDeposits() public {
        IDeferredPaymentEscrow.DepositInput[] memory deposits = new IDeferredPaymentEscrow.DepositInput[](0);

        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(IDeferredPaymentEscrow.NoDepositsProvided.selector));
        escrow.depositMany(address(usdc), deposits);
    }

    function test_DepositTo() public {
        uint256 amount = 1000e6;
        address beneficiary = address(0x1234);

        usdc.mint(address(this), amount);
        usdc.approve(address(escrow), amount);

        // Deposit on behalf of beneficiary
        vm.expectEmit(true, true, true, true);
        emit Deposited(beneficiary, seller, address(usdc), amount, amount);

        escrow.depositTo(beneficiary, seller, address(usdc), amount);

        // Check that beneficiary owns the escrow, not msg.sender
        assertEq(escrow.getAccount(beneficiary, seller, address(usdc)).balance, amount);
        assertEq(escrow.getAccount(address(this), seller, address(usdc)).balance, 0);
        assertEq(usdc.balanceOf(address(escrow)), amount);
    }

    function test_DepositTo_InvalidBuyer() public {
        uint256 amount = 1000e6;

        usdc.mint(address(this), amount);
        usdc.approve(address(escrow), amount);

        vm.expectRevert(abi.encodeWithSelector(IDeferredPaymentEscrow.InvalidAddress.selector, address(0)));
        escrow.depositTo(address(0), seller, address(usdc), amount);
    }

    // ============ DEPOSIT AUTHORIZATION TESTS ============

    function test_DepositWithAuthorization_Success() public {
        uint256 depositAmount = 1000e6;
        bytes32 nonce = keccak256("test-nonce-1");
        uint64 expiry = uint64(block.timestamp + 1 hours);

        // Create authorization
        IDeferredPaymentEscrow.DepositAuthorization memory auth = IDeferredPaymentEscrow.DepositAuthorization({
            buyer: buyerFromPrivateKey,
            seller: seller,
            asset: address(usdc),
            amount: depositAmount,
            nonce: nonce,
            expiry: expiry
        });

        // Sign authorization
        bytes memory signature = signDepositAuthorization(auth, buyerPrivateKey);

        // Approve escrow
        vm.prank(buyerFromPrivateKey);
        usdc.approve(address(escrow), depositAmount);

        // Execute deposit
        vm.expectEmit(true, true, true, true);
        emit Deposited(buyerFromPrivateKey, seller, address(usdc), depositAmount, depositAmount);
        vm.expectEmit(true, true, true, true);
        emit DepositAuthorized(buyerFromPrivateKey, seller, address(usdc), depositAmount, nonce);

        escrow.depositWithAuthorization(auth, signature);

        // Verify state
        IDeferredPaymentEscrow.EscrowAccount memory account =
            escrow.getAccount(buyerFromPrivateKey, seller, address(usdc));
        assertEq(account.balance, depositAmount);
    }

    function test_DepositWithAuthorization_ExpiredReverts() public {
        uint256 depositAmount = 1000e6;
        bytes32 nonce = keccak256("test-nonce-2");
        uint64 expiry = uint64(block.timestamp - 1); // Already expired

        IDeferredPaymentEscrow.DepositAuthorization memory auth = IDeferredPaymentEscrow.DepositAuthorization({
            buyer: buyerFromPrivateKey,
            seller: seller,
            asset: address(usdc),
            amount: depositAmount,
            nonce: nonce,
            expiry: expiry
        });

        // Sign authorization
        bytes memory signature = signDepositAuthorization(auth, buyerPrivateKey);

        vm.expectRevert(
            abi.encodeWithSelector(IDeferredPaymentEscrow.AuthorizationExpired.selector, expiry, block.timestamp)
        );
        escrow.depositWithAuthorization(auth, signature);
    }

    function test_DepositWithAuthorization_NonceReplayReverts() public {
        uint256 depositAmount = 1000e6;
        bytes32 nonce = keccak256("test-nonce-3");
        uint64 expiry = uint64(block.timestamp + 1 hours);

        IDeferredPaymentEscrow.DepositAuthorization memory auth = IDeferredPaymentEscrow.DepositAuthorization({
            buyer: buyerFromPrivateKey,
            seller: seller,
            asset: address(usdc),
            amount: depositAmount,
            nonce: nonce,
            expiry: expiry
        });

        // Sign authorization
        bytes memory signature = signDepositAuthorization(auth, buyerPrivateKey);

        // Approve and execute first deposit
        vm.prank(buyerFromPrivateKey);
        usdc.approve(address(escrow), depositAmount * 2);
        escrow.depositWithAuthorization(auth, signature);

        // Try to replay the same authorization
        vm.expectRevert(abi.encodeWithSelector(IDeferredPaymentEscrow.NonceAlreadyUsed.selector, nonce));
        escrow.depositWithAuthorization(auth, signature);
    }

    function test_DepositWithAuthorization_InvalidSignatureReverts() public {
        uint256 depositAmount = 1000e6;
        bytes32 nonce = keccak256("test-nonce-4");
        uint64 expiry = uint64(block.timestamp + 1 hours);

        IDeferredPaymentEscrow.DepositAuthorization memory auth = IDeferredPaymentEscrow.DepositAuthorization({
            buyer: buyerFromPrivateKey,
            seller: seller,
            asset: address(usdc),
            amount: depositAmount,
            nonce: nonce,
            expiry: expiry
        });

        // Sign with wrong private key
        uint256 wrongPrivateKey = 0x54321;
        bytes memory signature = signDepositAuthorization(auth, wrongPrivateKey);

        vm.expectRevert(IDeferredPaymentEscrow.InvalidAuthorization.selector);
        escrow.depositWithAuthorization(auth, signature);
    }

    function test_DepositWithAuthorization_SmartWalletSignature() public {
        uint256 depositAmount = 1000e6;
        bytes32 nonce = keccak256("test-nonce-5");
        uint64 expiry = uint64(block.timestamp + 1 hours);

        // Fund smart wallet
        usdc.mint(address(smartWallet), depositAmount);
        vm.prank(address(smartWallet));
        usdc.approve(address(escrow), depositAmount);

        IDeferredPaymentEscrow.DepositAuthorization memory auth = IDeferredPaymentEscrow.DepositAuthorization({
            buyer: address(smartWallet),
            seller: seller,
            asset: address(usdc),
            amount: depositAmount,
            nonce: nonce,
            expiry: expiry
        });

        // Create digest for smart wallet using helper function
        bytes memory signature = signDepositAuthorization(auth, buyerPrivateKey);
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "DepositAuthorization(address buyer,address seller,address asset,uint256 amount,bytes32 nonce,uint64 expiry)"
                ),
                auth.buyer,
                auth.seller,
                auth.asset,
                auth.amount,
                auth.nonce,
                auth.expiry
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", escrow.DOMAIN_SEPARATOR(), structHash));

        // Set the smart wallet to accept this digest
        smartWallet.setValidHash(digest, true);
        signature = hex"1234"; // Dummy signature, smart wallet will validate

        // Execute deposit
        escrow.depositWithAuthorization(auth, signature);

        // Verify state
        IDeferredPaymentEscrow.EscrowAccount memory account =
            escrow.getAccount(address(smartWallet), seller, address(usdc));
        assertEq(account.balance, depositAmount);
    }
}
