import { defineConfig } from "tsup";

const baseConfig = {
  entry: {
    index: "src/index.ts",
    "v1/index": "src/v1/index.ts",
    "exact/client/index": "src/exact/client/index.ts",
    "exact/server/index": "src/exact/server/index.ts",
    "exact/facilitator/index": "src/exact/facilitator/index.ts",
    "exact/v1/client/index": "src/exact/v1/client/index.ts",
    "exact/v1/facilitator/index": "src/exact/v1/facilitator/index.ts",
    "upto/client/index": "src/upto/client/index.ts",
    "upto/server/index": "src/upto/server/index.ts",
    "upto/facilitator/index": "src/upto/facilitator/index.ts",
    "deferred/client/index": "src/deferred/client/index.ts",
    "deferred/server/index": "src/deferred/server/index.ts",
    "deferred/facilitator/index": "src/deferred/facilitator/index.ts",
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
