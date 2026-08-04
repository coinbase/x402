import { createToolHandler } from "@opensea/tool-sdk"
// To paywall this tool, use defineToolPaywall — it returns both `pricing`
// (for the manifest) and `gate` (for the handler) from a single config,
// preventing accidental drift between the advertised price and the enforced
// charge.
//
// For lower-level control, use payaiX402Gate / cdpX402Gate directly:
// import { payaiX402Gate } from "@opensea/tool-sdk"
// import { cdpX402Gate } from "@opensea/tool-sdk"
import { z } from "zod/v4"
import { manifest } from "./manifest.js"

const InputSchema = z.object({
  query: z.string(),
})

const OutputSchema = z.object({
  result: z.string(),
})

// TODO: Replace this echo handler with your tool logic
export const toolHandler = createToolHandler({
  manifest,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  // gates: [paywall.gate],
  handler: async input => {
    return { result: `Echo: ${input.query}` }
  },
})
