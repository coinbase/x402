import { defineConfig } from "tsup";

// JS builds: include all runtime entries, but do not emit DTS to keep memory usage low
const jsEntries = {
  index: "src/index.ts",
  "shared/index": "src/shared/index.ts",
  "shared/middleware": "src/shared/middleware.ts",
  "shared/paywall": "src/shared/paywall.ts",
  "shared/json": "src/shared/json.ts",
  "shared/base64": "src/shared/base64.ts",
  "shared/evm/index": "src/shared/evm/index.ts",
  "schemes/index": "src/schemes/index.ts",
  "schemes/exact/evm/index": "src/schemes/exact/evm/index.ts",
  "schemes/exact/evm/utils/paymentUtils": "src/schemes/exact/evm/utils/paymentUtils.ts",
  "schemes/exact/svm/index": "src/schemes/exact/svm/index.ts",
  "schemes/exact/hedera/index": "src/schemes/exact/hedera/index.ts",
  "client/index": "src/client/index.ts",
  "verify/index": "src/verify/index.ts",
  "facilitator/index": "src/facilitator/index.ts",
};

// DTS-only build: emit type declarations for only the subpaths used by Next Edge and consumers
const dtsEntries = {
  "types/index": "src/types/index.ts",
  "types/shared/network": "src/types/shared/network.ts",
  "types/shared/middleware": "src/types/shared/middleware.ts",
  "types/shared/money": "src/types/shared/money.ts",
  "types/verify/index": "src/types/verify/index.ts",
  // declarations needed by dependent packages (express/hono/axios)
  "shared/index": "src/shared/index.ts",
  "shared/middleware": "src/shared/middleware.ts",
  "shared/paywall": "src/shared/paywall.ts",
  "shared/json": "src/shared/json.ts",
  "shared/base64": "src/shared/base64.ts",
  "schemes/index": "src/schemes/index.ts",
  "schemes/exact/evm/index": "src/schemes/exact/evm/index.ts",
  "schemes/exact/evm/utils/paymentUtils": "src/schemes/exact/evm/utils/paymentUtils.ts",
  "client/index": "src/client/index.ts",
  "verify/index": "src/verify/index.ts",
};

export default defineConfig([
  // ESM JS
  {
    entry: jsEntries,
    dts: false,
    format: "esm",
    outDir: "dist/esm",
    clean: true,
    sourcemap: true,
    target: "es2020",
    splitting: true,
    treeshake: true,
    minify: false,
    skipNodeModulesBundle: true,
    shims: false,
  },
  // CJS JS
  {
    entry: jsEntries,
    dts: false,
    format: "cjs",
    outDir: "dist/cjs",
    clean: false,
    sourcemap: true,
    target: "es2020",
    splitting: true,
    treeshake: true,
    minify: false,
    skipNodeModulesBundle: true,
    shims: false,
  },
  // DTS-only (ESM)
  {
    entry: dtsEntries,
    dts: { resolve: true },
    format: "esm",
    outDir: "dist/esm",
    clean: false,
    sourcemap: true,
    target: "es2020",
    splitting: false,
    treeshake: false,
    minify: false,
    skipNodeModulesBundle: true,
    shims: false,
  },
]);
