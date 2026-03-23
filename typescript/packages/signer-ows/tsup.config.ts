import { defineConfig } from "tsup";

const baseConfig = {
  entry: {
    index: "src/index.ts",
    evm: "src/evm.ts",
    svm: "src/svm.ts",
  },
  dts: {
    resolve: true,
  },
  sourcemap: true,
  target: "node16" as const,
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
