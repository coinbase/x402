import { defineConfig } from "tsup";

const baseConfig = {
  entry: {
    index: "src/index.ts",
    constants: "src/constants.ts",
    "abis/index": "src/abis/index.ts",
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

