import { Config } from "@coinbase/cdp-hooks";

export const CDP_CONFIG: Config = {
  projectId: import.meta.env.VITE_CDP_PROJECT_ID,
  basePath: import.meta.env.VITE_CDP_BASE_PATH,
  useMock: import.meta.env.VITE_USE_MOCK === "true",
};

export const APP_CONFIG = {
  name: "x402 MCP", // the name of your application
  logoUrl: "https://picsum.photos/64", // logo will be displayed in select components
};
