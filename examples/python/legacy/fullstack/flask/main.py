import os
from waitress import serve

from dotenv import load_dotenv
from flask import Flask, send_from_directory
from x402.flask.middleware import PaymentMiddleware
from x402.types import PaywallConfig

# Load environment variables
load_dotenv()

# Get configuration from environment
NETWORK = os.getenv("NETWORK", "base-sepolia")
ADDRESS = os.getenv("ADDRESS")
CDP_CLIENT_KEY = os.getenv("CDP_CLIENT_KEY")

if not ADDRESS:
    raise ValueError("Missing required environment variables")

app = Flask(__name__)

# Configure Flask to serve static files
@app.route('/static/<path:filename>')
def serve_static(filename):
    return send_from_directory('static', filename)


# Initialize payment middleware
payment_middleware = PaymentMiddleware(app)

# Apply payment middleware to premium routes with paywall config
payment_middleware.add(
    path="/premium/*",
    price="$0.01",
    pay_to_address=ADDRESS,
    network=NETWORK,
    paywall_config=PaywallConfig(
        cdp_client_key=CDP_CLIENT_KEY or "",
        app_name="x402 Python Example",
        app_logo="/static/x402.png",
    ),
)

@app.route("/premium/content")
def get_premium_content():
    return send_from_directory('static', 'premium.html')

if __name__ == "__main__":
    print("Starting server on http://0.0.0.0:4021")
    serve(app, host="0.0.0.0", port=4021)
