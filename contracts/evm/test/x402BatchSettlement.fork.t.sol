// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {x402BatchSettlement} from "../src/x402BatchSettlement.sol";
import {ISignatureTransfer} from "../src/interfaces/ISignatureTransfer.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

/// @title X402BatchSettlementForkTest
/// @notice Fork tests against real Permit2 deployment for batch settlement
/// @dev Run with: forge test --match-contract X402BatchSettlementForkTest --fork-url $RPC_URL
contract X402BatchSettlementForkTest is Test {
    address constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

    bytes32 constant PERMIT2_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,uint256 chainId,address verifyingContract)");
    bytes32 constant PERMIT_WITNESS_TYPEHASH = keccak256(
        "PermitWitnessTransferFrom(TokenPermissions permitted,address spender,uint256 nonce,uint256 deadline,DepositWitness witness)TokenPermissions(address token,uint256 amount)DepositWitness(bytes32 serviceId)"
    );
    bytes32 constant TOKEN_PERMISSIONS_TYPEHASH = keccak256("TokenPermissions(address token,uint256 amount)");
    bytes32 constant DEPOSIT_WITNESS_TYPEHASH = keccak256("DepositWitness(bytes32 serviceId)");

    x402BatchSettlement public settlement;
    MockERC20 public token;

    uint256 public payerKey;
    address public payer;
    uint256 public authorizerKey;
    address public authorizerAddr;
    address public recipient;

    bytes32 constant SERVICE_ID = keccak256("fork-test-service");
    uint64 constant WITHDRAW_WINDOW = 3600;
    uint128 constant DEPOSIT_AMOUNT = 1000e6;
    uint128 constant CLAIM_AMOUNT = 100e6;

    function setUp() public {
        if (block.chainid == 31_337) return;
        require(PERMIT2.code.length > 0, "Permit2 not deployed");

        payerKey = uint256(keccak256("x402-batch-test-payer"));
        payer = vm.addr(payerKey);
        authorizerKey = uint256(keccak256("x402-batch-test-authorizer"));
        authorizerAddr = vm.addr(authorizerKey);
        recipient = makeAddr("recipient");

        settlement = new x402BatchSettlement(PERMIT2);
        token = new MockERC20("USDC", "USDC", 6);
        token.mint(payer, 100_000e6);

        vm.prank(payer);
        token.approve(PERMIT2, type(uint256).max);

        settlement.register(SERVICE_ID, recipient, authorizerAddr, WITHDRAW_WINDOW);
    }

    modifier onlyFork() {
        if (block.chainid == 31_337) return;
        _;
    }

    function _permit2DomainSeparator() internal view returns (bytes32) {
        return keccak256(abi.encode(PERMIT2_DOMAIN_TYPEHASH, keccak256("Permit2"), block.chainid, PERMIT2));
    }

    function _nonce(uint256 salt) internal view returns (uint256) {
        return uint256(keccak256(abi.encodePacked(block.timestamp, block.number, salt)));
    }

    function _signPermit2Deposit(uint256 amount, uint256 nonce, uint256 deadline, bytes32 serviceId)
        internal
        view
        returns (bytes memory)
    {
        bytes32 witnessHash = keccak256(abi.encode(DEPOSIT_WITNESS_TYPEHASH, serviceId));
        bytes32 tokenHash = keccak256(abi.encode(TOKEN_PERMISSIONS_TYPEHASH, address(token), amount));
        bytes32 structHash =
            keccak256(abi.encode(PERMIT_WITNESS_TYPEHASH, tokenHash, address(settlement), nonce, deadline, witnessHash));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _permit2DomainSeparator(), structHash));

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(payerKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function _settlementDomainSeparator() internal view returns (bytes32) {
        return settlement.domainSeparator();
    }

    function _signVoucher(uint128 cumulativeAmount, uint64 nonce) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(settlement.VOUCHER_TYPEHASH(), SERVICE_ID, payer, address(token), cumulativeAmount, nonce)
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _settlementDomainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(payerKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function _signCooperativeWithdraw(uint64 withdrawNonce) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(settlement.COOPERATIVE_WITHDRAW_TYPEHASH(), SERVICE_ID, payer, address(token), withdrawNonce)
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _settlementDomainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(authorizerKey, digest);
        return abi.encodePacked(r, s, v);
    }

    // =========================================================================
    // Full lifecycle: deposit -> claim -> settle
    // =========================================================================

    function test_fork_fullLifecycle_deposit_claim_settle() public onlyFork {
        uint256 nonce = _nonce(1);
        uint256 deadline = block.timestamp + 3600;

        bytes memory depositSig = _signPermit2Deposit(DEPOSIT_AMOUNT, nonce, deadline, SERVICE_ID);

        ISignatureTransfer.PermitTransferFrom memory permit = ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({token: address(token), amount: DEPOSIT_AMOUNT}),
            nonce: nonce,
            deadline: deadline
        });
        x402BatchSettlement.DepositWitness memory witness =
            x402BatchSettlement.DepositWitness({serviceId: SERVICE_ID});

        settlement.depositWithPermit2(permit, payer, witness, depositSig);

        x402BatchSettlement.Subchannel memory sub = settlement.getSubchannel(SERVICE_ID, payer, address(token));
        assertEq(sub.deposit, DEPOSIT_AMOUNT);

        bytes memory voucherSig = _signVoucher(CLAIM_AMOUNT, 1);
        x402BatchSettlement.VoucherClaim[] memory claims = new x402BatchSettlement.VoucherClaim[](1);
        claims[0] = x402BatchSettlement.VoucherClaim({
            payer: payer,
            cumulativeAmount: CLAIM_AMOUNT,
            claimAmount: CLAIM_AMOUNT,
            nonce: 1,
            signature: voucherSig
        });
        settlement.claim(SERVICE_ID, address(token), claims);

        uint256 recipientBefore = token.balanceOf(recipient);
        settlement.settle(SERVICE_ID, address(token));
        assertEq(token.balanceOf(recipient), recipientBefore + CLAIM_AMOUNT);
    }

    // =========================================================================
    // Cooperative withdraw after partial claim
    // =========================================================================

    function test_fork_cooperativeWithdraw_afterClaim() public onlyFork {
        uint256 nonce = _nonce(2);
        uint256 deadline = block.timestamp + 3600;

        bytes memory depositSig = _signPermit2Deposit(DEPOSIT_AMOUNT, nonce, deadline, SERVICE_ID);

        ISignatureTransfer.PermitTransferFrom memory permit = ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({token: address(token), amount: DEPOSIT_AMOUNT}),
            nonce: nonce,
            deadline: deadline
        });
        x402BatchSettlement.DepositWitness memory witness =
            x402BatchSettlement.DepositWitness({serviceId: SERVICE_ID});

        settlement.depositWithPermit2(permit, payer, witness, depositSig);

        bytes memory voucherSig = _signVoucher(CLAIM_AMOUNT, 1);
        x402BatchSettlement.VoucherClaim[] memory claims = new x402BatchSettlement.VoucherClaim[](1);
        claims[0] = x402BatchSettlement.VoucherClaim({
            payer: payer,
            cumulativeAmount: CLAIM_AMOUNT,
            claimAmount: CLAIM_AMOUNT,
            nonce: 1,
            signature: voucherSig
        });
        settlement.claim(SERVICE_ID, address(token), claims);
        settlement.settle(SERVICE_ID, address(token));

        bytes memory authSig = _signCooperativeWithdraw(0);
        x402BatchSettlement.CooperativeWithdrawRequest[] memory requests =
            new x402BatchSettlement.CooperativeWithdrawRequest[](1);
        requests[0] = x402BatchSettlement.CooperativeWithdrawRequest({payer: payer, authorizerSignature: authSig});

        uint256 payerBefore = token.balanceOf(payer);
        settlement.cooperativeWithdraw(SERVICE_ID, address(token), requests);

        uint128 expectedRefund = DEPOSIT_AMOUNT - CLAIM_AMOUNT;
        assertEq(token.balanceOf(payer), payerBefore + expectedRefund);
    }

    // =========================================================================
    // Reject tampered witness
    // =========================================================================

    function test_fork_rejectsTamperedWitness() public onlyFork {
        uint256 nonce = _nonce(3);
        uint256 deadline = block.timestamp + 3600;

        bytes memory depositSig = _signPermit2Deposit(DEPOSIT_AMOUNT, nonce, deadline, SERVICE_ID);

        bytes32 differentService = keccak256("different-service");
        settlement.register(differentService, recipient, authorizerAddr, WITHDRAW_WINDOW);

        ISignatureTransfer.PermitTransferFrom memory permit = ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({token: address(token), amount: DEPOSIT_AMOUNT}),
            nonce: nonce,
            deadline: deadline
        });
        x402BatchSettlement.DepositWitness memory tamperedWitness =
            x402BatchSettlement.DepositWitness({serviceId: differentService});

        vm.expectRevert();
        settlement.depositWithPermit2(permit, payer, tamperedWitness, depositSig);
    }
}
