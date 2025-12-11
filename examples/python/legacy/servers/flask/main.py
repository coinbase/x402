import os
from flask import Flask, jsonify
from dotenv import load_dotenv
from x402.flask.middleware import PaymentMiddleware
from x402.types import EIP712Domain, TokenAmount, TokenAsset

# Load environment variables
load_dotenv()

# Get configuration from environment
ADDRESS = os.getenv("ADDRESS")

if not ADDRESS:
    raise ValueError("Missing required environment variables")

app = Flask(__name__)

# Initialize payment middleware
payment_middleware = PaymentMiddleware(app)

# Apply payment middleware to specific routes
payment_middleware.add(
    path="/weather",
    price="$0.001",
    pay_to_address=ADDRESS,
    network="base-sepolia",
)

# Apply payment middleware to premium routes
payment_middleware.add(
    path="/premium/*",
    price=TokenAmount(
        amount="10000",
        asset=TokenAsset(
            address="0x036CbD53842c5426634e7929541eC2318f3dCF7e",
            decimals=6,
            eip712=EIP712Domain(name="USDC", version="2"),
        ),
    ),
    pay_to_address=ADDRESS,
    network="base-sepolia",
)


@app.route("/weather")
def get_weather():
    return jsonify(
        {
            "report": {
                "weather": "sunny",
                "temperature": 70,
            }
        }
    )


@app.route("/premium/content")
def get_premium_content():
    return jsonify(
        {
            "content": "This is premium content",
        }
    )


@app.route("/public")
def public():
    return jsonify({"message": "This is a public endpoint."})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=4021, debug=True)
