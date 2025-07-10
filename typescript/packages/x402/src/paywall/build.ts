import esbuild from "esbuild";
import { htmlPlugin } from "@craftamap/esbuild-plugin-html";
import fs from "fs";
import path from "path";
import { getBaseTemplate } from "./baseTemplate";

// This file only runs at build time and generates a template HTML file
// Template variables are handled at runtime, not build time

const DIST_DIR = "src/paywall/dist";
const OUTPUT_HTML = path.join(DIST_DIR, "paywall.html");
const OUTPUT_TS = path.join("src/paywall/gen", "template.ts");

// Path to Python package static directory (relative to this TypeScript package)
const PYTHON_STATIC_DIR = path.join("..", "..", "..", "python", "x402", "src", "x402", "static");
const PYTHON_PAYWALL_HTML = path.join(PYTHON_STATIC_DIR, "paywall.html");

const options: esbuild.BuildOptions = {
  entryPoints: ["src/paywall/index.tsx", "src/paywall/styles.css"],
  bundle: true,
  metafile: true,
  outdir: DIST_DIR,
  treeShaking: true,
  minify: true, // Use minify for production mode
  format: "iife",
  sourcemap: false,
  platform: "browser",
  target: "es2020",
  jsx: "transform",
  define: {
    "process.env.NODE_ENV": '"development"',
    global: "globalThis",
    Buffer: "globalThis.Buffer",
  },
  mainFields: ["browser", "module", "main"],
  conditions: ["browser"],
  plugins: [
    htmlPlugin({
      files: [
        {
          entryPoints: ["src/paywall/index.tsx", "src/paywall/styles.css"],
          filename: "paywall.html",
          title: "Payment Required",
          scriptLoading: "module",
          inline: {
            css: true,
            js: true,
          },
          htmlTemplate: getBaseTemplate(),
        },
      ],
    }),
  ],
  inject: ["./src/paywall/buffer-polyfill.ts"],
  // Mark problematic dependencies as external
  external: ["crypto"],
};

// Run the build and then create the template.ts file
/**
 * Builds the paywall HTML template with bundled JS and CSS.
 * Creates a TypeScript file containing the template as a constant for runtime use.
 * Copies the generated HTML to the Python package's static directory.
 */
async function build() {
  try {
    // First, make sure the dist directory exists
    if (!fs.existsSync(DIST_DIR)) {
      fs.mkdirSync(DIST_DIR, { recursive: true });
    }

    // Make sure gen directory exists too
    const genDir = path.dirname(OUTPUT_TS);
    if (!fs.existsSync(genDir)) {
      fs.mkdirSync(genDir, { recursive: true });
    }

    // Run esbuild to create the bundled HTML
    await esbuild.build(options);
    console.log("Build completed successfully!");

    // Read the generated HTML file
    if (fs.existsSync(OUTPUT_HTML)) {
      const html = fs.readFileSync(OUTPUT_HTML, "utf8");

      // Generate a TypeScript file with the template as a constant
      const tsContent = `// THIS FILE IS AUTO-GENERATED - DO NOT EDIT
/**
 * The pre-built, self-contained paywall template with inlined CSS and JS
 */
export const PAYWALL_TEMPLATE = ${JSON.stringify(html)};
`;
      // Write the template.ts file
      fs.writeFileSync(OUTPUT_TS, tsContent);
      console.log(`Generated template.ts with bundled HTML (${html.length} bytes)`);

      // Copy the HTML file to the Python package's static directory
      try {
        // Ensure the Python static directory exists
        if (!fs.existsSync(PYTHON_STATIC_DIR)) {
          fs.mkdirSync(PYTHON_STATIC_DIR, { recursive: true });
        }

        // Copy the file
        fs.copyFileSync(OUTPUT_HTML, PYTHON_PAYWALL_HTML);
        console.log(`Copied paywall.html to Python package: ${PYTHON_PAYWALL_HTML}`);
      } catch (copyError) {
        console.warn(`Warning: Failed to copy paywall.html to Python package: ${copyError}`);
        console.warn(
          "This is not critical for TypeScript builds, but the Python package won't have the latest paywall HTML",
        );
      }
    } else {
      throw new Error(`Bundled HTML file not found at ${OUTPUT_HTML}`);
    }
  } catch (error) {
    console.error("Build failed:", error);
    process.exit(1);
  }
}

build();
