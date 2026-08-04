import {
  toVercelHandler,
  type VercelRequest,
  type VercelResponse,
} from "@opensea/tool-sdk"
import { toolHandler } from "../src/handler.js"

const handler = toVercelHandler(toolHandler)

export default function (req: VercelRequest, res: VercelResponse) {
  return handler(req, res)
}
