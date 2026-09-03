import { defineConfig } from "tsup";

const baseConfig = {
  entry: {
    index: "src/index.ts",
    "exact/client/index": "src/exact/client/index.ts",
    "exact/server/index": "src/exact/server/index.ts",
    "exact/facilitator/index": "src/exact/facilitator/index.ts",
    "upto/client/index": "src/upto/client/index.ts",
    "upto/server/index": "src/upto/server/index.ts",
    "upto/facilitator/index": "src/upto/facilitator/index.ts",
    "auth-capture/client/index": "src/auth-capture/client/index.ts",
    "batch-settlement/client/index": "src/batch-settlement/client/index.ts",
    "batch-settlement/server/index": "src/batch-settlement/server/index.ts",
    "batch-settlement/facilitator/index": "src/batch-settlement/facilitator/index.ts",
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
