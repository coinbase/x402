import json
from pathlib import Path
from typing import Dict, Any, List, Optional

from x402.types import PaymentRequirements, PaywallConfig
from x402.common import x402_VERSION


def load_paywall_html() -> str:
    """Load the paywall HTML file from package resources."""
    try:
        # Try to load the HTML file from the static directory
        # Look for the file relative to this module
        current_dir = Path(__file__).parent.parent
        paywall_file = current_dir / 'static' / 'paywall.html'
        
        if paywall_file.exists():
            html_content = paywall_file.read_text(encoding='utf-8')
            return html_content
        else:
            # File doesn't exist, use fallback
            return create_simple_fallback_html()
    except Exception:
        # Fallback to a simple HTML paywall if file can't be loaded
        return create_simple_fallback_html()


def create_x402_config(
    error: str,
    payment_requirements: List[PaymentRequirements],
    paywall_config: Optional[PaywallConfig] = None
) -> Dict[str, Any]:
    """Create x402 configuration object from payment requirements."""
    
    requirements = payment_requirements[0] if payment_requirements else None
    display_amount = 0
    current_url = ""
    testnet = True
    
    if requirements:
        # Convert atomic amount back to USD (assuming USDC with 6 decimals)
        try:
            display_amount = float(requirements.max_amount_required) / 1000000  # USDC has 6 decimals
        except (ValueError, TypeError):
            display_amount = 0
        
        current_url = requirements.resource or ""
        testnet = requirements.network == "base-sepolia"
    
    # Get paywall config values or defaults
    config = paywall_config or {}
    
    # Create the window.x402 configuration object
    return {
        "amount": display_amount,
        "paymentRequirements": [req.model_dump(by_alias=True) for req in payment_requirements],
        "testnet": testnet,
        "currentUrl": current_url,
        "error": error,
        "x402_version": x402_VERSION,
        "cdpClientKey": config.get("cdp_client_key", ""),
        "appName": config.get("app_name", ""),
        "appLogo": config.get("app_logo", ""),
        "sessionTokenEndpoint": config.get("session_token_endpoint", ""),
    }


def inject_payment_data(
    html_content: str, 
    error: str,
    payment_requirements: List[PaymentRequirements],
    paywall_config: Optional[PaywallConfig] = None
) -> str:
    """Inject payment requirements into HTML as JavaScript variables."""
    
    # Create x402 configuration object
    x402_config = create_x402_config(error, payment_requirements, paywall_config)
    
    # Create the configuration script (matching TypeScript pattern)
    log_on_testnet = "console.log('Payment requirements initialized:', window.x402);" if x402_config["testnet"] else ""
    
    config_script = f"""
  <script>
    window.x402 = {json.dumps(x402_config)};
    {log_on_testnet}
  </script>"""

    # Inject the configuration script into the head (same as TypeScript)
    return html_content.replace("</head>", f"{config_script}\n</head>")


def get_paywall_html(
    error: str,
    payment_requirements: List[PaymentRequirements],
    paywall_config: Optional[PaywallConfig] = None
) -> str:
    """
    Load paywall HTML and inject payment data.
    
    Args:
        error: Error message to display
        payment_requirements: List of payment requirements
        paywall_config: Optional paywall UI configuration
        
    Returns:
        Complete HTML with injected payment data
    """
    html_content = load_paywall_html()
    return inject_payment_data(html_content, error, payment_requirements, paywall_config)


def create_simple_fallback_html() -> str:
    """Simple fallback HTML if main paywall file can't be loaded."""
    return """
    <!DOCTYPE html>
    <html>
    <head>
        <title>Payment Required</title>
        <meta charset="utf-8">
        <style>
            body {
                font-family: Arial, sans-serif;
                max-width: 600px;
                margin: 50px auto;
                padding: 20px;
                background-color: #f5f5f5;
            }
            .container {
                background: white;
                padding: 30px;
                border-radius: 8px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            h1 {
                color: #333;
                text-align: center;
            }
            .payment-details {
                background: #f8f9fa;
                padding: 15px;
                border-radius: 5px;
                margin-top: 20px;
            }
            pre {
                white-space: pre-wrap;
                word-wrap: break-word;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Payment Required</h1>
            <p>This resource requires payment to access. Please provide a valid payment to continue.</p>
            <div id="payment-details" class="payment-details"></div>
        </div>
        <script>
            // The injected payment data will be available here
            if (window.x402) {
                document.getElementById('payment-details').innerHTML = 
                    '<h3>Payment Requirements:</h3><pre>' + 
                    JSON.stringify(window.x402, null, 2) + 
                    '</pre>';
            }
        </script>
    </body>
    </html>
    """ 