"""
FastAPI middleware for x402 payment requirements.

Install: pip install x402[fastapi]
Usage:   from x402.fastapi.middleware import require_payment

Example:
    from fastapi import FastAPI
    from x402.fastapi.middleware import require_payment

    app = FastAPI()
    app.middleware("http")(require_payment(price="$0.001", pay_to_address="0x..."))
"""

