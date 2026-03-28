import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: false, // Disable DTS generation for now due to workspace type resolution issues
  sourcemap: true,
  clean: true,
  external: ['viem', '@solana/kit', '@scure/base'],
})
