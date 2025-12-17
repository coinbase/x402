# Quickstart for Buyers

This guide walks you through how to use **x402** to interact with services that require payment. By the end of this guide, you will be able to programmatically discover payment requirements, complete a payment, and access a paid resource.

### Prerequisites

Before you begin, ensure you have:

* A crypto wallet with USDC (any EVM-compatible wallet)
* [Node.js](https://nodejs.org/en) and npm, or Python and pip
* A service that requires payment via x402

**Note**\
We have pre-configured [examples available in our repo](https://github.com/coinbase/x402/tree/main/examples), including examples for fetch, Axios, and MCP.

### 1. Install Dependencies

{% tabs %}
{% tab title="Node.js" %}
**HTTP Clients (Axios/Fetch)**
Install [x402-axios](https://www.npmjs.com/package/x402-axios) or [x402-fetch](https://www.npmjs.com/package/x402-fetch):

```bash
npm install x402-axios
# or
npm install x402-fetch
```

**MCP (Unofficial)**
This [community package](https://github.com/ethanniser/x402-mcp) showcases how AI agents can use Model Context Protocol (MCP) with x402. We're working on enshrining an official MCP spec in x402 soon.

Install the required packages for MCP support:

```bash
npm install x402-mcp ai @modelcontextprotocol/sdk
```
{% endtab %}

{% tab title="Python" %}
Install the [x402 package](https://pypi.org/project/x402/)

```
pip install x402
```
{% endtab %}
{% endtabs %}



### 2. Create a Wallet Client

#### Create a Wallet Client

{% tabs %}
{% tab title="Node.js (viem)" %}
Install the required package:

```bash
npm install viem
```

Then instantiate the wallet account:

```typescript
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

// Create a wallet client (using your private key)
const account = privateKeyToAccount("0xYourPrivateKey"); // we recommend using an environment variable for this
```
{% endtab %}

{% tab title="Python (eth-account)" %}
Install the required package:

```bash
pip install eth_account
```

Then instantiate the wallet account:

```python
from eth_account import Account

account = Account.from_key("your_private_key") # we recommend using an environment variable for this
```
{% endtab %}
{% endtabs %}

#### Solana (SVM)

Use [SolanaKit](https://www.solanakit.com/) to instantiate a signer:

```typescript
import { createKeyPairSignerFromBytes } from "@solana/kit";
import { base58 } from "@scure/base";

// 64-byte base58 secret key (private + public)
const signer = await createKeyPairSignerFromBytes(
  base58.decode(process.env.SOLANA_PRIVATE_KEY!)
);
```

### 3. Make Paid Requests Automatically

#### Node.js

You can use either `x402-fetch` or `x402-axios` to automatically handle 402 Payment Required responses and complete payment flows.

{% tabs %}
{% tab title="Fetch" %}
**x402-fetch** extends the native `fetch` API to handle 402 responses and payment headers for you. [Full example here](https://github.com/coinbase/x402/tree/main/examples/typescript/clients/fetch)

```typescript
import { wrapFetchWithPayment, decodePaymentResponse } from "x402-fetch";
// other imports...

// wallet creation logic...

const fetchWithPayment = wrapFetchWithPayment(fetch, account);

fetchWithPayment(url, { //url should be something like https://api.example.com/paid-endpoint
  method: "GET",
})
  .then(async response => {
    const body = await response.json();
    console.log(body);

    const paymentResponse = decodePaymentResponse(response.headers.get("payment-response")!);
    console.log(paymentResponse);
  })
  .catch(error => {
    console.error(error.response?.data?.error);
  });
```
{% endtab %}

{% tab title="Axios" %}
**x402-axios** adds a payment interceptor to Axios, so your requests are retried with payment headers automatically. [Full example here](https://github.com/coinbase/x402/tree/main/examples/typescript/clients/axios)

```typescript
import { withPaymentInterceptor, decodePaymentResponse } from "x402-axios";
import axios from "axios";
// other imports...

// wallet creation logic...

// Create an Axios instance with payment handling
const api = withPaymentInterceptor(
  axios.create({
    baseURL, // e.g. https://api.example.com
  }),
  account,
);

api
  .get(endpointPath) // e.g. /paid-endpoint
  .then(response => {
    console.log(response.data);

    const paymentResponse = decodePaymentResponse(response.headers["payment-response"]);
    console.log(paymentResponse);
  })
  .catch(error => {
    console.error(error.response?.data?.error);
  });
```
{% endtab %}

{% tab title="x402-mcp" %}
**x402-mcp** provides payment handling for MCP clients, allowing AI agents to automatically pay for tools. [Full example here](https://github.com/ethanniser/x402-mcp/tree/main/apps/example)

```typescript
import { convertToModelMessages, stepCountIs, streamText } from "ai";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { experimental_createMCPClient as createMCPClient } from "ai";
import { withPayment } from "x402-mcp";

// Create MCP client with payment capabilities
const mcpClient = await createMCPClient({
  transport: new StreamableHTTPClientTransport(mcpServerUrl), // URL of your MCP server
}).then((client) => withPayment(client, {
  account, // Your wallet account from step 2
  network: "base" // or "base-sepolia" for testnet
}));

// Get available tools (both paid and free)
const tools = await mcpClient.tools();

// Use the tools with your AI model
const result = streamText({
  model: "gpt-4", // or any AI model
  tools,
  messages: convertToModelMessages(messages),
  stopWhen: stepCountIs(5), // Limit tool calls for safety
  onFinish: async () => {
    await mcpClient.close();
  },
  system: "ALWAYS prompt the user to confirm before authorizing payments",
});
```

**Features:**
- Automatically detects when MCP tools require payment
- Handles x402 payment flow transparently
- Supports both paid and free tools from the same server
- Integrates seamlessly with Vercel AI SDK

**Note:** The `withPayment` wrapper adds payment capabilities to any MCP client. When a tool call requires payment, it will automatically handle the x402 payment flow using your configured wallet.
{% endtab %}
{% endtabs %}

#### Python

You can use either `httpx` or `Requests`  to automatically handle 402 Payment Required responses and complete payment flows.

* **Requests** is a well-established library for **synchronous** HTTP requests. It is simple and ideal for straightforward, sequential workflows.
* **HTTPX** is a modern library that supports both **synchronous** and **asynchronous** (async) HTTP requests. Use HTTPX if you need high concurrency, advanced features like HTTP/2, or want to leverage Python’s async capabilities

Both support a **simple** and **extensible** approach. The simple returns a pre-configured client that handles payments automatically, while the extensible lets you use an existing session/client. The simple is covered here, while the extensible is in the README of the full examples linked below.

{% tabs %}
{% tab title="HTTPX" %}
[Full example here](https://github.com/coinbase/x402/tree/main/examples/python/clients/httpx)

<pre class="language-python"><code class="lang-python">from x402.clients.httpx import x402HttpxClient
# Other imports...

# Wallet creation logic ...
<strong>
</strong><strong># Create client and make request
</strong>async with x402HttpxClient(account=account, base_url="https://api.example.com") as client:
    response = await client.get("/protected-endpoint")
    print(await response.aread())
</code></pre>
{% endtab %}

{% tab title="Requests" %}
[Full example here](https://github.com/coinbase/x402/tree/main/examples/python/clients/requests)

<pre class="language-python"><code class="lang-python">from x402.clients.requests import x402_requests
# Other imports...

# Wallet creation logic ...
<strong>
</strong><strong># Create session and make request
</strong>session = x402_requests(account)
response = session.get("https://api.example.com/protected-endpoint")
print(response.content)
</code></pre>
{% endtab %}
{% endtabs %}

### 4. Error Handling

Clients will throw errors if:

* The request configuration is missing
* A payment has already been attempted for the request
* There is an error creating the payment header

### Summary

* Install an x402 client package
* Create a wallet client
* Use the provided wrapper/interceptor to make paid API requests
* Payment flows are handled automatically for you

***

**References:**

* [x402-fetch npm docs](https://www.npmjs.com/package/x402-fetch)
* [x402-axios npm docs](https://www.npmjs.com/package/x402-axios)
* [x402 PyPi page](https://pypi.org/project/x402/)

For questions or support, join our [Discord](https://discord.gg/invite/cdp).
