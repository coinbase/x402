# Dynamic Agent

This example demonstrates an agent that can perform multi-tool tasks, without prior knowledge of the tools available to it. Each tool is paid for on a per-request basis using x402.

## Run

(All steps run from `examples/typescript/dynamic_agent`)

1. Install dependencies

```bash
pnpm install
```

2. Configure environment variables

```bash
cp .env-local .env
```

Follow instructions in `.env` to get required API keys to proxy (they're all free).
Add your Ethereum development private key to `.env` (remember it should have USDC on Base Sepolia, which you can provision using the [CDP Faucet](https://portal.cdp.coinbase.com/products/faucet)):

3. Start index server

This server mocks an index of tools that an agent may access via http.

```
pnpm run index-server
```

4. Run the agent

In a new terminal, run

```
pnpm run agent
```

You should see the agent query the index server to see what tools are available, then pay to use several tools.
Then in the agent's terminal you should see something like:

```
Available Resources: [
  {
    resourceUrl: 'http://localhost:4021/weather',
    resourceDescription: "Returns the 7 day forecast for weather in a city. Must include city as a query parameter escaped properly to be url safe (ex: 'http://localhost:4021/weather?city=London')",
    price: { amount: 0.01, currency: 'USD' }
  },
  {
    resourceUrl: 'http://localhost:4021/stock',
    resourceDescription: "Returns the last 5 days of stock data for a given stock symbol. Must include symbol as a query parameter escaped properly to be url safe (ex: 'http://localhost:4021/stock?symbol=AAPL')",
    price: { amount: 0.05, currency: 'USD' }
  }
]
Making http call to http://localhost:4021/weather?city=San%20Francisco
Making http call to http://localhost:4021/stock?symbol=SPY
StopEvent {
  data: {
    result: "Based on the current weather in San Francisco (partly cloudy with a temperature of 60.1°F) and the SPY stock price (which closed at $566.76 today), here's a weather and stock market pun:\n" +
      '\n' +
      '"The market is looking partly BULL-dy today, with SPY reaching new heights while San Francisco stays in the COLDateral damage of mild temperatures!"\n' +
      '\n' +
      'This pun combines:\n' +
      '1. "Partly cloudy" weather condition with "partly BULL-dy" (playing on bullish market)\n' +
      '2. "COLDateral" combines the cool temperature with "collateral"\n' +
      '3. References both the high stock price and mild weather conditions'
  },
  displayName: 'StopEvent'
}
```

## How it works

The agent has 2 generic tools, neither of which are directly related to the task to perform:

```typescript
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
```

`indexTool` makes a call to the index and receives a list of available tools, `httpTool` allows the agent to pay for http requests via x402.

With these 2 tools and a small system prompt, the agent can now dynamically perform tasks with tools without tools being known to it ahead of time in code.

```typescript
const response = await bot.run(`
  You are a helpful assistant. You have access to an index of APIs you can use to dynamically get data.
  
  Make a pun based on the weather in San Francisco and the price of SPY
`);

console.log(response);
```
