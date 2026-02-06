import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: {
      index: "./src/index.ts",
      "exact/client/index": "./src/exact/client/index.ts",
      "exact/server/index": "./src/exact/server/index.ts",
      "exact/facilitator/index": "./src/exact/facilitator/index.ts",
    },
    format: ["esm", "cjs"],
    dts: true,
    splitting: true,
    sourcemap: true,
    clean: true,
    outDir: "./dist",
  },
]);
