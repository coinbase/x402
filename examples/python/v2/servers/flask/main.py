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

# Initialize V2 payment middleware
payment_middleware = PaymentMiddleware(app)

# Apply payment middleware to weather route
payment_middleware.add(
    path="/weather",
    price="$0.01",
    pay_to_address=ADDRESS,
    network="eip155:84532",  # Base Sepolia (CAIP-2)
    description="V2 Weather Data",
    mime_type="application/json",
)

# Apply payment middleware to premium routes (Custom Token)
payment_middleware.add(
    path="/premium/*",
    price=TokenAmount(
        amount="10000",  # 0.01 USDC
        asset=TokenAsset(
            address="0x036CbD53842c5426634e7929541eC2318f3dCF7e",
            decimals=6,
            eip712=EIP712Domain(name="USDC", version="2"),
        ),
    ),
    pay_to_address=ADDRESS,
    network="eip155:84532",
    description="V2 Premium Content",
    mime_type="application/json",
)


@app.route("/weather")
def get_weather():
    return jsonify(
        {"report": {"weather": "sunny", "temperature": 72, "v2_compliant": True}}
    )


@app.route("/premium/content")
def get_premium_content():
    return jsonify(
        {
            "content": "This is premium content (V2)",
            "access": "granted_via_custom_token",
        }
    )


@app.route("/public")
def public():
    return jsonify({"message": "This is a public endpoint."})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=4021, debug=True)
