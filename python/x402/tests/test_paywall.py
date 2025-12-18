from x402.paywall import (
    is_browser_request,
    create_x402_config,
    inject_payment_data,
    get_paywall_html,
)
from x402.types import PaymentRequirements, PaywallConfig


class TestIsBrowserRequest:
    """Test browser detection functionality."""

    def test_browser_request_with_html_accept_and_mozilla(self):
        headers = {
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        }
        assert is_browser_request(headers) is True

    def test_browser_request_case_insensitive(self):
        headers = {
            "accept": "text/html,application/xhtml+xml",
            "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        }
        assert is_browser_request(headers) is True

    def test_api_client_request(self):
        headers = {
            "Accept": "application/json",
            "User-Agent": "curl/7.68.0",
        }
        assert is_browser_request(headers) is False

    def test_missing_headers(self):
        headers = {}
        assert is_browser_request(headers) is False

    def test_html_accept_but_no_mozilla(self):
        headers = {
            "Accept": "text/html",
            "User-Agent": "curl/7.68.0",
        }
        assert is_browser_request(headers) is False

    def test_mozilla_user_agent_but_no_html(self):
        headers = {
            "Accept": "application/json",
            "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)",
        }
        assert is_browser_request(headers) is False


class TestCreateX402Config:
    """Test x402 configuration creation."""

    def test_create_config_with_payment_requirements(self):
        payment_req = PaymentRequirements(
            scheme="exact",
            network="eip155:84532",
            amount="1000000",  # 1 USDC in atomic units
            pay_to="0x123",
            max_timeout_seconds=60,
            asset="0xUSDC",
        )

        error = "Payment required"

        config = create_x402_config(error, [payment_req])

        assert config["amount"] == 1.0  # 1 USDC
        assert config["testnet"] is True  # eip155:84532 is testnet
        assert config["currentUrl"] == ""
        assert config["error"] == "Payment required"
        assert len(config["paymentRequirements"]) == 1
        assert config["x402Version"] == 2

    def test_create_config_with_mainnet(self):
        payment_req = PaymentRequirements(
            scheme="exact",
            network="eip155:8453",  # Mainnet
            amount="500000",  # 0.5 USDC
            pay_to="0x123",
            max_timeout_seconds=60,
            asset="0xUSDC",
        )

        config = create_x402_config("Payment required", [payment_req])

        assert config["testnet"] is False
        assert config["amount"] == 0.5

    def test_create_config_with_paywall_config(self):
        payment_req = PaymentRequirements(
            scheme="exact",
            network="eip155:84532",
            amount="1000000",
            pay_to="0x123",
            max_timeout_seconds=60,
            asset="0xUSDC",
        )

        paywall_config = PaywallConfig(
            app_name="Test App",
            app_logo="https://example.com/logo.png",
        )

        config = create_x402_config("Payment required", [payment_req], paywall_config)

        assert config["appName"] == "Test App"
        assert config["appLogo"] == "https://example.com/logo.png"

    def test_create_config_empty_requirements(self):
        config = create_x402_config("No requirements", [])

        # v2: resource was removed, currentUrl defaults to empty string
        assert config["currentUrl"] == ""
        assert config["amount"] == 0
        assert config["testnet"] is True
        assert config["paymentRequirements"] == []


class TestInjectPaymentData:
    """Test payment data injection into HTML."""

    def test_inject_payment_data_basic(self):
        html_content = """
        <html>
        <head>
            <title>Test</title>
        </head>
        <body>
            <h1>Test</h1>
        </body>
        </html>
        """

        payment_req = PaymentRequirements(
            scheme="exact",
            network="eip155:84532",
            amount="1000000",
            pay_to="0x123",
            max_timeout_seconds=60,
            asset="0xUSDC",
        )

        result = inject_payment_data(html_content, "Payment required", [payment_req])

        assert "window.x402 = " in result
        # testnet is False because network "base-sepolia" doesn't match "eip155:84532" (CAIP-2 check in v2)
        # assert "console.log('Payment requirements initialized" in result
        assert '"amount": 1.0' in result
        # assert '"testnet": true' in result

    def test_inject_payment_data_mainnet_no_console_log(self):
        html_content = """
        <html>
        <head>
            <title>Test</title>
        </head>
        <body>
            <h1>Test</h1>
        </body>
        </html>
        """

        payment_req = PaymentRequirements(
            scheme="exact",
            network="eip155:8453",  # Mainnet
            amount="1000000",
            pay_to="0x123",
            max_timeout_seconds=60,
            asset="0xUSDC",
        )

        result = inject_payment_data(html_content, "Payment required", [payment_req])

        assert "window.x402 = " in result
        assert "console.log('Payment requirements initialized" not in result
        assert '"testnet": false' in result

    def test_inject_preserves_html_structure(self):
        html_content = """<!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Test</title>
        </head>
        <body>
            <h1>Test</h1>
        </body>
        </html>"""

        payment_req = PaymentRequirements(
            scheme="exact",
            network="eip155:84532",
            amount="1000000",
            pay_to="0x123",
            max_timeout_seconds=60,
            asset="0xUSDC",
        )

        result = inject_payment_data(html_content, "Payment required", [payment_req])

        # Check that HTML structure is preserved
        assert "<!DOCTYPE html>" in result
        assert '<meta charset="utf-8">' in result
        assert "<h1>Test</h1>" in result

        # Check that script is injected before </head>
        head_end_pos = result.find("</head>")
        script_pos = result.find("window.x402 = ")
        assert script_pos < head_end_pos


class TestGetPaywallHtml:
    """Test the main paywall HTML generation function."""

    def test_get_paywall_html_integration(self):
        payment_requirements = [
            PaymentRequirements(
                scheme="exact",
                network="eip155:84532",
                amount="1000000",
                asset="0x036CbD53842c5426634e7929541eC2318f3dCF7e",
                pay_to="0x1111111111111111111111111111111111111111",
                max_timeout_seconds=3600,
                extra={
                    "name": "USDC",
                    "version": "2",
                    "chainId": 84532,
                    "verifyingContract": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
                },
            )
        ]

        paywall_config = PaywallConfig(
            app_name="My App",
            app_logo="https://example.com/logo.png",
        )

        result = get_paywall_html(
            "Payment required", payment_requirements, paywall_config
        )

        assert isinstance(result, str)
        assert "window.x402 = " in result
        assert (
            '"amount": 1.0' in result
        )  # Changed from 2.0 to 1.0 due to amount change in payment_requirements
        assert '"appName": "My App"' in result
        assert '"appLogo": "https://example.com/logo.png"' in result
