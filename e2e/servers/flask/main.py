import os
import signal
import sys
import logging
from flask import Flask, jsonify, request
from dotenv import load_dotenv
from x402.flask.middleware import PaymentMiddleware

# Configure logging to reduce verbosity
logging.getLogger("werkzeug").setLevel(logging.ERROR)
logging.getLogger("flask").setLevel(logging.ERROR)

# Load environment variables
load_dotenv()

# Get configuration from environment
USE_CDP_FACILITATOR = os.getenv("USE_CDP_FACILITATOR", "false").lower() == "true"
NETWORK = os.getenv("EVM_NETWORK", "base-sepolia")
ADDRESS = os.getenv("EVM_ADDRESS")
PORT = int(os.getenv("PORT", "4021"))

# CDP facilitator configuration
CDP_API_KEY_ID = os.getenv("CDP_API_KEY_ID")
CDP_API_KEY_SECRET = os.getenv("CDP_API_KEY_SECRET")

if not ADDRESS:
    print("Error: Missing required environment variable ADDRESS")
    sys.exit(1)

# Validate CDP configuration if using CDP facilitator
if USE_CDP_FACILITATOR and (not CDP_API_KEY_ID or not CDP_API_KEY_SECRET):
    print(
        "Error: CDP facilitator enabled but missing CDP_API_KEY_ID or CDP_API_KEY_SECRET"
    )
    sys.exit(1)

app = Flask(__name__)

# Create facilitator config if using CDP
facilitator_config = None
if USE_CDP_FACILITATOR:
    from cdp.x402 import create_facilitator_config

    facilitator_config = create_facilitator_config(CDP_API_KEY_ID, CDP_API_KEY_SECRET)

# Initialize payment middleware
payment_middleware = PaymentMiddleware(app)

# Apply payment middleware to protected endpoint
payment_middleware.add(
    path="/protected",
    price="$0.001",
    pay_to_address=ADDRESS,
    network=NETWORK,
    facilitator_config=facilitator_config,
)

# Global flag to track if server should accept new requests
shutdown_requested = False


@app.route("/protected")
def protected_endpoint():
    """Protected endpoint that requires payment"""
    if shutdown_requested:
        return jsonify({"error": "Server shutting down"}), 503

    return jsonify(
        {
            "message": "Access granted to protected resource",
            "timestamp": "2024-01-01T00:00:00Z",
            "data": {"resource": "premium_content", "access_level": "paid"},
        }
    )


@app.route("/health")
def health_check():
    """Health check endpoint"""
    return jsonify(
        {"status": "healthy", "timestamp": "2024-01-01T00:00:00Z", "server": "flask"}
    )


@app.route("/close", methods=["POST"])
def close_server():
    """Graceful shutdown endpoint"""
    global shutdown_requested
    shutdown_requested = True

    # Schedule server shutdown after response
    def shutdown():
        os.kill(os.getpid(), signal.SIGTERM)

    import threading

    timer = threading.Timer(0.1, shutdown)
    timer.start()

    return jsonify(
        {
            "message": "Server shutting down gracefully",
            "timestamp": "2024-01-01T00:00:00Z",
        }
    )


def signal_handler(signum, frame):
    """Handle shutdown signals gracefully"""
    print("Received shutdown signal, exiting...")
    sys.exit(0)


if __name__ == "__main__":
    # Set up signal handlers for graceful shutdown
    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)

    print(f"Starting Flask server on port {PORT}")
    print(f"Server address: {ADDRESS}")
    print(f"Network: {NETWORK}")
    print(f"Using CDP facilitator: {USE_CDP_FACILITATOR}")
    print("Server listening on port", PORT)

    app.run(
        host="127.0.0.1",
        port=PORT,
        debug=False,  # Disable debug mode to reduce logs
        use_reloader=False,  # Disable reloader to reduce logs
    )
