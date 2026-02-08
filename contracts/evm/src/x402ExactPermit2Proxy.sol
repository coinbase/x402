// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {x402BasePermit2Proxy} from "./x402BasePermit2Proxy.sol";
import {ISignatureTransfer} from "./interfaces/ISignatureTransfer.sol";

/**
 * @title x402ExactPermit2Proxy
 * @notice Trustless proxy for x402 payments using Permit2 with exact amount transfers
 *
 * @dev This contract acts as the authorized spender in Permit2 signatures.
 *      It uses the "witness" pattern to cryptographically bind the payment destination,
 *      preventing facilitators from redirecting funds.
 *
 *      Unlike x402UptoPermit2Proxy, this contract always transfers the EXACT permitted
 *      amount, similar to EIP-3009's transferWithAuthorization behavior.
 *
 * @author x402 Protocol
 */
contract x402ExactPermit2Proxy is x402BasePermit2Proxy {
    /**
     * @notice Settles a payment using a Permit2 signature
     * @dev This is the standard settlement path when user has already approved Permit2.
     *      Always transfers the exact permitted amount.
     * @param permit The Permit2 transfer authorization
     * @param owner The token owner (payer)
     * @param witness The witness data containing destination and validity window
     * @param signature The payer's signature over the permit and witness
     */
    function settle(
        ISignatureTransfer.PermitTransferFrom calldata permit,
        address owner,
        Witness calldata witness,
        bytes calldata signature
    ) external nonReentrant {
        _settle(permit, permit.permitted.amount, owner, witness, signature);
        emit Settled();
    }

    /**
     * @notice Settles a payment using both EIP-2612 permit and Permit2 signature
     * @dev Enables fully gasless flow for tokens supporting EIP-2612.
     *      First submits the EIP-2612 permit to approve Permit2, then settles.
     *      Always transfers the exact permitted amount.
     * @param permit2612 The EIP-2612 permit parameters
     * @param permit The Permit2 transfer authorization
     * @param owner The token owner (payer)
     * @param witness The witness data containing destination and validity window
     * @param signature The payer's signature over the permit and witness
     *
     * @dev This function will succeed even if the EIP-2612 permit fails,
     *      as long as the Permit2 approval already exists
     */
    function settleWithPermit(
        EIP2612Permit calldata permit2612,
        ISignatureTransfer.PermitTransferFrom calldata permit,
        address owner,
        Witness calldata witness,
        bytes calldata signature
    ) external nonReentrant {
        _executePermit(permit.permitted.token, owner, permit2612, permit.permitted.amount);
        _settle(permit, permit.permitted.amount, owner, witness, signature);
        emit SettledWithPermit();
    }
}
