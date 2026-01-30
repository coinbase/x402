/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CDP_PROJECT_ID: string;
  readonly VITE_CDP_BASE_PATH: string;
  // Add more env variables as needed
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
