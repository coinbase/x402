import { defineConfig } from "tsup";

const baseConfig = {
  entry: {
    index: "src/index.ts",
    "bazaar/index": "src/bazaar/index.ts",
    "sign-in-with-x/index": "src/sign-in-with-x/index.ts",
    "eip-2612-gas-sponsoring/index": "src/eip-2612-gas-sponsoring/index.ts",
    "erc20-approval-gas-sponsoring/index": "src/erc20-approval-gas-sponsoring/index.ts",
  },
  dts: {
    resolve: true,
  },
  sourcemap: true,
  target: "es2020",
};

export default defineConfig([
  {
    ...baseConfig,
    format: "esm",
    outDir: "dist/esm",
    clean: true,
  },
  {
    ...baseConfig,
    format: "cjs",
    outDir: "dist/cjs",
    clean: false,
  },
]);
