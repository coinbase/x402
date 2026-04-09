// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {PaymentRouter} from "../../src/periphery/PaymentRouter.sol";
import {Authorizable} from "../../src/periphery/Authorizable.sol";
import {MockGenericERC20} from "../../src/mocks/MockGenericERC20.sol";

contract PaymentRouterTest is Test {
    PaymentRouter public router;
    MockGenericERC20 public token;

    address public auth1;
    address public auth2;
    address public dest;
    address public newDest;
    address public outsider;

    event DestinationUpdated(address indexed oldDestination, address indexed newDestination);
    event Forwarded(address indexed token, address indexed to, uint256 amount);
    event AuthorizerAdded(address indexed authorizer);
    event AuthorizerRemoved(address indexed authorizer);

    function setUp() public {
        auth1 = makeAddr("auth1");
        auth2 = makeAddr("auth2");
        dest = makeAddr("dest");
        newDest = makeAddr("newDest");
        outsider = makeAddr("outsider");

        token = new MockGenericERC20();

        address[] memory auths = new address[](2);
        auths[0] = auth1;
        auths[1] = auth2;

        router = new PaymentRouter(dest, auths);
    }

    // =========================================================================
    // Constructor
    // =========================================================================

    function test_constructor_setsState() public view {
        assertEq(router.destination(), dest);
        assertTrue(router.authorizers(auth1));
        assertTrue(router.authorizers(auth2));
        assertEq(router.authorizerCount(), 2);
    }

    function test_constructor_revertsZeroDestination() public {
        address[] memory auths = new address[](1);
        auths[0] = auth1;
        vm.expectRevert(Authorizable.InvalidAddress.selector);
        new PaymentRouter(address(0), auths);
    }

    function test_constructor_revertsEmptyAuthorizers() public {
        address[] memory auths = new address[](0);
        vm.expectRevert(Authorizable.InvalidAddress.selector);
        new PaymentRouter(dest, auths);
    }

    function test_constructor_revertsZeroAuthorizer() public {
        address[] memory auths = new address[](1);
        auths[0] = address(0);
        vm.expectRevert(Authorizable.InvalidAddress.selector);
        new PaymentRouter(dest, auths);
    }

    function test_constructor_revertsDuplicateAuthorizer() public {
        address[] memory auths = new address[](2);
        auths[0] = auth1;
        auths[1] = auth1;
        vm.expectRevert(Authorizable.AlreadyAuthorizer.selector);
        new PaymentRouter(dest, auths);
    }

    // =========================================================================
    // Forward (full balance)
    // =========================================================================

    function test_forward_fullBalance() public {
        token.mint(address(router), 500e6);

        vm.expectEmit(true, true, false, true);
        emit Forwarded(address(token), dest, 500e6);

        vm.prank(auth1);
        router.forward(address(token));

        assertEq(token.balanceOf(dest), 500e6);
        assertEq(token.balanceOf(address(router)), 0);
    }

    function test_forward_revertsNotAuthorizer() public {
        token.mint(address(router), 500e6);
        vm.prank(outsider);
        vm.expectRevert(Authorizable.NotAuthorizer.selector);
        router.forward(address(token));
    }

    function test_forward_revertsZeroBalance() public {
        vm.prank(auth1);
        vm.expectRevert(PaymentRouter.NothingToForward.selector);
        router.forward(address(token));
    }

    // =========================================================================
    // Forward (specific amount)
    // =========================================================================

    function test_forward_specificAmount() public {
        token.mint(address(router), 500e6);

        vm.expectEmit(true, true, false, true);
        emit Forwarded(address(token), dest, 200e6);

        vm.prank(auth1);
        router.forward(address(token), 200e6);

        assertEq(token.balanceOf(dest), 200e6);
        assertEq(token.balanceOf(address(router)), 300e6);
    }

    function test_forward_specificAmount_revertsZero() public {
        token.mint(address(router), 500e6);
        vm.prank(auth1);
        vm.expectRevert(PaymentRouter.NothingToForward.selector);
        router.forward(address(token), 0);
    }

    function test_forward_specificAmount_revertsNotAuthorizer() public {
        token.mint(address(router), 500e6);
        vm.prank(outsider);
        vm.expectRevert(Authorizable.NotAuthorizer.selector);
        router.forward(address(token), 200e6);
    }

    // =========================================================================
    // Update Destination
    // =========================================================================

    function test_updateDestination() public {
        vm.expectEmit(true, true, false, false);
        emit DestinationUpdated(dest, newDest);

        vm.prank(auth2);
        router.updateDestination(newDest);

        assertEq(router.destination(), newDest);
    }

    function test_updateDestination_revertsZero() public {
        vm.prank(auth1);
        vm.expectRevert(Authorizable.InvalidAddress.selector);
        router.updateDestination(address(0));
    }

    function test_updateDestination_revertsNotAuthorizer() public {
        vm.prank(outsider);
        vm.expectRevert(Authorizable.NotAuthorizer.selector);
        router.updateDestination(newDest);
    }

    // =========================================================================
    // Authorizer Management
    // =========================================================================

    function test_addAuthorizer() public {
        address newAuth = makeAddr("newAuth");

        vm.expectEmit(true, false, false, false);
        emit AuthorizerAdded(newAuth);

        vm.prank(auth1);
        router.addAuthorizer(newAuth);

        assertTrue(router.authorizers(newAuth));
        assertEq(router.authorizerCount(), 3);
    }

    function test_addAuthorizer_revertsZero() public {
        vm.prank(auth1);
        vm.expectRevert(Authorizable.InvalidAddress.selector);
        router.addAuthorizer(address(0));
    }

    function test_addAuthorizer_revertsDuplicate() public {
        vm.prank(auth1);
        vm.expectRevert(Authorizable.AlreadyAuthorizer.selector);
        router.addAuthorizer(auth2);
    }

    function test_addAuthorizer_revertsNotAuthorizer() public {
        vm.prank(outsider);
        vm.expectRevert(Authorizable.NotAuthorizer.selector);
        router.addAuthorizer(makeAddr("x"));
    }

    function test_removeAuthorizer() public {
        vm.expectEmit(true, false, false, false);
        emit AuthorizerRemoved(auth2);

        vm.prank(auth1);
        router.removeAuthorizer(auth2);

        assertFalse(router.authorizers(auth2));
        assertEq(router.authorizerCount(), 1);
    }

    function test_removeAuthorizer_revertsNotAuthorizer_target() public {
        vm.prank(auth1);
        vm.expectRevert(Authorizable.NotAuthorizer.selector);
        router.removeAuthorizer(outsider);
    }

    function test_removeAuthorizer_revertsNotAuthorizer_caller() public {
        vm.prank(outsider);
        vm.expectRevert(Authorizable.NotAuthorizer.selector);
        router.removeAuthorizer(auth1);
    }

    function test_removeAuthorizer_revertsLastAuthorizer() public {
        vm.prank(auth1);
        router.removeAuthorizer(auth2);

        vm.prank(auth1);
        vm.expectRevert(Authorizable.LastAuthorizer.selector);
        router.removeAuthorizer(auth1);
    }

    // =========================================================================
    // Integration: forward after destination update
    // =========================================================================

    function test_forwardAfterDestinationUpdate() public {
        token.mint(address(router), 1000e6);

        vm.prank(auth1);
        router.updateDestination(newDest);

        vm.prank(auth1);
        router.forward(address(token));

        assertEq(token.balanceOf(newDest), 1000e6);
        assertEq(token.balanceOf(dest), 0);
    }
}
