import esbuild from "esbuild";
import { htmlPlugin } from "@craftamap/esbuild-plugin-html";
import fs from "fs";
import path from "path";
import { getBaseTemplate } from "../baseTemplate";

// SVM-specific build - only bundles Solana dependencies
const DIST_DIR = "src/svm/dist";
const OUTPUT_HTML = path.join(DIST_DIR, "svm-paywall.html");
const OUTPUT_TS = path.join("src/svm/gen", "template.ts");

const options: esbuild.BuildOptions = {
  entryPoints: ["src/svm/index.tsx", "src/styles.css"],
  bundle: true,
  metafile: true,
  outdir: DIST_DIR,
  treeShaking: true,
  minify: true,
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
          entryPoints: ["src/svm/index.tsx", "src/styles.css"],
          filename: "svm-paywall.html",
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
  inject: ["./src/buffer-polyfill.ts"],
  external: ["crypto"],
};

/**
 * Builds the SVM paywall HTML template with bundled JS and CSS.
 */
async function build() {
  try {
    if (!fs.existsSync(DIST_DIR)) {
      fs.mkdirSync(DIST_DIR, { recursive: true });
    }

    const genDir = path.dirname(OUTPUT_TS);
    if (!fs.existsSync(genDir)) {
      fs.mkdirSync(genDir, { recursive: true });
    }

    await esbuild.build(options);
    console.log("[SVM] Build completed successfully!");

    if (fs.existsSync(OUTPUT_HTML)) {
      const html = fs.readFileSync(OUTPUT_HTML, "utf8");

      const tsContent = `// THIS FILE IS AUTO-GENERATED - DO NOT EDIT
/**
 * The pre-built SVM paywall template with inlined CSS and JS
 */
export const SVM_PAYWALL_TEMPLATE = ${JSON.stringify(html)};
`;

      fs.writeFileSync(OUTPUT_TS, tsContent);
      console.log(`[SVM] Generated template.ts (${(html.length / 1024 / 1024).toFixed(2)} MB)`);
    } else {
      throw new Error(`SVM bundled HTML not found at ${OUTPUT_HTML}`);
    }
  } catch (error) {
    console.error("[SVM] Build failed:", error);
    process.exit(1);
  }
}

build();
