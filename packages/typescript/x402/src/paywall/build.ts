import * as esbuild from "esbuild";
import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// Get current directory in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * This script builds the paywall HTML template.
 *
 * It bundles the paywall scripts & styles so we don't have to include them manually.
 *
 * The resulting template can be used in the hono middleware.
 */
async function buildPaywall() {
  console.log("Starting paywall build...");

  // Bundle the client-side paywall scripts
  console.log("Bundling scripts...");
  const jsResult = await esbuild.build({
    entryPoints: ["src/paywall/scripts.ts"],
    bundle: true,
    minify: true,
    format: "esm",
    target: ["es2020"],
    write: false,
    loader: {
      ".ts": "ts",
    },
    treeShaking: true,
    minifyWhitespace: true,
  });

  // Bundle styles
  console.log("Bundling styles...");
  const cssResult = await esbuild.build({
    entryPoints: ["src/paywall/styles.css"],
    bundle: true,
    minify: true,
    write: false,
    loader: {
      ".css": "css",
    },
  });

  const bundledJs = jsResult.outputFiles[0].text;
  const bundledCss = cssResult.outputFiles[0].text;

  // Create the actual HTML with all the bundled assets
  console.log("Creating template...");

  // I know the HTML part looks hideous with all the string concatenation,
  // but it's necessary to avoid accidentally escaping the bundled js via backticks.

  const templateWrapper = `
// Generated wrapper - do not edit directly

interface PaywallOptions {
  amount: number;
  paymentDetails: any;
  currentUrl: string;
  testnet: boolean;
}

// needs to be strings to be parsed by the template properly
const BUNDLED_JS: string = ${JSON.stringify(bundledJs)};
const BUNDLED_CSS: string = ${JSON.stringify(bundledCss)};

export function getPaywallHtml(
  { amount, testnet, paymentDetails, currentUrl }: PaywallOptions
) {
  const x402Config = {
    paymentDetails,
    isTestnet: testnet,
    currentUrl,
    state: {
      publicClient: null,
      chain: null,
      walletClient: null
    },
    config: {
      chainConfig: {
        "84532": {
          usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
          usdcName: "USDC",
        },
        "8453": {
          usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          usdcName: "USDC",
        }
      }
    }
  };

  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="UTF-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
    \`  <title>Payment Required - \${amount}</title>\`,
    '  <style>',
    BUNDLED_CSS,
    '  </style>',
    '  <script>',
    \`    window.x402 = \${JSON.stringify(x402Config)}\`,
    '  </script>',
    '  <script type="module">',
    BUNDLED_JS,
    '  </script>',
    '</head>',
    '<body>',
    '  <div class="container">',
    '    <div class="header">',
    '      <h1 class="title">Payment Required</h1>',
    \`      <p class="subtitle">To access this content, please pay \${amount} Base Sepolia USDC</p>\`,
    '      <p class="instructions">Need Base Sepolia USDC? <a href="https://faucet.circle.com/" target="_blank" rel="noopener noreferrer">Get some here.</a></p>',
    '    </div>',
    '    <div class="content">',
    '      <div id="connect-section">',
    '        <button id="connect-wallet" class="button button-blue">Connect Wallet</button>',
    '      </div>',
    '      <div id="payment-section" class="hidden">',
    '        <div class="payment-details">',
    '          <div class="payment-row">',
    '            <span class="payment-label">Amount:</span>',
    \`            <span class="payment-value">\${amount} USDC</span>\`,
    '          </div>',
    '          <div class="payment-row">',
    '            <span class="payment-label">Network:</span>',
    \`            <span class="payment-value">\${testnet ? "Base Sepolia" : "Base"}</span>\`,
    '          </div>',
    '        </div>',
    '        <button id="pay-button" class="button button-green">Pay Now</button>',
    '      </div>',
    '      <div id="status" class="status"></div>',
    '    </div>',
    '  </div>',
    '</body>',
    '</html>'
  ].join("\\n");
}`;

  const outputPath = join(__dirname, "generated-paywall-template.ts");
  console.log("Writing template to:", outputPath);
  writeFileSync(outputPath, templateWrapper);

  // Verify file was written
  try {
    const stats = await import("fs/promises").then(fs => fs.stat(outputPath));
    console.log(`File written successfully! Size: ${stats.size} bytes`);
  } catch (error) {
    console.error("Failed to verify file was written:", error);
  }

  console.log("Paywall build complete!");
}

// Call the build function when this script is run directly
if (import.meta.url === new URL(import.meta.url).href) {
  buildPaywall().catch(console.error);
}

export { buildPaywall };
