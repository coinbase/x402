import { defineConfig } from "tsup";

const baseConfig = {
  entry: {
    index: "src/index.ts",
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
  // Standalone CLI binary
  {
    entry: {
      index: "src/index.ts",
    },
    format: "cjs",
    outDir: "dist",
    clean: false,
    dts: false,
    sourcemap: false,
    target: "es2020",
    banner: {
      js: "#!/usr/bin/env node",
    },
  },
]);
