"""
HTTP client integrations for x402 payment handling.

Core exports (always available):
    - x402Client: Base client for payment handling
    - decode_x_payment_response: Decode X-Payment-Response header

Optional clients (install separately):
    pip install x402[httpx]     → from x402.clients.httpx import x402HttpxClient
    pip install x402[requests]  → from x402.clients.requests import x402_requests
"""

from x402.clients.base import x402Client, decode_x_payment_response

__all__ = [
    "x402Client",
    "decode_x_payment_response",
]
