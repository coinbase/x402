//! Paywall HTML template
//!
//! This module contains the base HTML template for the x402 paywall.

/// Get the base HTML template
pub fn get_base_template() -> &'static str {
    include_str!("paywall.html")
}

/// Get a simple fallback HTML template
pub fn get_simple_template() -> &'static str {
    r#"<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Payment Required</title>
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0; 
            padding: 0; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .container { 
            background: white;
            border-radius: 12px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            padding: 2rem;
            max-width: 500px;
            width: 90%;
            text-align: center;
        }
        .logo {
            width: 64px;
            height: 64px;
            margin: 0 auto 1rem;
            background: #f0f0f0;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
        }
        h1 { 
            color: #333; 
            margin-bottom: 0.5rem;
            font-size: 1.5rem;
        }
        .subtitle {
            color: #666;
            margin-bottom: 1.5rem;
            line-height: 1.5;
        }
        .payment-info {
            background: #f8f9fa;
            border-radius: 8px;
            padding: 1rem;
            margin: 1rem 0;
            text-align: left;
        }
        .payment-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 0.5rem;
        }
        .payment-row:last-child {
            margin-bottom: 0;
        }
        .label {
            color: #666;
            font-weight: 500;
        }
        .value {
            color: #333;
            font-weight: 600;
        }
        .error {
            background: #fee;
            color: #c33;
            padding: 0.75rem;
            border-radius: 6px;
            margin: 1rem 0;
            border-left: 4px solid #c33;
        }
        .instructions {
            background: #e3f2fd;
            color: #1976d2;
            padding: 0.75rem;
            border-radius: 6px;
            margin: 1rem 0;
            font-size: 0.9rem;
        }
        .instructions a {
            color: #1976d2;
            text-decoration: none;
            font-weight: 600;
        }
        .instructions a:hover {
            text-decoration: underline;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">💰</div>
        <h1>Payment Required</h1>
        <div class="subtitle">
            This resource requires payment to access. Please provide a valid X-PAYMENT header.
        </div>
        
        <div id="payment-details" class="payment-info" style="display: none;">
            <div class="payment-row">
                <span class="label">Amount:</span>
                <span class="value" id="amount">$0.00 USDC</span>
            </div>
            <div class="payment-row">
                <span class="label">Network:</span>
                <span class="value" id="network">Base Sepolia</span>
            </div>
            <div class="payment-row">
                <span class="label">Description:</span>
                <span class="value" id="description">Payment required</span>
            </div>
        </div>
        
        <div id="error-message" class="error" style="display: none;"></div>
        
        <div id="instructions" class="instructions" style="display: none;">
            <strong>How to pay:</strong><br>
            1. Connect your wallet<br>
            2. Switch to the correct network<br>
            3. Ensure you have sufficient USDC balance<br>
            4. Retry the request with payment
        </div>
        
        <div id="testnet-info" class="instructions" style="display: none;">
            Need testnet USDC? <a href="https://faucet.circle.com/" target="_blank">Get some here</a>.
        </div>
    </div>

    <script>
        // Initialize the paywall when the page loads
        document.addEventListener('DOMContentLoaded', function() {
            if (window.x402) {
                initializePaywall();
            } else {
                console.warn('x402 configuration not found');
                showInstructions();
            }
        });

        function initializePaywall() {
            const config = window.x402;
            
            // Show payment details
            if (config.amount > 0) {
                document.getElementById('amount').textContent = `$${config.amount} USDC`;
                document.getElementById('network').textContent = config.testnet ? 'Base Sepolia' : 'Base';
                document.getElementById('description').textContent = config.paymentRequirements[0]?.description || 'Payment required';
                document.getElementById('payment-details').style.display = 'block';
            }
            
            // Show error message
            if (config.error) {
                document.getElementById('error-message').textContent = config.error;
                document.getElementById('error-message').style.display = 'block';
            }
            
            // Show testnet instructions
            if (config.testnet) {
                document.getElementById('testnet-info').style.display = 'block';
            }
            
            // Show general instructions
            showInstructions();
        }

        function showInstructions() {
            document.getElementById('instructions').style.display = 'block';
        }
    </script>
</body>
</html>"#
}
