# Onramp Setup for x402-next

This guide shows how to set up Coinbase Onramp with Secure Init authentication in your Next.js app using x402-next.

## Overview

Secure Init is Coinbase's authentication method for onramp that uses session tokens instead of passing sensitive data like wallet addresses directly in URLs. It's **mandatory for all apps by July 31, 2025**.

## Quick Setup

### 1. Install Dependencies

```bash
npm install x402-next @coinbase/cdp-sdk
```

### 2. Set Up Session Token API

Create the session token API endpoint in your Next.js app:

```typescript
// app/api/x402/session-token/route.ts
export { POST } from "x402-next";
```

That's it! The x402-next package provides the complete implementation.

### 3. Environment Variables

Add these to your `.env` file:

```bash
# CDP Secret API Keys (Required for Secure Init)
CDP_API_KEY_ID=your_secret_api_key_id_here
CDP_API_KEY_SECRET=your_secret_api_key_secret_here

# OnchainKit Configuration (for paywall)
NEXT_PUBLIC_ONCHAINKIT_API_KEY=your_client_api_key_here
```

### 4. Get CDP API Keys

1. Go to [CDP Portal](https://portal.cdp.coinbase.com/projects/api-keys)
2. Navigate to your project's **API Keys** tab
3. Select the **Secret API Keys** section (not Client API Keys)
4. Click **Create API key**
5. Download and securely store your API key

### 5. Enable Secure Init in CDP Portal

1. Navigate to your project in [CDP Portal](https://portal.cdp.coinbase.com/products/onramp)
2. Go to **Payments → Onramp** tab
3. Toggle **"Enforce secure initialization"** to **Enabled**

## Usage

Once set up, your x402 paywall will automatically use Secure Init for onramp functionality when users need to fund their wallets.

### Testing

Test the session token API directly:

**Note**: Replace `YOUR_WALLET_ADDRESS` with an actual wallet address (like one from MetaMask). In production, this address comes from the user's connected wallet.

```bash
# Replace YOUR_WALLET_ADDRESS with the actual connected wallet address
curl -X POST http://localhost:3000/api/x402/session-token \
  -H "Content-Type: application/json" \
  -d '{
    "addresses": [
      {
        "address": "YOUR_WALLET_ADDRESS",
        "blockchains": ["ethereum", "base"]
      }
    ],
    "assets": ["ETH", "USDC"]
  }'
```

Expected response:
```json
{
  "success": true,
  "token": "session_token_string",
  "channelId": "channel_id_string"
}
```

## How It Works

1. **User needs funds**: When a user lacks sufficient balance in the paywall
2. **Session token generation**: Your backend calls CDP's Session Token API using Secret API keys
3. **Secure onramp**: User is redirected to Coinbase Onramp with the session token
4. **No exposed data**: Wallet addresses and app IDs are never exposed in URLs

## Security Benefits

- **Server-side generation**: Session tokens are created securely on your backend
- **Time-limited**: Tokens expire after 5 minutes
- **Single-use**: Each token can only be used once
- **No URL exposure**: Sensitive data isn't passed in query parameters

## Troubleshooting

### Common Issues

1. **"Missing CDP API credentials"**
   - Ensure `CDP_API_KEY_ID` and `CDP_API_KEY_SECRET` are set
   - Verify you're using **Secret API Keys**, not Client API Keys

2. **"Failed to generate session token"**
   - Check your CDP Secret API key has proper permissions
   - Verify your project has Onramp enabled

3. **API route not found**
   - Ensure you've created `app/api/x402/session-token/route.ts`
   - Verify the export: `export { POST } from "x402-next";`

### Debug Steps

1. Check environment variables are loaded: `console.log(process.env.CDP_API_KEY_ID)`
2. Test the API endpoint directly with curl
3. Check browser console for detailed error messages
4. Verify CDP Portal settings

## Migration Timeline

- **June 27, 2025**: Secure Init becomes default for new apps
- **July 31, 2025**: Secure Init becomes mandatory for all apps

## Resources

- [CDP Documentation](https://docs.cdp.coinbase.com)
- [x402 Protocol](https://x402.org)
- [CDP Discord](https://discord.com/invite/cdp)

## Support

If you encounter issues:
1. Check this troubleshooting guide
2. Verify your environment variables and API keys
3. Join the [CDP Discord](https://discord.com/invite/cdp) for community support 