/** Dynamic Agent
 * Example of an agent that has dynamic, discoverable tools, enabled by x402 payments.
 */
import axios from "axios";
import { withPaymentInterceptor } from "x402-axios";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { http, publicActions, createWalletClient } from "viem";
import { Hex } from "viem";
import { Anthropic } from "@llamaindex/anthropic";
import { agent, tool } from "llamaindex";
import { z } from "zod";

const wallet = createWalletClient({
  chain: baseSepolia,
  transport: http(),
  account: privateKeyToAccount(process.env.PRIVATE_KEY as Hex),
}).extend(publicActions);

const axiosWithPayment = withPaymentInterceptor(axios.create({}), wallet);

const llm = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: "claude-3-5-sonnet-20241022",
});

const indexTool = tool(
  async () => {
    const response = await axiosWithPayment.get("http://localhost:4021/");
    const data = await response.data;
    console.log("Available Resources:", data);
    return data;
  },
  {
    name: "api-index",
    description:
      "Returns to you a list of all the APIs available for you to access",
    parameters: z.object({}),
  }
);

const httpTool = tool(
  async ({ url }: { url: string }) => {
    console.log("Making http call to", url);
    const response = await axiosWithPayment.get(url);
    const data = await response.data;
    return data;
  },
  {
    name: "make-http-request",
    description: "Allows you to make http calls to different APIs",
    parameters: z.object({
      url: z.string({ description: "The URL of the API to call" }),
    }),
  }
);

const bot = agent({
  llm,
  tools: [indexTool, httpTool],
  timeout: 100000,
});

const response = await bot.run(`
  You are a helpful assistant. You have access to an index of APIs you can use to dynamically get data.
  
  Make a pun based on the weather in San Francisco and the price of SPY
`);

console.log(response);
