import json
from typing import Any, Dict, List, Optional

from x402.chains import get_chain_id
from x402.common import x402_VERSION
from x402.evm_paywall_template import EVM_PAYWALL_TEMPLATE
from x402.svm_paywall_template import SVM_PAYWALL_TEMPLATE
from x402.types import PaymentRequirements, PaywallConfig


def get_paywall_template(network: str) -> str:
    """Get the appropriate paywall template for the given network."""
    if network.startswith("solana:"):
        return SVM_PAYWALL_TEMPLATE
    return EVM_PAYWALL_TEMPLATE


def is_browser_request(headers: Dict[str, Any]) -> bool:
    """
    Determine if request is from a browser vs API client.

    Args:
        headers: Dictionary of request headers (case-insensitive keys)

    Returns:
        True if request appears to be from a browser, False otherwise
    """
    headers_lower = {k.lower(): v for k, v in headers.items()}
    accept_header = headers_lower.get("accept", "")
    user_agent = headers_lower.get("user-agent", "")

    if "text/html" in accept_header and "Mozilla" in user_agent:
        return True

    return False


def create_x402_config(
    error: str,
    payment_requirements: List[PaymentRequirements],
    paywall_config: Optional[PaywallConfig] = None,
) -> Dict[str, Any]:
    """Create x402 configuration object from payment requirements."""

    requirements = payment_requirements[0] if payment_requirements else None
    display_amount = 0
    current_url = ""
    testnet = True

    if requirements:
        # Convert atomic amount back to USD (assuming USDC with 6 decimals)
        try:
            display_amount = float(requirements.amount) / 1000000  # USDC has 6 decimals
        except (ValueError, TypeError):
            display_amount = 0

        # resource field is removed in v2
        current_url = ""
        testnet = requirements.network == "eip155:84532"

    # Get paywall config values or defaults
    config = paywall_config or {}

    formatted_requirements = []
    if payment_requirements:
        for req in payment_requirements:
            req_dict = req.model_dump(by_alias=True)

            # Inject fields required specifically by EVM_PAYWALL_TEMPLATE and SVM_PAYWALL_TEMPLATE.
            # These templates are currently hardcoded to expect these keys (chainId, tokenAddress, recipient)
            # to initialize their internal wallet connection logic.

            # 1. Inject chainId (int) derived from network
            try:
                # get_chain_id returns string (e.g. "84532"), convert to int
                chain_id_str = get_chain_id(req.network)
                req_dict["chainId"] = int(chain_id_str)
            except (ValueError, TypeError):
                # If network is not EIP155 or invalid, skip chainId injection
                pass

            # 2. Inject tokenAddress (alias for asset)
            if "asset" in req_dict and "tokenAddress" not in req_dict:
                req_dict["tokenAddress"] = req_dict["asset"]

            # 3. Inject recipient (alias for payTo)
            if "payTo" in req_dict and "recipient" not in req_dict:
                req_dict["recipient"] = req_dict["payTo"]

            formatted_requirements.append(req_dict)

    # Create the window.x402 configuration object
    return {
        "paymentRequired": {
            "accepts": formatted_requirements,
            "x402Version": x402_VERSION,
            "error": error,
        },
        "amount": display_amount,
        "paymentRequirements": formatted_requirements,
        "testnet": testnet,
        "currentUrl": current_url,
        "error": error,
        "x402Version": x402_VERSION,
        "appName": config.get("app_name", ""),
        "appLogo": config.get("app_logo", ""),
    }


def inject_payment_data(
    html_content: str,
    error: str,
    payment_requirements: List[PaymentRequirements],
    paywall_config: Optional[PaywallConfig] = None,
) -> str:
    """Inject payment requirements into HTML as JavaScript variables."""

    # Create x402 configuration object
    x402_config = create_x402_config(error, payment_requirements, paywall_config)

    # Create the configuration script (matching TypeScript pattern)
    log_on_testnet = (
        "console.log('Payment requirements initialized:', window.x402);"
        if x402_config["testnet"]
        else ""
    )

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
    paywall_config: Optional[PaywallConfig] = None,
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
    if not payment_requirements:
        raise ValueError("payment_requirements cannot be empty")
    network = payment_requirements[0].network
    template = get_paywall_template(network)
    return inject_payment_data(template, error, payment_requirements, paywall_config)
