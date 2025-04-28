from flask import Flask, jsonify
from decimal import Decimal

from x402 import x402_payment_required

app = Flask(__name__)

@app.route('/payment', methods=['GET'])
@x402_payment_required(
    Decimal('0.01'),
    '0x0000000000000000000000000000000000000000',
    description='Premium Content',
    testnet=True,
    resource_root_url="http://example.com",
)
def payment_route():
    """
    A sample route that requires payment.
    """
    return jsonify({"message": "Payment successful!"}), 200

if __name__ == '__main__':
    app.run(debug=True)
