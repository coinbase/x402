#!/usr/bin/env python3
"""
XRP X402 Facilitator Server

A standalone FastAPI server that provides verify and settle endpoints for XRP Ledger transactions.
This facilitator supports the exact scheme for XRP payments on testnet/devnet.
"""

import os
import sys
import json
import asyncio
import logging
from typing import Dict, Any, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import uvicorn
from dotenv import load_dotenv

# Add the x402 package to path if running from facilitators directory
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../python/x402/src"))

from xrpl.clients import JsonRpcClient
from xrpl.wallet import Wallet
from xrpl.models.transactions import Payment
from xrpl.models.requests import SubmitOnly, Tx
from xrpl.core import addresscodec
from xrpl.utils import xrp_to_drops
import xrpl.transaction as xrpl_tx

from x402.types import PaymentPayload, PaymentRequirements
from x402.chains import get_xrp_network_config
from x402.encoding import safe_base64_decode

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="XRP X402 Facilitator",
    description="Facilitator service for XRP X402 payments",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
XRP_NETWORK = os.getenv("XRP_NETWORK", "xrp-testnet")
XRP_WALLET_SEED = os.getenv("XRP_WALLET_SEED", "")

# Request/Response models
class VerifyRequest(BaseModel):
    x402Version: int = Field(default=1)
    paymentHeader: str
    paymentRequirements: Dict[str, Any]

class SettleRequest(BaseModel):
    x402Version: int = Field(default=1)
    paymentHeader: str
    paymentRequirements: Dict[str, Any]

class VerifyResponse(BaseModel):
    isValid: bool
    invalidReason: Optional[str] = None

class SettleResponse(BaseModel):
    success: bool
    error: Optional[str] = None
    txHash: Optional[str] = None
    networkId: Optional[str] = None

class SupportedKind(BaseModel):
    scheme: str
    network: str

class SupportedResponse(BaseModel):
    kinds: list[SupportedKind]

# XRP client singleton
xrp_client = None

def get_xrp_client():
    """Get or create XRP client"""
    global xrp_client
    if xrp_client is None:
        config = get_xrp_network_config(XRP_NETWORK)
        xrp_client = JsonRpcClient(config["jsonrpc"])
    return xrp_client

def decode_payment_header(payment_header: str) -> PaymentPayload:
    """Decode base64 payment header to PaymentPayload"""
    try:
        decoded = safe_base64_decode(payment_header)
        payload_data = json.loads(decoded)
        return PaymentPayload(**payload_data)
    except Exception as e:
        raise ValueError(f"Invalid payment header: {e}")

@app.on_event("startup")
async def startup_event():
    """Initialize connections on startup"""
    logger.info(f"Starting XRP X402 Facilitator for network: {XRP_NETWORK}")
    if XRP_WALLET_SEED:
        wallet = Wallet.from_seed(seed=XRP_WALLET_SEED)
        logger.info(f"Facilitator wallet address: {wallet.address}")

@app.get("/")
async def root():
    """Health check endpoint"""
    return {"status": "healthy", "service": "XRP X402 Facilitator", "network": XRP_NETWORK}

@app.get("/supported")
async def get_supported() -> SupportedResponse:
    """Get supported payment kinds"""
    kinds = [
        SupportedKind(scheme="exact", network="xrp-testnet"),
        SupportedKind(scheme="exact", network="xrp-devnet")
    ]
    return SupportedResponse(kinds=kinds)

@app.post("/verify")
async def verify_payment(request: VerifyRequest) -> VerifyResponse:
    """Verify an XRP payment"""
    try:
        # Decode payment header
        payment = decode_payment_header(request.paymentHeader)

        # Validate network
        if payment.network != XRP_NETWORK:
            return VerifyResponse(isValid=False, invalidReason=f"Invalid network. Expected {XRP_NETWORK}, got {payment.network}")

        # Validate scheme
        if payment.scheme != "exact":
            return VerifyResponse(isValid=False, invalidReason=f"Unsupported scheme: {payment.scheme}")

        # Extract transaction from payload
        # Handle both dict and object payload
        if hasattr(payment.payload, 'model_dump'):
            payload_dict = payment.payload.model_dump()
        elif isinstance(payment.payload, dict):
            payload_dict = payment.payload
        else:
            payload_dict = dict(payment.payload)

        tx_blob = payload_dict.get("transaction")
        if not tx_blob:
            return VerifyResponse(isValid=False, invalidReason="Missing transaction in payload")

        # Parse transaction JSON
        try:
            if isinstance(tx_blob, str):
                tx_json = json.loads(tx_blob)
            else:
                tx_json = tx_blob
        except json.JSONDecodeError:
            return VerifyResponse(isValid=False, invalidReason="Invalid transaction JSON")

        # Verify transaction type
        if tx_json.get("TransactionType") != "Payment":
            return VerifyResponse(isValid=False, invalidReason="Transaction must be a Payment type")

        # Verify destination address matches payTo
        requirements = PaymentRequirements(**request.paymentRequirements)
        if tx_json.get("Destination") != requirements.pay_to:
            return VerifyResponse(
                isValid=False,
                invalidReason=f"Destination mismatch. Expected {requirements.pay_to}, got {tx_json.get('Destination')}"
            )

        # Verify amount
        tx_amount = tx_json.get("Amount")
        required_amount = requirements.max_amount_required

        # Handle XRP amounts (in drops)
        if isinstance(tx_amount, str) and tx_amount.isdigit():
            if int(tx_amount) < int(required_amount):
                return VerifyResponse(
                    isValid=False,
                    invalidReason=f"Insufficient amount. Required {required_amount} drops, got {tx_amount}"
                )

        # Verify signature exists
        if not payload_dict.get("signature"):
            return VerifyResponse(isValid=False, invalidReason="Missing signature in payload")

        # Future enhancements for production deployment:
        # - Cryptographic signature verification
        # - On-chain transaction existence checking
        # - Sequence number validation for replay protection

        logger.info(f"Payment verified successfully for {tx_json.get('Account')} -> {tx_json.get('Destination')}")
        return VerifyResponse(isValid=True)

    except Exception as e:
        logger.error(f"Error verifying payment: {e}", exc_info=True)
        return VerifyResponse(isValid=False, invalidReason=str(e))

@app.post("/settle")
async def settle_payment(request: SettleRequest) -> SettleResponse:
    """Settle an XRP payment by submitting it to the network"""
    try:
        # Decode payment header
        payment = decode_payment_header(request.paymentHeader)

        # Validate network
        if payment.network != XRP_NETWORK:
            return SettleResponse(success=False, error=f"Invalid network. Expected {XRP_NETWORK}, got {payment.network}")

        # Handle both dict and object payload
        if hasattr(payment.payload, 'model_dump'):
            payload_dict = payment.payload.model_dump()
        elif isinstance(payment.payload, dict):
            payload_dict = payment.payload
        else:
            payload_dict = dict(payment.payload)

        # Get the signed transaction blob
        tx_blob = payload_dict.get("signature")  # In XRP, the signature field contains the signed tx blob
        if not tx_blob:
            return SettleResponse(success=False, error="Missing transaction blob (signature) in payload")

        # Submit transaction to XRP Ledger
        client = get_xrp_client()

        try:
            # Submit the transaction to XRP Ledger
            submit_request = SubmitOnly(tx_blob=tx_blob)

            # Use requests to submit directly to the XRP node (avoiding async issues)
            import requests as http_requests
            network_config = get_xrp_network_config(XRP_NETWORK)

            request_data = {
                "method": "submit",
                "params": [{"tx_blob": tx_blob}]
            }

            logger.info(f"Submitting transaction to {network_config['jsonrpc']}")

            http_response = http_requests.post(
                network_config['jsonrpc'],
                json=request_data,
                headers={"Content-Type": "application/json"}
            )

            if http_response.status_code == 200:
                xrp_response = http_response.json()

                if "result" in xrp_response:
                    result = xrp_response["result"]
                    engine_result = result.get("engine_result", "")

                    class XRPResponse:
                        def __init__(self, data):
                            self.result = data
                        def is_successful(self):
                            return True

                    response = XRPResponse(result)
                else:
                    logger.error(f"No result in XRP response: {xrp_response}")
                    return SettleResponse(success=False, error="Invalid response from XRP node")
            else:
                logger.error(f"HTTP error submitting transaction: {http_response.status_code}")
                return SettleResponse(success=False, error=f"HTTP error: {http_response.status_code}")

            if response.is_successful():
                # Extract transaction hash
                result = response.result
                tx_hash = result.get("tx_json", {}).get("hash") or result.get("hash")

                # Check if transaction was accepted
                engine_result = result.get("engine_result", "")
                if engine_result.startswith("tes"):  # Success codes start with "tes"
                    logger.info(f"Transaction settled successfully: {tx_hash}")
                    return SettleResponse(
                        success=True,
                        txHash=tx_hash,
                        networkId=XRP_NETWORK
                    )
                else:
                    error_msg = f"Transaction failed: {engine_result} - {result.get('engine_result_message', '')}"
                    logger.warning(error_msg)
                    return SettleResponse(success=False, error=error_msg)
            else:
                error = response.result.get("error_message", "Unknown error")
                logger.error(f"Failed to submit transaction: {error}")
                return SettleResponse(success=False, error=error)

        except Exception as submit_error:
            logger.error(f"Error submitting transaction: {submit_error}", exc_info=True)
            return SettleResponse(success=False, error=str(submit_error))

    except Exception as e:
        logger.error(f"Error settling payment: {e}", exc_info=True)
        return SettleResponse(success=False, error=str(e))

@app.on_event("shutdown")
async def shutdown_event():
    """Clean up on shutdown"""
    global xrp_client
    if xrp_client:
        # JsonRpcClient doesn't have a close method
        xrp_client = None

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)