# x402 Payment Protocol Guide for Next.js

## What is x402?
x402 is a protocol for micropayments on the web. Instead of subscriptions or high minimum payments, you pay small amounts (like $0.001) per API call using cryptocurrency. The payment happens automatically in the HTTP header.

## Setup

1. **Install dependencies:**
```bash
npm install x402-fetch @coinbase/cdp-sdk viem
```

2. **Generate a wallet and fund it:**
```typescript
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const privateKey = generatePrivateKey();
const account = privateKeyToAccount(privateKey);
console.log("Address to fund:", account.address);
console.log("Private key:", privateKey); // Store securely
```

Fund this address with ETH on Base mainnet for transaction fees.

3. **Environment variables (.env.local):**
```
PRIVATE_KEY=0x... # Your generated private key
FIRECRAWL_API_KEY=fc-... # Your Firecrawl API key
```

## Next.js API Route Implementation

**File: `pages/api/search.ts` or `app/api/search/route.ts`**

```typescript
import { wrapFetchWithPayment, createSigner } from "x402-fetch";
import type { NextApiRequest, NextApiResponse } from "next";

// Initialize once (consider caching the signer)
let signer: any = null;

async function getSigner() {
  if (!signer) {
    signer = await createSigner("base", process.env.PRIVATE_KEY!);
  }
  return signer;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const signer = await getSigner();
    const fetchWithPayment = wrapFetchWithPayment(fetch, signer);

    const response = await fetchWithPayment("https://api.firecrawl.dev/v1/x402/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.FIRECRAWL_API_KEY}`,
      },
      body: JSON.stringify(req.body) // Forward client request
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    res.status(200).json(data);

  } catch (error) {
    console.error('x402 API call failed:', error);
    res.status(500).json({ error: 'Failed to fetch data' });
  }
}
```

## How x402 Works

1. **First request:** Your client makes a normal HTTP request
2. **Payment required:** Server responds with `402 Payment Required` + payment details
3. **Automatic payment:** x402-fetch automatically:
   - Creates a blockchain transaction for the required amount
   - Signs it with your private key
   - Adds payment proof to request headers
   - Retries the request
4. **Success:** Server validates payment and returns data

## Client-Side Usage

```typescript
// In your React component
const searchData = async (query: string) => {
  const response = await fetch('/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      limit: 10,
      scrapeOptions: {
        formats: ["markdown"],
        onlyMainContent: true
      }
    })
  });
  
  return response.json();
};
```

## Key Concepts

- **Gasless:** You don't pay blockchain gas fees (handled by facilitator)
- **Automatic:** Payment happens transparently in HTTP headers
- **Micropayments:** Pay exactly what each API call costs ($0.001-$0.01)
- **Networks:** Use "base" for mainnet, "base-sepolia" for testnet
- **Signer:** Manages your private key and creates payment proofs

## Error Handling

```typescript
try {
  const response = await fetchWithPayment(url, options);
  if (!response.ok) {
    // Handle HTTP errors (non-payment related)
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  const data = await response.json();
} catch (error) {
  if (error.message?.includes('insufficient funds')) {
    // Need to fund your wallet
    console.error('Wallet needs ETH for transaction fees');
  } else {
    // Other errors (network, API, etc.)
    console.error('Request failed:', error);
  }
}
```

## Security Notes

- Store private keys in environment variables only
- Never expose private keys in client-side code
- Keep your wallet funded but don't over-fund it
- Consider using a dedicated wallet just for x402 payments