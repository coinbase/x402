package shared

import (
	"bytes"
	"encoding/json"
	"fmt"
	"html/template"
	"math/big"
	"strings"

	"github.com/coinbase/x402/go/pkg/types"
)

type PaywallOptions struct {
	Amount              *big.Int
	PaymentRequirements *types.PaymentRequirements
	CurrentURL          string
	Testnet             bool
}

func GetPaywallHTML(opts PaywallOptions) (string, error) {
	paymentRequirementsJSON, err := json.Marshal(opts.PaymentRequirements)
	if err != nil {
		return "", fmt.Errorf("failed to marshal payment requirements: %w", err)
	}

	networkName := "Base Sepolia"
	if !opts.Testnet {
		networkName = "Base Mainnet"
	}

	tmplData := struct {
		Amount                 string
		PaymentRequirementsRaw template.JS
		CurrentURL             string
		Testnet                bool
		NetworkName            string
		Description            string
	}{
		Amount: formatBigIntAsFloatString(
			opts.Amount,
			1e6, // assuming USDC
		),
		PaymentRequirementsRaw: template.JS(paymentRequirementsJSON),
		CurrentURL:             opts.CurrentURL,
		Testnet:                opts.Testnet,
		NetworkName:            networkName,
		Description:            opts.PaymentRequirements.Description,
	}

	tmpl, err := template.New("paywall").Parse(paywallHTMLTemplate)
	if err != nil {
		fmt.Printf("Failed to parse template :%v", err)
		return "", fmt.Errorf("failed to parse template: %w", err)
	}

	var buf bytes.Buffer
	if err = tmpl.Execute(&buf, tmplData); err != nil {
		fmt.Printf("Failed to execute template :%v", err)
		return "", fmt.Errorf("failed to execute template: %w", err)
	}

	return buf.String(), nil
}

func formatBigIntAsFloatString(value *big.Int, divisor int64) string {
	// Convert the big.Int to big.Float
	valFloat := new(big.Float).SetInt(value)

	// Create a divisor as big.Float
	div := big.NewFloat(float64(divisor))

	// Perform division
	result := new(big.Float).Quo(valFloat, div)

	// Format with high precision, then trim
	str := result.Text('f', 6)
	str = strings.TrimRight(str, "0") // Remove trailing zeroes
	str = strings.TrimRight(str, ".") // Remove trailing decimal point if no digits follow

	return str
}

const paywallHTMLTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Payment Required - $ {{.Amount}}</title>
<link rel="icon" href="/favicon.ico" sizes="any" />

<style>
  /* Reset */
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { line-height: 1.5; -webkit-font-smoothing: antialiased; }
  img, picture, video, canvas, svg { display: block; max-width: 100%; }
  input, button, textarea, select { font: inherit; }
  p, h1, h2, h3, h4, h5, h6 { overflow-wrap: break-word; }

  /* Custom Styles */
  body {
    min-height: 100vh;
    background-color: #f9fafb;
    font-family: system-ui, -apple-system, sans-serif;
  }

  .container {
    max-width: 32rem;
    margin: 4rem auto;
    padding: 1.5rem;
    background-color: white;
    border-radius: 0.75rem;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  }

  .header {
    text-align: center;
    margin-bottom: 2rem;
  }

  .title {
    font-size: 1.5rem;
    font-weight: 700;
    color: #111827;
    margin-bottom: 0.5rem;
  }

  .subtitle {
    color: #4b5563;
    margin-bottom: 1rem;
  }

  .instructions {
    font-size: 0.9rem;
    color: #4b5563;
    font-style: italic;
  }

  .content {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .button {
    width: 100%;
    padding: 0.5rem 1rem;
    border-radius: 0.5rem;
    font-weight: 600;
    border: none;
    cursor: pointer;
    transition: background-color 150ms;
  }

  .button:focus {
    outline: none;
    ring: 2px solid rgba(59, 130, 246, 0.5);
  }

  .button-blue {
    background-color: #2563eb;
    color: white;
  }

  .button-blue:hover {
    background-color: #1d4ed8;
  }

  .button-green {
    background-color: #059669;
    color: white;
  }

  .button-green:hover {
    background-color: #047857;
  }

  .payment-requirements {
    padding: 1rem;
    background-color: #f9fafb;
    border-radius: 0.5rem;
  }

  .payment-row {
    display: flex;
    justify-content: space-between;
    font-size: 0.875rem;
    margin-bottom: 0.5rem;
  }

  .payment-row:last-child {
    margin-bottom: 0;
  }

  .payment-label {
    color: #4b5563;
  }

  .payment-value {
    font-weight: 500;
  }

  .hidden {
    display: none;
  }

  .status {
    text-align: center;
    font-size: 0.875rem;
  }
</style>

<!-- Inject server-side variables -->
<!-- Safe JSON injection for Go templates -->
<script id="x402-payment" type="application/json">
{{.PaymentRequirementsRaw}}
</script>

<script>
try {
  const raw = document.getElementById("x402-payment").textContent;
  const paymentRequirements = JSON.parse(raw);

  window.x402 = {
    paymentRequirements,
    isTestnet: {{.Testnet}},
    currentUrl: "{{.CurrentURL}}",
    state: {
      publicClient: null,
      chain: null,
      walletClient: null
    },
    config: {
      chainConfig: {
        "84532": {
          usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
          usdcName: "USDC"
        },
        "8453": {
          usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          usdcName: "USDC"
        }
      }
    }
  };
} catch (e) {
  console.error("Failed to initialize payment requirements", e);
}
</script>
</script>

<!-- x402 -->
<script type="module">
  import {
    createWalletClient,
    createPublicClient,
    http,
    custom,
    toHex,
  } from 'https://esm.sh/viem'

  import {
    createConfig,
    connect,
    disconnect,
    signMessage,
    getBalance,
  } from 'https://esm.sh/@wagmi/core'

  import { injected, coinbaseWallet } from 'https://esm.sh/@wagmi/connectors'

  import { base, baseSepolia } from 'https://esm.sh/viem/chains'

  const authorizationTypes = {
    EIP712Domain: [
      { name: "name", type: "string" },
      { name: "version", type: "string" },
      { name: "chainId", type: "uint256" },
      { name: "verifyingContract", type: "address" },
    ],
    TransferWithAuthorization: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
    ],
  };

  // USDC ABI for version function
  const usdcABI = [{
    "inputs": [],
    "name": "version",
    "outputs": [{"internalType": "string","name": "","type": "string"}],
    "stateMutability": "view",
    "type": "function"
  }];

  window.x402.utils = {
    createNonce: () => {
      return toHex(crypto.getRandomValues(new Uint8Array(32)));
    },
    safeBase64Encode: (data) => {
      if (typeof window !== "undefined") {
        return window.btoa(data);
      }
      return Buffer.from(data).toString("base64");
    },
    getUsdcAddressForChain: (chainId) => {
      return window.x402.config.chainConfig[chainId.toString()].usdcAddress;
    },
    getVersion: async (publicClient, usdcAddress) => {
      const version = await publicClient.readContract({
        address: usdcAddress,
        abi: usdcABI,
        functionName: "version"
      });
      return version;
    },
    encodePayment: (payment) => {
      const safe = {
        ...payment,
        payload: {
          ...payment.payload,
          authorization: Object.fromEntries(
            Object.entries(payment.payload.authorization).map(([key, value]) => [
              key,
              typeof value === "bigint" ? value.toString() : value,
            ])
          ),
        },
      };
      return window.x402.utils.safeBase64Encode(JSON.stringify(safe));
    },
    createPaymentHeader: async (client, publicClient) => {
      const payment = await window.x402.utils.createPayment(client, publicClient);
      return window.x402.utils.encodePayment(payment);
    },
  }

  window.x402.utils.signAuthorization = async (walletClient, authorizationParameters, paymentRequirements, publicClient) => {
    const { networkId } = paymentRequirements;
    const usdcName = window.x402.config.chainConfig[networkId].usdcName;
    const usdcAddress = window.x402.config.chainConfig[networkId].usdcAddress;
    const version = await window.x402.utils.getVersion(publicClient, usdcAddress);
    const { from, to, value, validAfter, validBefore, nonce } = authorizationParameters;
    const data = {
      account: walletClient.account,
      types: authorizationTypes,
      domain: {
        name: usdcName,
        version: version,
        chainId: parseInt(networkId),
        verifyingContract: usdcAddress,
      },
      primaryType: "TransferWithAuthorization",
      message: {
        from,
        to,
        value,
        validAfter,
        validBefore,
        nonce,
      },
    };

    const signature = await walletClient.signTypedData(data);

    return {
      signature,
    };
  }

  window.x402.utils.createPayment = async (client, publicClient) => {
    if (!window.x402.paymentRequirements) {
      throw new Error('Payment requirements not initialized');
    }

    const nonce = window.x402.utils.createNonce();
    const version = await window.x402.utils.getVersion(publicClient, window.x402.utils.getUsdcAddressForChain(parseInt(window.x402.paymentRequirements.networkId)));
    const from = client.account.address;

    const validAfter = BigInt(
      Math.floor(Date.now() / 1000) - 5 // 1 block (2s) before to account for block timestamping
    );
    const validBefore = BigInt(
      Math.floor(Date.now() / 1000 + window.x402.paymentRequirements.requiredDeadlineSeconds)
    );

    const { signature } = await window.x402.utils.signAuthorization(
      client,
      {
        from,
        to: window.x402.paymentRequirements.payToAddress,
        value: window.x402.paymentRequirements.maxAmountRequired,
        validAfter,
        validBefore,
        nonce,
        version,
      },
      window.x402.paymentRequirements,
      publicClient
    );

    return {
      x402Version: 1,
      scheme: window.x402.paymentRequirements.scheme,
      networkId: window.x402.paymentRequirements.networkId,
      payload: {
        signature,
        authorization: {
          from,
          to: window.x402.paymentRequirements.payToAddress,
          value: window.x402.paymentRequirements.maxAmountRequired,
          validAfter,
          validBefore,
          nonce,
          version,
        },
      },
      resource: window.x402.paymentRequirements.resource,
    };
  }


  async function initializeApp() {
    const x402 = window.x402;
    const wagmiConfig = createConfig({
      chains: [base, baseSepolia],
      connectors: [
        coinbaseWallet({ appName: 'Create Wagmi' }),
        injected(),
      ],
      transports: {
        [base.id]: http(),
        [baseSepolia.id]: http(),
      },
    });

    // DOM Elements
    const connectWalletBtn = document.getElementById('connect-wallet');
    const paymentSection = document.getElementById('payment-section');
    const payButton = document.getElementById('pay-button');
    const statusDiv = document.getElementById('status');

    if (!connectWalletBtn || !paymentSection || !payButton || !statusDiv) {
      // console.error('Required DOM elements not found');
      return;
    }

    let walletClient = null;
    const chain = x402.isTestnet ? baseSepolia : base;

    const publicClient = createPublicClient({
      chain,
      transport: custom(window.ethereum),
    });

    // Connect wallet handler
    connectWalletBtn.addEventListener('click', async () => {
      // If wallet is already connected, disconnect it
      if (walletClient) {
        try {
          await disconnect(wagmiConfig);
          walletClient = null;
          connectWalletBtn.textContent = 'Connect Wallet';
          paymentSection.classList.add('hidden');
          statusDiv.textContent = 'Wallet disconnected';
          return;
        } catch (error) {
          statusDiv.textContent = 'Failed to disconnect wallet';
          return;
        }
      }

      try {
        statusDiv.textContent = 'Connecting wallet...';

        const result = await connect(wagmiConfig, {
          connector: injected(),
          chainId: chain.id,
        });
        if (!result.accounts?.[0]) {
          throw new Error('Please select an account in your wallet');
        }
        walletClient = createWalletClient({
          account: result.accounts[0],
          chain,
          transport: custom(window.ethereum)
        });

        const address = result.accounts[0]

        connectWalletBtn.textContent = address.slice(0, 6) + "..." + address.slice(-4);
        paymentSection.classList.remove('hidden');
        statusDiv.textContent =
          'Wallet connected! You can now proceed with payment.';
      } catch (error) {
        console.error('Connection error:', error);
        statusDiv.textContent =
          error instanceof Error ? error.message : 'Failed to connect wallet';
        // Reset UI state
        connectWalletBtn.textContent = 'Connect Wallet';
        paymentSection.classList.add('hidden');
      }
    });

  // Payment handler
  payButton.addEventListener('click', async () => {
    if (!walletClient) {
      statusDiv.textContent = 'Please connect your wallet first';
      return;
    }

    try {
      const usdcAddress = window.x402.config.chainConfig[chain.id].usdcAddress;
      try {
        statusDiv.textContent = 'Checking USDC balance...';
        const balance = await publicClient.readContract({
          address: usdcAddress,
          abi: [{
            inputs: [{ internalType: "address", name: "account", type: "address" }],
            name: "balanceOf",
            outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
            stateMutability: "view",
            type: "function"
          }],
          functionName: "balanceOf",
          args: [walletClient.account.address]
        });

        if (balance === 0n) {
          statusDiv.textContent = "Your USDC balance is 0. Please make sure you have USDC tokens on" + {{.NetworkName}};
          return;
        }

        statusDiv.textContent = 'Creating payment signature...';

        const paymentHeader = await x402.utils.createPaymentHeader(walletClient, publicClient);

        statusDiv.textContent = 'Requesting content with payment...';

        const response = await fetch(x402.currentUrl, {
          headers: {
            'X-PAYMENT': paymentHeader,
            'Access-Control-Expose-Headers': 'X-PAYMENT-RESPONSE',
          },
        });

        if (response.ok) {
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('text/html')) {
            document.documentElement.innerHTML = await response.text();
          } else {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            window.location.href = url;
          }
        } else {
          throw new Error('Payment failed: ' + response.statusText);
        }
      } catch (error) {
        statusDiv.textContent = error instanceof Error ? error.message : 'Failed to check USDC balance';
      }
    } catch (error) {
      statusDiv.textContent = error instanceof Error ? error.message : 'Payment failed';
    }
  });
}

window.addEventListener('load', initializeApp);
</script>
</head>

<body>
  <div class="container">
    <div class="header">
      <h1 class="title">Payment Required</h1>
      <p class="subtitle">{{.Description}} To access this content, please pay $ {{.Amount}} {{.NetworkName}} USDC.</p>
      <p class="instructions">Need Base Sepolia USDC? <a href="https://faucet.circle.com/" target="_blank" rel="noopener noreferrer">Get some here.</a></p>
    </div>

    <div class="content">
      <div id="connect-section">
        <button id="connect-wallet" class="button button-blue">
            Connect Wallet
        </button>
      </div>

      <div id="payment-section" class="hidden">
        <div class="payment-requirements">
          <div class="payment-row">
            <span class="payment-label">Amount:</span>
            <span class="payment-value">$ {{.Amount}} USDC</span>
          </div>
          <div class="payment-row">
            <span class="payment-label">Network:</span>
            <span class="payment-value">{{.NetworkName}}</span>
          </div>
        </div>

        <button id="pay-button" class="button button-green">
            Pay Now
        </button>
      </div>
      <div id="status" class="status"></div>
    </div>
  </div>
</body>
</html>`
