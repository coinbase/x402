// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";

import {ISignatureTransfer} from "./interfaces/ISignatureTransfer.sol";

/**
 * @title x402UptoPermit2Proxy
 * @notice Trustless proxy for x402 payments using Permit2 with flexible amount transfers
 *
 * @dev This contract acts as the authorized spender in Permit2 signatures.
 *      It uses the "witness" pattern to cryptographically bind the payment destination,
 *      preventing facilitators from redirecting funds.
 *
 *      Unlike x402ExactPermit2Proxy, this contract allows the facilitator to specify
 *      how much to transfer (up to the permitted amount), useful for scenarios where
 *      the actual amount is determined at settlement time.
 *
 * @author x402 Protocol
 */
contract x402UptoPermit2Proxy is ReentrancyGuard {
    /// @notice The canonical Permit2 contract address
    ISignatureTransfer public immutable PERMIT2;

    /// @notice EIP-712 type string for witness data
    /// @dev Must match the exact format expected by Permit2
    /// Types must be in ALPHABETICAL order after the primary type (TokenPermissions < Witness)
    string public constant WITNESS_TYPE_STRING =
        "Witness witness)TokenPermissions(address token,uint256 amount)Witness(address to,uint256 validAfter,uint256 validBefore,bytes extra)";

    /// @notice EIP-712 typehash for witness struct
    bytes32 public constant WITNESS_TYPEHASH =
        keccak256("Witness(address to,uint256 validAfter,uint256 validBefore,bytes extra)");

    /// @notice Emitted when settle() completes successfully
    event Settled();

    /// @notice Emitted when settleWith2612() completes successfully
    event SettledWith2612();

    /// @notice Thrown when Permit2 address is zero
    error InvalidPermit2Address();

    /// @notice Thrown when destination address is zero
    error InvalidDestination();

    /// @notice Thrown when payment is attempted before validAfter timestamp
    error PaymentTooEarly();

    /// @notice Thrown when payment is attempted after validBefore timestamp
    error PaymentExpired();

    /// @notice Thrown when requested amount exceeds permitted amount
    error AmountExceedsPermitted();

    /// @notice Thrown when owner address is zero
    error InvalidOwner();

    /**
     * @notice Witness data structure for payment authorization
     * @param to Destination address (immutable once signed)
     * @param validAfter Earliest timestamp when payment can be settled
     * @param validBefore Latest timestamp when payment can be settled
     * @param extra Extensibility field for future use
     */
    struct Witness {
        address to;
        uint256 validAfter;
        uint256 validBefore;
        bytes extra;
    }

    /**
     * @notice EIP-2612 permit parameters grouped to reduce stack depth
     * @param value Approval amount for Permit2
     * @param deadline Permit expiration timestamp
     * @param r ECDSA signature parameter
     * @param s ECDSA signature parameter
     * @param v ECDSA signature parameter
     */
    struct EIP2612Permit {
        uint256 value;
        uint256 deadline;
        bytes32 r;
        bytes32 s;
        uint8 v;
    }

    /**
     * @notice Initializes the proxy with the Permit2 contract address
     * @param _permit2 Address of the canonical Permit2 contract
     * @dev Reverts if _permit2 is the zero address
     */
    constructor(
        address _permit2
    ) {
        if (_permit2 == address(0)) revert InvalidPermit2Address();
        PERMIT2 = ISignatureTransfer(_permit2);
    }

    /**
     * @notice Settles a payment using a Permit2 signature
     * @dev This is the standard settlement path when user has already approved Permit2
     * @param permit The Permit2 transfer authorization
     * @param amount The amount to transfer (must be <= permit.permitted.amount)
     * @param owner The token owner (payer)
     * @param witness The witness data containing destination and validity window
     * @param signature The payer's signature over the permit and witness
     */
    function settle(
        ISignatureTransfer.PermitTransferFrom calldata permit,
        uint256 amount,
        address owner,
        Witness calldata witness,
        bytes calldata signature
    ) external nonReentrant {
        _settleInternal(permit, amount, owner, witness, signature);
        emit Settled();
    }

    /**
     * @notice Settles a payment using both EIP-2612 permit and Permit2 signature
     * @dev Enables fully gasless flow for tokens supporting EIP-2612
     * @dev First submits the EIP-2612 permit to approve Permit2, then settles
     * @param permit2612 The EIP-2612 permit parameters
     * @param permit The Permit2 transfer authorization
     * @param amount The amount to transfer
     * @param owner The token owner (payer)
     * @param witness The witness data containing destination and validity window
     * @param signature The payer's signature over the permit and witness
     *
     * @dev This function will succeed even if the EIP-2612 permit fails,
     *      as long as the Permit2 approval already exists
     */
    function settleWith2612(
        EIP2612Permit calldata permit2612,
        ISignatureTransfer.PermitTransferFrom calldata permit,
        uint256 amount,
        address owner,
        Witness calldata witness,
        bytes calldata signature
    ) external nonReentrant {
        // Attempt to submit EIP-2612 permit
        // We don't revert on failure because the approval might already exist
        // or the token might not support EIP-2612
        try IERC20Permit(permit.permitted.token).permit(
            owner, address(PERMIT2), permit2612.value, permit2612.deadline, permit2612.v, permit2612.r, permit2612.s
        ) {
            // EIP-2612 permit succeeded
        } catch {
            // Permit2 settlement will fail if approval doesn't exist
        }
        _settleInternal(permit, amount, owner, witness, signature);
        emit SettledWith2612();
    }

    /**
     * @notice Internal settlement logic shared by both settlement functions
     * @dev Validates all parameters and executes the Permit2 transfer
     * @param permit The Permit2 transfer authorization
     * @param amount The amount to transfer
     * @param owner The token owner (payer)
     * @param witness The witness data containing destination and validity window
     * @param signature The payer's signature
     */
    function _settleInternal(
        ISignatureTransfer.PermitTransferFrom calldata permit,
        uint256 amount,
        address owner,
        Witness calldata witness,
        bytes calldata signature
    ) internal {
        // Validate addresses
        if (owner == address(0)) revert InvalidOwner();
        if (witness.to == address(0)) revert InvalidDestination();

        // Validate time window
        if (block.timestamp < witness.validAfter) revert PaymentTooEarly();
        if (block.timestamp > witness.validBefore) revert PaymentExpired();

        // Validate amount
        if (amount > permit.permitted.amount) revert AmountExceedsPermitted();

        // Prepare transfer details with destination from witness
        ISignatureTransfer.SignatureTransferDetails memory transferDetails =
            ISignatureTransfer.SignatureTransferDetails({to: witness.to, requestedAmount: amount});

        // Reconstruct witness hash to enforce integrity
        bytes32 witnessHash = keccak256(
            abi.encode(WITNESS_TYPEHASH, witness.to, witness.validAfter, witness.validBefore, keccak256(witness.extra))
        );

        // Execute transfer via Permit2
        PERMIT2.permitWitnessTransferFrom(permit, transferDetails, owner, witnessHash, WITNESS_TYPE_STRING, signature);
    }
}
