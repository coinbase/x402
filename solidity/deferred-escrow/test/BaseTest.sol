// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import {DeferredPaymentEscrow} from "../src/DeferredPaymentEscrow.sol";
import {IDeferredPaymentEscrow} from "../src/IDeferredPaymentEscrow.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockERC1271} from "./mocks/MockERC1271.sol";
import {MockNonStandardERC20} from "./mocks/MockNonStandardERC20.sol";

contract BaseTest is Test {
    using ECDSA for bytes32;

    DeferredPaymentEscrow public escrow;
    MockERC20 public usdc;
    MockERC20 public usdt;
    MockERC1271 public smartWallet;

    address public buyer = makeAddr("buyer");
    address public seller = makeAddr("seller");

    uint256 public buyerPrivateKey = 0x12345;
    address public buyerFromPrivateKey;

    uint256 public constant THAWING_PERIOD = 7 days;
    uint256 public constant INITIAL_BALANCE = 1000000e18;

    // Test voucher data
    bytes32 public constant VOUCHER_ID = keccak256("test-voucher-1");
    uint256 public constant VOUCHER_VALUE = 1000e18;
    uint64 public voucherTimestamp;
    uint64 public voucherExpiry;

    // ============ EVENTS ============

    event Deposited(
        address indexed buyer, address indexed seller, address indexed asset, uint256 amount, uint256 newBalance
    );

    event ThawInitiated(
        address indexed buyer,
        address indexed seller,
        address indexed asset,
        uint256 newThawingAmount,
        uint256 previousThawingAmount,
        uint256 newThawEndTime,
        uint256 previousThawEndTime
    );

    event VoucherCollected(
        bytes32 indexed voucherId,
        address indexed buyer,
        address indexed seller,
        address asset,
        uint256 amount,
        uint256 totalCollected
    );

    event VoucherAlreadyCollected(
        bytes32 indexed voucherId, address indexed buyer, address indexed seller, address asset, uint256 totalCollected
    );

    event VoucherNoCollectableBalance(
        bytes32 indexed voucherId,
        address indexed buyer,
        address indexed seller,
        address asset,
        uint256 outstanding,
        uint256 alreadyCollected
    );

    event DepositAuthorized(
        address indexed buyer, address indexed seller, address indexed asset, uint256 amount, bytes32 nonce
    );

    event FlushAuthorized(
        address indexed buyer, address indexed seller, address indexed asset, bytes32 nonce, bool thawing
    );

    event FlushAllAuthorized(address indexed buyer, bytes32 nonce, uint256 accountsFlushed);

    event Withdrawn(
        address indexed buyer, address indexed seller, address indexed asset, uint256 amount, uint256 remainingBalance
    );

    function setUp() public virtual {
        buyerFromPrivateKey = vm.addr(buyerPrivateKey);
        voucherTimestamp = uint64(block.timestamp);
        voucherExpiry = uint64(block.timestamp + 30 days);

        // Deploy mock tokens
        usdc = new MockERC20("USD Coin", "USDC", 6);
        usdt = new MockERC20("Tether USD", "USDT", 6);
        smartWallet = new MockERC1271();

        // Deploy escrow directly with constructor
        escrow = new DeferredPaymentEscrow(THAWING_PERIOD);

        // Mint tokens to test accounts
        usdc.mint(buyer, INITIAL_BALANCE);
        usdc.mint(buyerFromPrivateKey, INITIAL_BALANCE);
        usdt.mint(buyer, INITIAL_BALANCE);
        usdt.mint(buyerFromPrivateKey, INITIAL_BALANCE);

        // Approve escrow to spend tokens
        vm.startPrank(buyer);
        usdc.approve(address(escrow), type(uint256).max);
        usdt.approve(address(escrow), type(uint256).max);
        vm.stopPrank();

        vm.startPrank(buyerFromPrivateKey);
        usdc.approve(address(escrow), type(uint256).max);
        usdt.approve(address(escrow), type(uint256).max);
        vm.stopPrank();
    }

    // ============ HELPER FUNCTIONS ============

    function createVoucher(
        bytes32 id,
        address buyerAddr,
        address sellerAddr,
        uint256 value,
        address asset,
        uint64 timestamp,
        uint256 nonce,
        uint64 expiry
    ) internal view returns (IDeferredPaymentEscrow.Voucher memory) {
        return IDeferredPaymentEscrow.Voucher({
            id: id,
            buyer: buyerAddr,
            seller: sellerAddr,
            valueAggregate: value,
            asset: asset,
            timestamp: timestamp,
            nonce: nonce,
            escrow: address(escrow),
            chainId: block.chainid,
            expiry: expiry
        });
    }

    function signVoucher(IDeferredPaymentEscrow.Voucher memory voucher, uint256 privateKey)
        internal
        view
        returns (bytes memory)
    {
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

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function signFlushAuthorization(IDeferredPaymentEscrow.FlushAuthorization memory auth, uint256 privateKey)
        internal
        view
        returns (bytes memory)
    {
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("FlushAuthorization(address buyer,address seller,address asset,bytes32 nonce,uint64 expiry)"),
                auth.buyer,
                auth.seller,
                auth.asset,
                auth.nonce,
                auth.expiry
            )
        );

        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", escrow.DOMAIN_SEPARATOR(), structHash));

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function signFlushAllAuthorization(IDeferredPaymentEscrow.FlushAllAuthorization memory auth, uint256 privateKey)
        internal
        view
        returns (bytes memory)
    {
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("FlushAllAuthorization(address buyer,bytes32 nonce,uint64 expiry)"),
                auth.buyer,
                auth.nonce,
                auth.expiry
            )
        );

        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", escrow.DOMAIN_SEPARATOR(), structHash));

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function signDepositAuthorization(IDeferredPaymentEscrow.DepositAuthorization memory auth, uint256 privateKey)
        internal
        view
        returns (bytes memory)
    {
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

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        return abi.encodePacked(r, s, v);
    }
}
