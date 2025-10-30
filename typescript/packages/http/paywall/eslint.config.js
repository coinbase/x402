import baseConfig from "../../../eslint.config.js";

export default [
  ...baseConfig,
  {
    ignores: [
      "dist/**",
      "src/gen/**",
      "src/dist/**",
      "src/evm/gen/**",
      "src/evm/dist/**",
      "src/svm/gen/**",
      "src/svm/dist/**",
    ],
  },
];
