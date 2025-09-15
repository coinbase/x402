import type { SuiCodegenConfig } from "@mysten/codegen";

const config: SuiCodegenConfig = {
  output: "./src/schemes/exact/sui/codegen",
  generateSummaries: true,
  prune: true,
  packages: [
    {
      package: "@x402/payments",
      path: "../../../contracts/sui/x402_payments",
    },
  ],
};

export default config;
