import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
  },
  preview: {
    allowedHosts: [
      'anyspend-x402-client-production.up.railway.app',
      'x402-demo.anyspend.com'
    ]
  }
});
