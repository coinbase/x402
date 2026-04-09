// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {PaymentSplitter} from "../../src/periphery/PaymentSplitter.sol";
import {Authorizable} from "../../src/periphery/Authorizable.sol";
import {MockGenericERC20} from "../../src/mocks/MockGenericERC20.sol";

contract PaymentSplitterTest is Test {
    PaymentSplitter public splitter;
    MockGenericERC20 public token;

    address public auth1;
    address public auth2;
    address public payee1;
    address public payee2;
    address public payee3;
    address public outsider;

    event PayeesUpdated(PaymentSplitter.Payee[] payees);
    event Distributed(address indexed token, uint256 totalAmount);
    event AuthorizerAdded(address indexed authorizer);
    event AuthorizerRemoved(address indexed authorizer);

    function setUp() public {
        auth1 = makeAddr("auth1");
        auth2 = makeAddr("auth2");
        payee1 = makeAddr("payee1");
        payee2 = makeAddr("payee2");
        payee3 = makeAddr("payee3");
        outsider = makeAddr("outsider");

        token = new MockGenericERC20();

        address[] memory auths = new address[](2);
        auths[0] = auth1;
        auths[1] = auth2;

        PaymentSplitter.Payee[] memory payees = new PaymentSplitter.Payee[](2);
        payees[0] = PaymentSplitter.Payee(payee1, 7000);
        payees[1] = PaymentSplitter.Payee(payee2, 3000);

        splitter = new PaymentSplitter(payees, auths);
    }

    // =========================================================================
    // Constructor
    // =========================================================================

    function test_constructor_setsState() public view {
        PaymentSplitter.Payee[] memory payees = splitter.getPayees();
        assertEq(payees.length, 2);
        assertEq(payees[0].account, payee1);
        assertEq(payees[0].shareBps, 7000);
        assertEq(payees[1].account, payee2);
        assertEq(payees[1].shareBps, 3000);
        assertTrue(splitter.authorizers(auth1));
        assertTrue(splitter.authorizers(auth2));
        assertEq(splitter.authorizerCount(), 2);
        assertEq(splitter.payeeCount(), 2);
    }

    function test_constructor_revertsEmptyAuthorizers() public {
        address[] memory auths = new address[](0);
        PaymentSplitter.Payee[] memory payees = new PaymentSplitter.Payee[](1);
        payees[0] = PaymentSplitter.Payee(payee1, 10_000);
        vm.expectRevert(Authorizable.InvalidAddress.selector);
        new PaymentSplitter(payees, auths);
    }

    function test_constructor_revertsZeroAuthorizer() public {
        address[] memory auths = new address[](1);
        auths[0] = address(0);
        PaymentSplitter.Payee[] memory payees = new PaymentSplitter.Payee[](1);
        payees[0] = PaymentSplitter.Payee(payee1, 10_000);
        vm.expectRevert(Authorizable.InvalidAddress.selector);
        new PaymentSplitter(payees, auths);
    }

    function test_constructor_revertsDuplicateAuthorizer() public {
        address[] memory auths = new address[](2);
        auths[0] = auth1;
        auths[1] = auth1;
        PaymentSplitter.Payee[] memory payees = new PaymentSplitter.Payee[](1);
        payees[0] = PaymentSplitter.Payee(payee1, 10_000);
        vm.expectRevert(Authorizable.AlreadyAuthorizer.selector);
        new PaymentSplitter(payees, auths);
    }

    function test_constructor_revertsNoPayees() public {
        address[] memory auths = new address[](1);
        auths[0] = auth1;
        PaymentSplitter.Payee[] memory payees = new PaymentSplitter.Payee[](0);
        vm.expectRevert(PaymentSplitter.NoPayees.selector);
        new PaymentSplitter(payees, auths);
    }

    function test_constructor_revertsSharesNotFullBps() public {
        address[] memory auths = new address[](1);
        auths[0] = auth1;
        PaymentSplitter.Payee[] memory payees = new PaymentSplitter.Payee[](2);
        payees[0] = PaymentSplitter.Payee(payee1, 5000);
        payees[1] = PaymentSplitter.Payee(payee2, 4000);
        vm.expectRevert(PaymentSplitter.InvalidShares.selector);
        new PaymentSplitter(payees, auths);
    }

    function test_constructor_revertsZeroSharePayee() public {
        address[] memory auths = new address[](1);
        auths[0] = auth1;
        PaymentSplitter.Payee[] memory payees = new PaymentSplitter.Payee[](2);
        payees[0] = PaymentSplitter.Payee(payee1, 0);
        payees[1] = PaymentSplitter.Payee(payee2, 10_000);
        vm.expectRevert(PaymentSplitter.InvalidShares.selector);
        new PaymentSplitter(payees, auths);
    }

    function test_constructor_revertsZeroAddressPayee() public {
        address[] memory auths = new address[](1);
        auths[0] = auth1;
        PaymentSplitter.Payee[] memory payees = new PaymentSplitter.Payee[](1);
        payees[0] = PaymentSplitter.Payee(address(0), 10_000);
        vm.expectRevert(Authorizable.InvalidAddress.selector);
        new PaymentSplitter(payees, auths);
    }

    function test_constructor_revertsTooManyPayees() public {
        address[] memory auths = new address[](1);
        auths[0] = auth1;
        uint256 count = 21;
        PaymentSplitter.Payee[] memory payees = new PaymentSplitter.Payee[](count);
        for (uint256 i = 0; i < count; ++i) {
            payees[i] = PaymentSplitter.Payee(address(uint160(i + 100)), 476);
        }
        vm.expectRevert(PaymentSplitter.TooManyPayees.selector);
        new PaymentSplitter(payees, auths);
    }

    // =========================================================================
    // Distribute (full balance)
    // =========================================================================

    function test_distribute_fullBalance() public {
        token.mint(address(splitter), 1000e6);

        vm.expectEmit(true, false, false, true);
        emit Distributed(address(token), 1000e6);

        vm.prank(auth1);
        splitter.distribute(address(token));

        assertEq(token.balanceOf(payee1), 700e6);
        assertEq(token.balanceOf(payee2), 300e6);
        assertEq(token.balanceOf(address(splitter)), 0);
    }

    function test_distribute_revertsNotAuthorizer() public {
        token.mint(address(splitter), 1000e6);
        vm.prank(outsider);
        vm.expectRevert(Authorizable.NotAuthorizer.selector);
        splitter.distribute(address(token));
    }

    function test_distribute_revertsZeroBalance() public {
        vm.prank(auth1);
        vm.expectRevert(PaymentSplitter.NothingToDistribute.selector);
        splitter.distribute(address(token));
    }

    // =========================================================================
    // Distribute (specific amount)
    // =========================================================================

    function test_distribute_specificAmount() public {
        token.mint(address(splitter), 1000e6);

        vm.prank(auth1);
        splitter.distribute(address(token), 500e6);

        assertEq(token.balanceOf(payee1), 350e6);
        assertEq(token.balanceOf(payee2), 150e6);
        assertEq(token.balanceOf(address(splitter)), 500e6);
    }

    function test_distribute_specificAmount_revertsZero() public {
        token.mint(address(splitter), 1000e6);
        vm.prank(auth1);
        vm.expectRevert(PaymentSplitter.NothingToDistribute.selector);
        splitter.distribute(address(token), 0);
    }

    function test_distribute_specificAmount_revertsNotAuthorizer() public {
        token.mint(address(splitter), 1000e6);
        vm.prank(outsider);
        vm.expectRevert(Authorizable.NotAuthorizer.selector);
        splitter.distribute(address(token), 500e6);
    }

    // =========================================================================
    // Distribute — rounding dust
    // =========================================================================

    function test_distribute_dustGoesToLastPayee() public {
        address[] memory auths = new address[](1);
        auths[0] = auth1;
        PaymentSplitter.Payee[] memory payees = new PaymentSplitter.Payee[](3);
        payees[0] = PaymentSplitter.Payee(payee1, 3333);
        payees[1] = PaymentSplitter.Payee(payee2, 3333);
        payees[2] = PaymentSplitter.Payee(payee3, 3334);
        PaymentSplitter s = new PaymentSplitter(payees, auths);

        token.mint(address(s), 100e6);
        vm.prank(auth1);
        s.distribute(address(token));

        assertEq(token.balanceOf(payee1), 33_330_000);
        assertEq(token.balanceOf(payee2), 33_330_000);
        assertEq(token.balanceOf(payee3), 33_340_000);
        assertEq(token.balanceOf(address(s)), 0);
    }

    // =========================================================================
    // Update Payees
    // =========================================================================

    function test_updatePayees() public {
        PaymentSplitter.Payee[] memory newPayees = new PaymentSplitter.Payee[](3);
        newPayees[0] = PaymentSplitter.Payee(payee1, 5000);
        newPayees[1] = PaymentSplitter.Payee(payee2, 3000);
        newPayees[2] = PaymentSplitter.Payee(payee3, 2000);

        vm.prank(auth1);
        splitter.updatePayees(newPayees);

        PaymentSplitter.Payee[] memory payees = splitter.getPayees();
        assertEq(payees.length, 3);
        assertEq(payees[2].account, payee3);
        assertEq(payees[2].shareBps, 2000);
        assertEq(splitter.payeeCount(), 3);
    }

    function test_updatePayees_revertsNotAuthorizer() public {
        PaymentSplitter.Payee[] memory newPayees = new PaymentSplitter.Payee[](1);
        newPayees[0] = PaymentSplitter.Payee(payee1, 10_000);
        vm.prank(outsider);
        vm.expectRevert(Authorizable.NotAuthorizer.selector);
        splitter.updatePayees(newPayees);
    }

    function test_updatePayees_revertsInvalidShares() public {
        PaymentSplitter.Payee[] memory newPayees = new PaymentSplitter.Payee[](1);
        newPayees[0] = PaymentSplitter.Payee(payee1, 5000);
        vm.prank(auth1);
        vm.expectRevert(PaymentSplitter.InvalidShares.selector);
        splitter.updatePayees(newPayees);
    }

    function test_updatePayees_revertsNoPayees() public {
        PaymentSplitter.Payee[] memory newPayees = new PaymentSplitter.Payee[](0);
        vm.prank(auth1);
        vm.expectRevert(PaymentSplitter.NoPayees.selector);
        splitter.updatePayees(newPayees);
    }

    function test_updatePayees_distributeAfterUpdate() public {
        PaymentSplitter.Payee[] memory newPayees = new PaymentSplitter.Payee[](1);
        newPayees[0] = PaymentSplitter.Payee(payee3, 10_000);
        vm.prank(auth1);
        splitter.updatePayees(newPayees);

        token.mint(address(splitter), 1000e6);
        vm.prank(auth1);
        splitter.distribute(address(token));

        assertEq(token.balanceOf(payee3), 1000e6);
    }

    // =========================================================================
    // Authorizer Management
    // =========================================================================

    function test_addAuthorizer() public {
        address newAuth = makeAddr("newAuth");
        vm.expectEmit(true, false, false, false);
        emit AuthorizerAdded(newAuth);

        vm.prank(auth1);
        splitter.addAuthorizer(newAuth);

        assertTrue(splitter.authorizers(newAuth));
        assertEq(splitter.authorizerCount(), 3);
    }

    function test_addAuthorizer_revertsZero() public {
        vm.prank(auth1);
        vm.expectRevert(Authorizable.InvalidAddress.selector);
        splitter.addAuthorizer(address(0));
    }

    function test_addAuthorizer_revertsDuplicate() public {
        vm.prank(auth1);
        vm.expectRevert(Authorizable.AlreadyAuthorizer.selector);
        splitter.addAuthorizer(auth2);
    }

    function test_addAuthorizer_revertsNotAuthorizer() public {
        vm.prank(outsider);
        vm.expectRevert(Authorizable.NotAuthorizer.selector);
        splitter.addAuthorizer(makeAddr("x"));
    }

    function test_removeAuthorizer() public {
        vm.expectEmit(true, false, false, false);
        emit AuthorizerRemoved(auth2);

        vm.prank(auth1);
        splitter.removeAuthorizer(auth2);

        assertFalse(splitter.authorizers(auth2));
        assertEq(splitter.authorizerCount(), 1);
    }

    function test_removeAuthorizer_revertsNotAuthorizer_target() public {
        vm.prank(auth1);
        vm.expectRevert(Authorizable.NotAuthorizer.selector);
        splitter.removeAuthorizer(outsider);
    }

    function test_removeAuthorizer_revertsNotAuthorizer_caller() public {
        vm.prank(outsider);
        vm.expectRevert(Authorizable.NotAuthorizer.selector);
        splitter.removeAuthorizer(auth1);
    }

    function test_removeAuthorizer_revertsLastAuthorizer() public {
        vm.prank(auth1);
        splitter.removeAuthorizer(auth2);

        vm.prank(auth1);
        vm.expectRevert(Authorizable.LastAuthorizer.selector);
        splitter.removeAuthorizer(auth1);
    }

    // =========================================================================
    // Single Payee Edge Case
    // =========================================================================

    function test_distribute_singlePayee() public {
        address[] memory auths = new address[](1);
        auths[0] = auth1;
        PaymentSplitter.Payee[] memory payees = new PaymentSplitter.Payee[](1);
        payees[0] = PaymentSplitter.Payee(payee1, 10_000);
        PaymentSplitter s = new PaymentSplitter(payees, auths);

        token.mint(address(s), 777e6);
        vm.prank(auth1);
        s.distribute(address(token));

        assertEq(token.balanceOf(payee1), 777e6);
    }
}
