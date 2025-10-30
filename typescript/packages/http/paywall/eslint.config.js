import baseConfig from "../../../eslint.config.js";

export default [
  ...baseConfig,
  {
    ignores: ["dist/**", "src/gen/**", "src/dist/**"],
  },
];
