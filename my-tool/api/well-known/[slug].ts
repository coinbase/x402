import {
  createWellKnownHandler,
  toVercelHandler,
  type VercelRequest,
  type VercelResponse,
} from "@opensea/tool-sdk"
import { manifest } from "../../src/manifest.js"

const wellKnownHandler = createWellKnownHandler(manifest)
const handler = toVercelHandler(wellKnownHandler)

export default function (req: VercelRequest, res: VercelResponse) {
  return handler(req, res)
}
