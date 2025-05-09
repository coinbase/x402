import { build as tsup, type Options } from "tsup";
import { htmlPlugin } from "@craftamap/esbuild-plugin-html";
import fs from "fs";
import path from "path";

// This file only runs at build time and generates a template HTML file
// Template variables are handled at runtime, not build time

// Generate HTML template. Content here is static but can be changed at runtime.
function getPaywallTemplate(): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body>
        <div class="container">
          <div class="header">
            <h1 class="title">Payment Required</h1>
            <p class="subtitle" id="payment-description">Loading payment details...</p>
            <p class="instructions" id="instructions">Need Base Sepolia USDC? <a href="https://faucet.circle.com/" target="_blank" rel="noopener noreferrer">Get some here.</a></p>
          </div>

          <div class="content">
            <div id="connect-section">
              <button id="connect-wallet" class="button button-primary">
                  Connect wallet
              </button>
            </div>

            <div id="payment-section" class="hidden">
              <div class="payment-details">
                <div class="payment-row">
                  <span class="payment-label">Wallet:</span>
                  <span class="payment-value" id="payment-account">Loading...</span>
                </div>
                <div class="payment-row">
                  <span class="payment-label">Amount:</span>
                  <span class="payment-value" id="payment-amount">Loading...</span>
                </div>
                <div class="payment-row">
                  <span class="payment-label">Network:</span>
                  <span class="payment-value" id="payment-network">Loading...</span>
                </div>
              </div>

              <button id="pay-button" class="button button-secondary">
                  Pay Now
              </button>
            </div>
            <div id="status" class="status"></div>
          </div>
        </div>
    </body>
    </html>
  `;
}

const DIST_DIR = "src/paywall/dist";
const OUTPUT_HTML = path.join(DIST_DIR, "paywall.html");
const OUTPUT_TS = path.join(DIST_DIR, "template.ts");

const options: Options = {
  entryPoints: ["src/paywall/scripts.ts", "src/paywall/styles.css"],
  bundle: true,
  metafile: true,
  outDir: DIST_DIR,
  minify: false,
  format: ["iife"],
  sourcemap: true,
  plugins: [
    htmlPlugin({
      files: [
        {
          entryPoints: ["src/paywall/scripts.ts", "src/paywall/styles.css"],
          filename: "paywall.html",
          title: "Payment Required",
          scriptLoading: "module",
          inline: {
            css: true,
            js: true,
          },
          htmlTemplate: getPaywallTemplate(),
        },
      ],
    }),
  ],
};

// Run the build and then create the template.ts file
async function build() {
  try {
    // First, make sure the dist directory exists
    if (!fs.existsSync(DIST_DIR)) {
      fs.mkdirSync(DIST_DIR, { recursive: true });
    }

    // Run esbuild to create the bundled HTML
    const result = await tsup(options);
    console.log("Build completed successfully!");

    // Read the generated HTML file
    if (fs.existsSync(OUTPUT_HTML)) {
      const html = fs.readFileSync(OUTPUT_HTML, "utf8");

      // Generate a TypeScript file with the template as a constant
      const tsContent = `// THIS FILE IS AUTO-GENERATED - DO NOT EDIT
// Generated at ${new Date().toISOString()}

/**
 * The pre-built, self-contained paywall template with inlined CSS and JS
 */
export const PAYWALL_TEMPLATE = ${JSON.stringify(html)};
`;
      // Write the template.ts file
      fs.writeFileSync(OUTPUT_TS, tsContent);
      console.log(`Generated template.ts with bundled HTML (${html.length} bytes)`);
    } else {
      throw new Error(`Bundled HTML file not found at ${OUTPUT_HTML}`);
    }
  } catch (error) {
    console.error("Build failed:", error);
    process.exit(1);
  }
}

build();