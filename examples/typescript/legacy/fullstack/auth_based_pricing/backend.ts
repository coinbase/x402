import { Hono, Context as HonoContext } from 'hono';
import { serve } from '@hono/node-server';
import { sign, verify as verifyJwtSignature } from 'hono/jwt';
import { config } from 'dotenv';
import { Hex } from 'viem';
import { SiweMessage, generateNonce } from 'siwe';

import {
  PaymentRequirements,
  Price as X402Price,
  Network as X402Network,
  Resource as X402Resource,
  PaymentPayload,
  settleResponseHeader,
  ERC20TokenAmount
} from 'x402/types';
import { useFacilitator } from 'x402/verify';
import { exact } from 'x402/schemes';
import { processPriceToAtomicAmount } from 'x402/shared';
// uncomment to use the CDP Base mainnet facilitator
//import { facilitator } from "@coinbase/x402"; 


// --- Environment Variable Loading ---
config(); // Load .env or .env-local

// --- Configuration Constants ---
const JWT_SECRET = process.env.JWT_SECRET as string;
const DEMO_SERVER_PORT = parseInt(process.env.DEMO_SERVER_PORT || '3000', 10);
const BUSINESS_WALLET_ADDRESS = process.env.BUSINESS_WALLET_ADDRESS as Hex; // Wallet to receive payments
const FACILITATOR_URL = 'https://x402.org/facilitator'; // x402 Sepolia Facilitator
const X402_NETWORK = process.env.X402_NETWORK as X402Network; // Network for x402 payments (e.g., 'base-sepolia', 'base')
const X402_VERSION = 1; // Standard x402 version

// Validate essential configuration
if (!JWT_SECRET || !BUSINESS_WALLET_ADDRESS || !FACILITATOR_URL || !X402_NETWORK) {
  console.error('CRITICAL ERROR: Missing essential server environment variables. Check .env-local or .env file.');
  process.exit(1);
}

// --- Hono App & x402 Facilitator Setup ---
const app = new Hono();
// Initialize x402 facilitator client for payment verification and settlement
// for mainnet, use the CDP Base mainnet facilitator as follows:
// const { verify: verifyX402Payment, settle: settleX402Payment } = useFacilitator(facilitator);
const { verify: verifyX402Payment, settle: settleX402Payment } = useFacilitator({ url: FACILITATOR_URL });

// --- SIWE Nonce Store (In-Memory for Demo) ---
// IMPORTANT: For production, use a persistent store (e.g., Redis, DB) with proper TTL management for nonces.
const issuedNonces = new Set<string>();
const NONCE_EXPIRATION_TIME_MS = 5 * 60 * 1000; // Nonces expire after 5 minutes

// --- Helper: Create x402 Exact Payment Requirements ---
/**
 * Constructs the payment requirements object for an x402 payment.
 * @param price The price for the resource (e.g., '$0.10').
 * @param network The blockchain network for the payment.
 * @param resource The URL or identifier of the resource being accessed.
 * @param description A description for the payment.
 * @returns PaymentRequirements object for the x402 challenge.
 */
function createExactPaymentRequirements(
  price: X402Price,
  network: X402Network,
  resource: X402Resource,
  description = "",
): PaymentRequirements {
  const atomicAmountForAsset = processPriceToAtomicAmount(price, network);
  if ("error" in atomicAmountForAsset) {
    console.error("[X402Svc] Error processing price to atomic amount:", atomicAmountForAsset.error);
    throw new Error(`Failed to process price: ${atomicAmountForAsset.error}`);
  }
  const { maxAmountRequired, asset } = atomicAmountForAsset;
  const erc20Asset = asset as ERC20TokenAmount["asset"];
  return {
    scheme: "exact",
    network,
    maxAmountRequired,
    resource,
    description,
    mimeType: "application/json", // Content type of the protected resource
    payTo: BUSINESS_WALLET_ADDRESS,
    maxTimeoutSeconds: 60, // Client has 60s to complete payment after challenge
    asset: erc20Asset.address, // e.g., USDC contract address on the specified network
    outputSchema: undefined, // Optional: JSON schema for the expected response after payment
    extra: { name: erc20Asset.eip712.name, version: erc20Asset.eip712.version }, // EIP-712 domain info for the payment asset
  };
}

// --- Helper: Handle x402 Payment Flow (Verification & Challenge Response) ---
interface X402HandlingResult {
  success: boolean;
  response?: Response; // Pre-formatted Hono Response for 402 challenges or errors
  decodedPayment?: PaymentPayload; // Validated and decoded payment from X-PAYMENT header
  verifiedPayer?: Hex; // Wallet address of the payer, verified by facilitator
}

/**
 * Handles the x402 payment verification logic.
 * Checks for X-PAYMENT header, decodes it, verifies with facilitator.
 * Returns a success status or a pre-formatted 402 Hono Response object.
 */
async function handleX402PaymentVerification(
  c: HonoContext,
  paymentRequirements: PaymentRequirements[],
): Promise<X402HandlingResult> {
  const paymentHeader = c.req.header('X-PAYMENT');

  // If no payment header, issue a 402 challenge with payment requirements
  if (!paymentHeader) {
    console.log('[X402Svc] No X-PAYMENT header. Responding with 402 challenge.');
    return {
      success: false,
      response: c.json({
        x402Version: X402_VERSION,
        error: "X-PAYMENT header is required",
        accepts: paymentRequirements
      }, 402)
    };
  }

  // Decode the payment header
  let decodedPayment: PaymentPayload;
  try {
    decodedPayment = exact.evm.decodePayment(paymentHeader);
  } catch (error: any) {
    console.error('[X402Svc] Error decoding X-PAYMENT header:', error.message);
    return {
      success: false,
      response: c.json({
        x402Version: X402_VERSION,
        error: error.message || "Invalid or malformed X-PAYMENT header",
        accepts: paymentRequirements
      }, 402)
    };
  }

  // Verify the decoded payment with the facilitator
  try {
    const verificationResponse = await verifyX402Payment(decodedPayment, paymentRequirements[0]);
    if (!verificationResponse.isValid) {
      console.warn('[X402Svc] Payment verification failed by facilitator:', verificationResponse.invalidReason);
      return {
        success: false,
        response: c.json({
          x402Version: X402_VERSION,
          error: verificationResponse.invalidReason,
          accepts: paymentRequirements,
          payer: verificationResponse.payer
        }, 402)
      };
    }
    console.log('[X402Svc] Payment verified successfully by facilitator for payer:', verificationResponse.payer);
    return {
      success: true,
      decodedPayment: decodedPayment,
      verifiedPayer: verificationResponse.payer as Hex
    };
  } catch (error: any) {
    console.error('[X402Svc] Critical error during facilitator payment verification process:', error.message);
    return {
      success: false,
      response: c.json({
        x402Version: X402_VERSION,
        error: error.message || "Facilitator verification process failed",
        accepts: paymentRequirements
      }, 500) // Use 500 for server-side errors with facilitator
    };
  }
}

// --- SIWE Authentication Endpoints ---

// Endpoint for clients to request a unique nonce for SIWE message construction
app.get('/auth/nonce', async (c) => {
  const nonce = generateNonce(); // Generate a cryptographically secure nonce
  issuedNonces.add(nonce);
  // Schedule nonce removal to prevent store bloat and enforce expiration
  setTimeout(() => issuedNonces.delete(nonce), NONCE_EXPIRATION_TIME_MS);
  console.log(`[AuthSvc] SIWE Nonce issued: ${nonce}`);
  return c.text(nonce); // Return nonce as plain text
});

// Endpoint for clients to submit a signed SIWE message for verification
app.post('/auth/verify-siwe', async (c) => {
  const { message, signature } = await c.req.json<{ message: string; signature: Hex }>();
  if (!message || !signature) return c.json({ error: 'SIWE message and signature are required' }, 400);

  try {
    const siweMessage = new SiweMessage(message); // Parse the client-provided EIP-4361 message

    // Validate nonce: ensure it was issued by this server and hasn't expired/been used
    if (!issuedNonces.has(siweMessage.nonce)) {
      console.warn(`[AuthSvc] Attempt to use invalid, expired, or already used SIWE nonce: ${siweMessage.nonce}`);
      return c.json({ error: 'Invalid, expired, or already used nonce. Please request a new one.' }, 403);
    }

    // Verify the SIWE message (checks signature, nonce against message, domain, time constraints, etc.)
    const { success: verificationSuccess, error: verificationError, data: verifiedSiweMessage } = await siweMessage.verify({
      signature,
      nonce: siweMessage.nonce, // Crucial: ensure nonce being verified is the one from the message body
      // domain: 'expected.domain.com', // Optional: verify against expected domain
      // time: new Date() // Optional: verify against current time for issuedAt, expirationTime, notBefore
    });

    if (!verificationSuccess) {
      console.warn(`[AuthSvc] SIWE message verification failed for address ${siweMessage.address}:`, verificationError);
      return c.json({ error: 'SIWE message verification failed.', details: verificationError?.type || 'Unknown SIWE error' }, 401);
    }

    // SIWE verification successful, invalidate the nonce immediately to prevent replay attacks
    issuedNonces.delete(siweMessage.nonce);
    const walletAddress = verifiedSiweMessage.address as Hex; // Use address from verified data
    console.log(`[AuthSvc] Successful SIWE verification for ${walletAddress}`);

    // Issue JWT for session management
    const payload = {
      sub: walletAddress.toLowerCase(), // Subject: user's wallet address
      iat: Math.floor(Date.now() / 1000), // Issued At: current time
      exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24), // Expiration Time: 24 hours
    };
    const token = await sign(payload, JWT_SECRET);

    return c.json({ success: true, message: 'Login successful via SIWE', token });

  } catch (error: any) {
    console.error('[AuthSvc] Critical error during SIWE verification process:', error);
    return c.json({ error: 'SIWE verification process failed due to a server error.', details: error.message }, 500);
  }
});

// --- x402 Gated Demo Endpoint (/demo-weather) with Conditional Pricing ---
app.get('/demo-weather', async (c: HonoContext) => {
  // 1. Determine Price Conditionally based on JWT authentication
  const authHeader = c.req.header('Authorization');
  let isAuthenticated = false;
  let priceString: X402Price = '$0.10'; // Default price for unauthenticated users

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      const payload = await verifyJwtSignature(token, JWT_SECRET); // Verify the JWT
      if (payload && payload.sub) { // Check for subject (wallet address) in JWT
        isAuthenticated = true;
        priceString = '$0.01'; // Discounted price for authenticated users
        console.log(`[X402Svc] User ${payload.sub} is authenticated via JWT. Applying discounted price: ${priceString}`);
      }
    } catch (err) {
      // JWT invalid or expired, treat as unauthenticated for pricing
      console.log('[X402Svc] JWT verification failed for pricing. Applying default price.');
    }
  }
  if (!isAuthenticated) {
    console.log(`[X402Svc] User not authenticated via JWT. Applying default price: ${priceString}`);
  }

  // 2. Construct Payment Requirements for the determined price
  const resourceUrl = c.req.url as X402Resource; // The resource being accessed
  let paymentRequirements: PaymentRequirements[];
  try {
    paymentRequirements = [createExactPaymentRequirements(priceString, X402_NETWORK, resourceUrl, 'Access to premium demo weather forecast')];
  } catch (error: any) {
    console.error('[X402Svc] Error creating payment requirements for /demo-weather:', error.message);
    return c.json({ error: 'Server error: Could not create payment requirements.' }, 500);
  }

  // 3. Handle x402 Payment Flow (Verification/Challenge)
  const x402Result = await handleX402PaymentVerification(c, paymentRequirements);

  // If payment verification failed or a challenge was issued, return the 402 response
  if (!x402Result.success || !x402Result.decodedPayment || !x402Result.verifiedPayer) {
    return x402Result.response!;
  }

  // 4. Settle Payment (Good practice after successful verification)
  try {
    const settlement = await settleX402Payment(x402Result.decodedPayment, paymentRequirements[0]);
    const paymentResponseHeaderVal = settleResponseHeader(settlement);
    c.header('X-PAYMENT-RESPONSE', paymentResponseHeaderVal); // Send settlement confirmation to client
    console.log('[X402Svc] /demo-weather: Payment settled. X-PAYMENT-RESPONSE header set.');
  } catch (error: any) {
    console.error('[X402Svc] /demo-weather: Payment settlement failed (after verification). This is a server-side issue:', error.message);
    // Note: Content is still served as payment was verified. Settlement failure is logged.
  }

  // 5. Return Resource (Weather Data)
  console.log('[DemoSvc] /demo-weather: Access granted. Payment successful.');
  const weatherReport = {
    location: 'Demo City',
    temperature: '72°F',
    condition: 'Sunny with x402 skies!',
    message: 'This is a mock weather report. Payment was successful!',
    pricePaid: priceString, // Reflect the price that was required for this access
    payer: x402Result.verifiedPayer // The verified wallet address that paid
  };
  return c.json(weatherReport);
});

// --- Main Server Start Function ---
async function main() {
  serve({
    fetch: app.fetch,
    port: DEMO_SERVER_PORT,
  }, (info) => {
    console.log(`🚀 SIWE-JWT-x402 Demo Server running on http://localhost:${info.port}`);
    console.log('----------------------------------------------------------------------');
    console.log('🔑 JWT Secret:', JWT_SECRET ? 'LOADED' : 'MISSING - Server will fail!');
    console.log('💼 Business Wallet:', BUSINESS_WALLET_ADDRESS || 'MISSING - Payments will fail!');
    console.log('🌍 x402 Network:', X402_NETWORK || 'MISSING - Payments will fail!');
    console.log('----------------------------------------------------------------------');
    console.log('💡 To test, run the client script in a separate terminal: npm run dev:client');
    console.log('----------------------------------------------------------------------');
  });
}

main().catch(err => {
  console.error('💥 Failed to start server:', err);
  process.exit(1);
}); 