"""
Flask middleware for x402 payment requirements.

Install: pip install x402[flask]
Usage:   from x402.flask.middleware import PaymentMiddleware

Example:
    from flask import Flask
    from x402.flask.middleware import PaymentMiddleware

    app = Flask(__name__)
    middleware = PaymentMiddleware(app)
    middleware.add(path="/weather", price="$0.001", pay_to_address="0x...")
"""

