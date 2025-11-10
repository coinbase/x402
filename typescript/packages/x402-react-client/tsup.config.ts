/* eslint-disable @typescript-eslint/no-explicit-any */
import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/hooks/useX402Payment.ts",
    "src/hooks/useX402Balance.ts",
    "src/providers/X402Provider.tsx",
    "src/types",
  ],
  format: ["cjs", "esm"],
  dts: {
    resolve: true,
    compilerOptions: {
      moduleResolution: "bundler",
      skipLibCheck: true,
    },
    entry: {
      index: "src/index.ts",
      "hooks/useX402Payment": "src/hooks/useX402Payment.ts",
      "hooks/useX402Balance": "src/hooks/useX402Balance.ts",
      "providers/X402Provider": "src/providers/X402Provider.tsx",
      "types/index": "src/types/index.ts",
    },
  },
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  bundle: false,
  external: [
    "react",
    "react-dom",
    "wagmi",
    "viem",
    "@tanstack/react-query",
    "@rainbow-me/rainbowkit",
    "x402",
  ],
  outExtension({ format }: { format: string }) {
    return {
      js: format === "cjs" ? ".cjs" : ".js",
    };
  },
  esbuildOptions(options: Record<string, any>) {
    options.logLevel = "warning";
    options.logOverride = {
      "direct-eval": "silent",
    };
  },
  target: "es2020",
  minify: false,
  onSuccess: "node src/scripts/addClientDirective.js",
});
