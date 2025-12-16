import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    headers: {
      // Allow all origins in development to support localhost x402 requests
      "Access-Control-Allow-Origin": "*",
    },
  },
  build: {
    outDir: "dist",
  },
  base: "",
});
