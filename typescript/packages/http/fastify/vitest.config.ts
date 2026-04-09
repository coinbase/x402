import path from "path";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ mode }) => ({
  test: {
    env: loadEnv(mode, process.cwd(), ""),
  },
  plugins: [tsconfigPaths({ projects: ["."] })],
  resolve: {
    alias: [
      {
        find: /^@x402\/core\/(.+)/,
        replacement: path.resolve(__dirname, "../../core/src/$1/index.ts"),
      },
      {
        find: /^@x402\/core$/,
        replacement: path.resolve(__dirname, "../../core/src/index.ts"),
      },
    ],
  },
}));
