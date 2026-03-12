import { defineConfig } from "tsup";

const baseConfig = {
  entry: {
    index: "src/index.ts",
    "cold-start/index": "src/cold-start/index.ts",
    "bazaar/index": "src/bazaar/index.ts",
    "sign-in-with-x/index": "src/sign-in-with-x/index.ts",
    "payment-identifier/index": "src/payment-identifier/index.ts",
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
