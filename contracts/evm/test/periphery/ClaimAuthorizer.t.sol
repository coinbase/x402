// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ClaimAuthorizer} from "../../src/periphery/ClaimAuthorizer.sol";
import {Authorizable} from "../../src/periphery/Authorizable.sol";
import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";

contract ClaimAuthorizerTest is Test {
    ClaimAuthorizer public authorizer;

    address public auth1;
    uint256 public auth1Key;
    address public auth2;
    uint256 public auth2Key;
    address public outsider;

    event AuthorizerAdded(address indexed authorizer);
    event AuthorizerRemoved(address indexed authorizer);

    function setUp() public {
        (auth1, auth1Key) = makeAddrAndKey("auth1");
        (auth2, auth2Key) = makeAddrAndKey("auth2");
        outsider = makeAddr("outsider");

        address[] memory auths = new address[](2);
        auths[0] = auth1;
        auths[1] = auth2;

        authorizer = new ClaimAuthorizer(auths);
    }

    // =========================================================================
    // Constructor
    // =========================================================================

    function test_constructor_setsState() public view {
        assertTrue(authorizer.authorizers(auth1));
        assertTrue(authorizer.authorizers(auth2));
        assertEq(authorizer.authorizerCount(), 2);
    }

    function test_constructor_revertsEmptyAuthorizers() public {
        address[] memory auths = new address[](0);
        vm.expectRevert(Authorizable.InvalidAddress.selector);
        new ClaimAuthorizer(auths);
    }

    function test_constructor_revertsZeroAuthorizer() public {
        address[] memory auths = new address[](1);
        auths[0] = address(0);
        vm.expectRevert(Authorizable.InvalidAddress.selector);
        new ClaimAuthorizer(auths);
    }

    function test_constructor_revertsDuplicateAuthorizer() public {
        address[] memory auths = new address[](2);
        auths[0] = auth1;
        auths[1] = auth1;
        vm.expectRevert(Authorizable.AlreadyAuthorizer.selector);
        new ClaimAuthorizer(auths);
    }

    // =========================================================================
    // Authorizer Management
    // =========================================================================

    function test_addAuthorizer() public {
        address newAuth = makeAddr("newAuth");

        vm.expectEmit(true, false, false, false);
        emit AuthorizerAdded(newAuth);

        vm.prank(auth1);
        authorizer.addAuthorizer(newAuth);

        assertTrue(authorizer.authorizers(newAuth));
        assertEq(authorizer.authorizerCount(), 3);
    }

    function test_addAuthorizer_revertsZero() public {
        vm.prank(auth1);
        vm.expectRevert(Authorizable.InvalidAddress.selector);
        authorizer.addAuthorizer(address(0));
    }

    function test_addAuthorizer_revertsDuplicate() public {
        vm.prank(auth1);
        vm.expectRevert(Authorizable.AlreadyAuthorizer.selector);
        authorizer.addAuthorizer(auth2);
    }

    function test_addAuthorizer_revertsNotAuthorizer() public {
        vm.prank(outsider);
        vm.expectRevert(Authorizable.NotAuthorizer.selector);
        authorizer.addAuthorizer(makeAddr("x"));
    }

    function test_removeAuthorizer() public {
        vm.expectEmit(true, false, false, false);
        emit AuthorizerRemoved(auth2);

        vm.prank(auth1);
        authorizer.removeAuthorizer(auth2);

        assertFalse(authorizer.authorizers(auth2));
        assertEq(authorizer.authorizerCount(), 1);
    }

    function test_removeAuthorizer_revertsNotAuthorizer_target() public {
        vm.prank(auth1);
        vm.expectRevert(Authorizable.NotAuthorizer.selector);
        authorizer.removeAuthorizer(outsider);
    }

    function test_removeAuthorizer_revertsNotAuthorizer_caller() public {
        vm.prank(outsider);
        vm.expectRevert(Authorizable.NotAuthorizer.selector);
        authorizer.removeAuthorizer(auth1);
    }

    function test_removeAuthorizer_revertsLastAuthorizer() public {
        vm.prank(auth1);
        authorizer.removeAuthorizer(auth2);

        vm.prank(auth1);
        vm.expectRevert(Authorizable.LastAuthorizer.selector);
        authorizer.removeAuthorizer(auth1);
    }

    // =========================================================================
    // EIP-1271
    // =========================================================================

    function test_isValidSignature_validAuthorizer() public view {
        bytes32 digest = keccak256("test message");
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(auth1Key, digest);
        bytes memory sig = abi.encodePacked(r, s, v);

        bytes4 result = authorizer.isValidSignature(digest, sig);
        assertEq(result, IERC1271.isValidSignature.selector);
    }

    function test_isValidSignature_secondAuthorizer() public view {
        bytes32 digest = keccak256("test message");
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(auth2Key, digest);
        bytes memory sig = abi.encodePacked(r, s, v);

        bytes4 result = authorizer.isValidSignature(digest, sig);
        assertEq(result, IERC1271.isValidSignature.selector);
    }

    function test_isValidSignature_invalidSigner() public {
        bytes32 digest = keccak256("test message");
        (, uint256 outsiderKey) = makeAddrAndKey("outsider_signer");
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(outsiderKey, digest);
        bytes memory sig = abi.encodePacked(r, s, v);

        bytes4 result = authorizer.isValidSignature(digest, sig);
        assertEq(result, bytes4(0xffffffff));
    }

    function test_isValidSignature_malformedSignature() public view {
        bytes32 digest = keccak256("test message");
        bytes memory sig = hex"deadbeef";

        bytes4 result = authorizer.isValidSignature(digest, sig);
        assertEq(result, bytes4(0xffffffff));
    }
}
