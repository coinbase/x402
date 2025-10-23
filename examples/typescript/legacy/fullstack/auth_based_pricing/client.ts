import { config } from 'dotenv';
import { Hex, PrivateKeyAccount } from 'viem'; // Removed createWalletClient, http as not directly used here
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia, base } from 'viem/chains';
import { SiweMessage } from 'siwe';
import _fetch from 'node-fetch'; // Using ESM-compatible import for node-fetch
import { wrapFetchWithPayment, decodeXPaymentResponse } from 'x402-fetch';
import { fileURLToPath } from 'url';

// --- Environment Variable Loading ---
config(); // Load .env-local or .env

// --- Configuration Constants ---
const DEMO_SERVER_PORT = parseInt(process.env.DEMO_SERVER_PORT || '3000', 10);
const CLIENT_SIM_PRIVATE_KEY = process.env.CLIENT_SIM_PRIVATE_KEY as Hex;

// Validate essential client configuration
if (!CLIENT_SIM_PRIVATE_KEY) {
  console.error('CRITICAL ERROR: Missing CLIENT_SIM_PRIVATE_KEY environment variable for client simulation. Check .env-local or .env file.');
  process.exit(1);
}

// --- Main Client Simulation Function ---
async function runClientDemo() {
  console.log('\n🚀 --- Starting Client Simulation --- 🚀');
  
  // Setup client wallet from private key (for demo purposes)
  // In a real app, this would come from a browser wallet extension (e.g., MetaMask)
  const clientWalletAccount = privateKeyToAccount(CLIENT_SIM_PRIVATE_KEY);
  const clientWalletAddress = clientWalletAccount.address;
  console.log(`[ClientSim] Using wallet address for simulation: ${clientWalletAddress}`);

  const serverBaseUrl = `http://localhost:${DEMO_SERVER_PORT}`;
  const chainId = baseSepolia.id; // Chain ID for SIWE message (must match server if verified strictly)
  let jwtToken: string | null = null;

  // --- Step 1: SIWE Login Flow ---
  console.log('\n🔄 [ClientSim] Step 1: Attempting SIWE Login...');
  try {
    // 1a. Request nonce from the server
    console.log(`[ClientSim]   Requesting nonce from ${serverBaseUrl}/auth/nonce...`);
    const nonceResponse = await _fetch(`${serverBaseUrl}/auth/nonce`);
    if (!nonceResponse.ok) {
      throw new Error(`Nonce request failed: ${nonceResponse.status} ${await nonceResponse.text()}`);
    }
    const nonce = await nonceResponse.text();
    console.log(`[ClientSim]   ✅ Received SIWE nonce: ${nonce}`);

    // 1b. Client constructs the SIWE message parameters
    const siweMessageParams = {
      domain: 'localhost', // IMPORTANT: Should match the domain the server expects/verifies
      address: clientWalletAddress,
      statement: 'Sign in with Ethereum to the demo app.', 
      uri: serverBaseUrl, // The URI a user is logging into
      version: '1', // SIWE version
      chainId: chainId, // Chain ID
      nonce: nonce, // Server-issued nonce
      issuedAt: new Date().toISOString(), // Current time
      // expirationTime: new Date(Date.now() + NONCE_EXPIRATION_TIME_MS).toISOString(), // Optional: if server checks it
    };
    const siweMessage = new SiweMessage(siweMessageParams);
    const messageToSign = siweMessage.prepareMessage(); // Formats the EIP-4361 message string
    console.log(`[ClientSim]   Prepared SIWE message to sign:\n${messageToSign}`);

    // 1c. Client signs the SIWE message (simulating wallet interaction)
    const signature = await clientWalletAccount.signMessage({ message: messageToSign });
    console.log(`[ClientSim]   ✅ SIWE Message signed. Signature: ${signature.substring(0,10)}...`);

    // 1d. Client sends the SIWE message and signature to the server for verification
    console.log(`[ClientSim]   Verifying signature with server at ${serverBaseUrl}/auth/verify-siwe...`);
    const verifyResponse = await _fetch(`${serverBaseUrl}/auth/verify-siwe`, {
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: messageToSign, signature }), // Send the message string client signed
    });
    const loginData = await verifyResponse.json() as { success?: boolean; token?: string; error?: string, message?: string, details?: string };
    if (!verifyResponse.ok || !loginData.success || !loginData.token) {
      throw new Error(`SIWE Login failed: ${loginData.error || loginData.message || loginData.details || 'Unknown SIWE login error'} (Status: ${verifyResponse.status})`);
    }
    jwtToken = loginData.token;
    console.log('[ClientSim]   ✅ SIWE Login successful! JWT obtained.');
    // console.log('[ClientSim] JWT:', jwtToken); // Optionally log the full JWT for debugging
  } catch (error) {
    console.error('[ClientSim] ❌ SIWE Login flow error:', error);
    // If login fails, we might not want to proceed with x402 calls that rely on JWT for discount
  }

  // --- Setup x402-fetch for subsequent calls ---
  // This wraps the standard fetch with x402 payment handling capabilities using the client's wallet.
  const fetchWithClientPayment = wrapFetchWithPayment(_fetch as any, clientWalletAccount);

  // --- Step 2: Call /demo-weather WITH JWT (Authenticated - Expecting Discounted Price) ---
  if (jwtToken) {
    console.log('\n🔄 [ClientSim] Step 2: Calling /demo-weather WITH JWT (expecting $0.01 price from server)...');
    try {
      const response = await fetchWithClientPayment(`${serverBaseUrl}/demo-weather`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${jwtToken}` }, // Include JWT for authentication
      });
      
      const x402RespHeader = response.headers.get('x-payment-response');
      
      if (!response.ok) {
        // This block might be hit if x402-fetch fails to handle the 402 automatically, or for other errors.
        const errText = await response.text();
        console.error(`[ClientSim]   ❌ Error from server (authenticated call): ${response.status} - ${errText}`);
        // Log x-payment-response even on error, if present, for debugging x402 client issues
        if (x402RespHeader) console.error('[ClientSim]   x-payment-response (on error):', decodeXPaymentResponse(x402RespHeader));
        throw new Error(`Authenticated /demo-weather call failed: ${response.status}`);
      }
      
      const weatherData = await response.json();
      console.log('[ClientSim]   ✅ Weather data (authenticated):', weatherData);
      if (x402RespHeader) {
        console.log('[ClientSim]   ✅ x-payment-response (authenticated):', decodeXPaymentResponse(x402RespHeader));
      }
    } catch (error: any) {
      console.error('[ClientSim]   ❌ Error during authenticated /demo-weather call:', error.message);
    }
  } else {
    console.warn('\n[ClientSim] Skipping authenticated /demo-weather call because JWT was not obtained.');
  }

  // --- Step 3: Call /demo-weather WITHOUT JWT (Unauthenticated - Expecting Regular Price) ---
  console.log('\n🔄 [ClientSim] Step 3: Calling /demo-weather WITHOUT JWT (expecting $0.10 price from server)...');
  try {
    const response = await fetchWithClientPayment(`${serverBaseUrl}/demo-weather`, { method: 'GET' });
    
    const x402RespHeader = response.headers.get('x-payment-response');

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[ClientSim]   ❌ Error from server (unauthenticated call): ${response.status} - ${errText}`);
      if (x402RespHeader) console.error('[ClientSim]   x-payment-response (on error):', decodeXPaymentResponse(x402RespHeader));
      throw new Error(`Unauthenticated /demo-weather call failed: ${response.status}`);
    }
    
    const weatherData = await response.json();
    console.log('[ClientSim]   ✅ Weather data (unauthenticated):', weatherData);
    if (x402RespHeader) {
      console.log('[ClientSim]   ✅ x-payment-response (unauthenticated):', decodeXPaymentResponse(x402RespHeader));
    }
  } catch (error: any) {
    console.error('[ClientSim]   ❌ Error during unauthenticated /demo-weather call:', error.message);
  }
  console.log('\n🏁 --- Client Simulation Ended --- 🏁');
}

// --- Script Execution Check (ESM Compatible) ---
// This ensures runClientDemo() is called only when the script is executed directly.
const currentFilePath = fileURLToPath(import.meta.url);
// In Node.js ESM, `process.argv[1]` should be the path to the executed script file.
// For `node dist/client.js`, `process.argv[1]` is `.../dist/client.js`
// For `tsx src/client.ts`, `tsx` might make `process.argv[1]` point to `.../src/client.ts` or the tsx shim.
// A more robust check might involve `endsWith` if paths differ slightly during dev (tsx) vs prod (node).
if (process.argv[1] && fileURLToPath(`file://${process.argv[1]}`) === currentFilePath) {
    runClientDemo().catch(err => {
        console.error("💥 Client Simulation CRASHED:", err);
        process.exit(1); // Exit with error code if client demo crashes
    });
} 