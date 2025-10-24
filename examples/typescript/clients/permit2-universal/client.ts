import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { http, publicActions, createWalletClient, Hex, Address } from "viem";
import axios from "axios";

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "./.env") });

// Environment variables
let clientPrivateKey = process.env.CLIENT_PRIVATE_KEY as Hex | undefined;
if (clientPrivateKey && !clientPrivateKey.startsWith("0x")) {
  clientPrivateKey = `0x${clientPrivateKey}` as Hex;
}

const providerUrl = process.env.PROVIDER_URL;

if (!clientPrivateKey || !providerUrl) {
  console.error("Missing CLIENT_PRIVATE_KEY or PROVIDER_URL in .env file");
  process.exit(1);
}

// Constants
const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3" as Address;
const RESOURCE_SERVER_URL = "http://localhost:4025"; // Different port for Permit2 example
const TOKEN_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as Address; // Base Sepolia USDC
const PAYMENT_AMOUNT = "50000"; // 0.05 USDC (50000 wei, assuming 6 decimals)
const FACILITATOR_WALLET_ADDRESS = "0xaec0188efb73769aedd1ffcbb7c5e1fe468e64e3" as Address; // Facilitator's wallet address

// Setup client wallet
const clientAccount = privateKeyToAccount(clientPrivateKey as Hex);
const clientWallet = createWalletClient({
  account: clientAccount,
  chain: baseSepolia,
  transport: http(providerUrl),
}).extend(publicActions);

/**
 * Check if Permit2 is approved for the token
 */
async function checkPermit2Approval(): Promise<boolean> {
  try {
    const allowance = await clientWallet.readContract({
      address: TOKEN_ADDRESS,
      abi: [
        {
          inputs: [
            { name: "owner", type: "address" },
            { name: "spender", type: "address" },
          ],
          name: "allowance",
          outputs: [{ name: "", type: "uint256" }],
          stateMutability: "view",
          type: "function",
        },
      ],
      functionName: "allowance",
      args: [clientAccount.address, PERMIT2_ADDRESS],
    });

    const hasApproval = (allowance as bigint) >= BigInt(PAYMENT_AMOUNT);

    if (!hasApproval) {
      console.log(`\n⚠️  Permit2 is not approved for this token.`);
      console.log(`   Token: ${TOKEN_ADDRESS}`);
      console.log(`   Spender: ${PERMIT2_ADDRESS}`);
      console.log(`   Current allowance: ${allowance}`);
      console.log(`   Required amount: ${PAYMENT_AMOUNT}`);
    }

    return hasApproval;
  } catch (error) {
    console.error("Error checking Permit2 approval:", error);
    return false;
  }
}

/**
 * Approve Permit2 to spend tokens
 */
async function approvePermit2(): Promise<boolean> {
  try {
    console.log(`\n🔓 Approving Permit2 to spend tokens...`);
    console.log(`   Token: ${TOKEN_ADDRESS}`);
    console.log(`   Spender: ${PERMIT2_ADDRESS}`);
    console.log(`   Amount: max (unlimited)`);

    // Approve max uint256 for Permit2 (one-time approval)

    const tx = await clientWallet.writeContract({
      address: TOKEN_ADDRESS,
      abi: [
        {
          inputs: [
            { name: "spender", type: "address" },
            { name: "amount", type: "uint256" },
          ],
          name: "approve",
          outputs: [{ name: "", type: "bool" }],
          stateMutability: "nonpayable",
          type: "function",
        },
      ],
      functionName: "approve",
      args: [PERMIT2_ADDRESS, BigInt(PAYMENT_AMOUNT)],
    });

    console.log(`   Transaction hash: ${tx}`);
    console.log(`   Waiting for confirmation...`);

    const receipt = await clientWallet.waitForTransactionReceipt({ hash: tx });

    if (receipt.status === "success") {
      console.log(`   ✅ Approval successful!`);
      console.log(`   Block: ${receipt.blockNumber}`);
      return true;
    } else {
      console.error(`   ❌ Approval transaction failed`);
      return false;
    }
  } catch (error: any) {
    console.error(`\n❌ Error approving Permit2:`, error.message);
    return false;
  }
}

/**
 * Create an x402 payment header using Permit2
 */
async function createPermit2PaymentHeader() {
  console.log(`\n🔐 Creating Permit2 payment header...`);
  console.log(`   Client: ${clientAccount.address}`);
  console.log(`   Token: ${TOKEN_ADDRESS}`);
  console.log(`   Amount: ${PAYMENT_AMOUNT}`);

  // Get current nonce from Permit2 contract
  const allowanceData = await clientWallet.readContract({
    address: PERMIT2_ADDRESS,
    abi: [
      {
        inputs: [
          { name: "owner", type: "address" },
          { name: "token", type: "address" },
          { name: "spender", type: "address" },
        ],
        name: "allowance",
        outputs: [
          { name: "amount", type: "uint160" },
          { name: "expiration", type: "uint48" },
          { name: "nonce", type: "uint48" },
        ],
        stateMutability: "view",
        type: "function",
      },
    ],
    functionName: "allowance",
    args: [clientAccount.address, TOKEN_ADDRESS, clientAccount.address], // spender can be anyone for signature
  });

  const nonce = (allowanceData as unknown as [bigint, number, number])[2];
  console.log(`   Current nonce: ${nonce}`);

  const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
  // IMPORTANT: spender must be the facilitator's wallet address
  // The facilitator will execute permitTransferFrom on behalf of the client
  const spender = FACILITATOR_WALLET_ADDRESS;
  console.log(`   Spender (Facilitator): ${spender}`);

  // Sign the Permit2 authorization
  const domain = {
    name: "Permit2",
    chainId: baseSepolia.id,
    verifyingContract: PERMIT2_ADDRESS,
  };

  const types = {
    PermitTransferFrom: [
      { name: "permitted", type: "TokenPermissions" },
      { name: "spender", type: "address" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
    TokenPermissions: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
    ],
  };

  const message = {
    permitted: {
      token: TOKEN_ADDRESS,
      amount: BigInt(PAYMENT_AMOUNT),
    },
    spender: spender,
    nonce: BigInt(nonce.toString()),
    deadline: BigInt(deadline),
  };

  const signature = await clientWallet.signTypedData({
    domain,
    types,
    primaryType: "PermitTransferFrom",
    message,
  });

  console.log(`   ✅ Permit2 signed!`);

  // Create x402 payment payload
  const paymentPayload = {
    x402Version: 1,
    scheme: "exact",
    network: "base-sepolia",
    payload: {
      authorizationType: "permit2",
      signature,
      authorization: {
        owner: clientAccount.address,
        spender,
        token: TOKEN_ADDRESS,
        amount: PAYMENT_AMOUNT,
        deadline: deadline.toString(),
        nonce: nonce.toString(),
      },
    },
  };

  // Encode as base64
  const paymentHeader = Buffer.from(JSON.stringify(paymentPayload)).toString("base64");
  return paymentHeader;
}

/**
 * Make a request to a resource server with x402 Permit2 payment
 */
async function makePaymentRequest() {
  try {
    // First check if Permit2 is approved
    let isApproved = await checkPermit2Approval();
    if (!isApproved) {
      console.log(`\n🔄 Attempting to approve Permit2 automatically...`);
      const approved = await approvePermit2();
      if (!approved) {
        console.log(`\n❌ Failed to approve Permit2. Please approve manually.`);
        console.log(`   You can approve using:`);
        console.log(`   cast send ${TOKEN_ADDRESS} "approve(address,uint256)" ${PERMIT2_ADDRESS} $(cast max-uint256) --private-key $PRIVATE_KEY --rpc-url $RPC_URL`);
        process.exit(1);
      }

      // Verify approval was successful
      isApproved = await checkPermit2Approval();
      if (!isApproved) {
        console.log(`\n❌ Approval verification failed.`);
        process.exit(1);
      }
    }

    console.log(`\n🚀 Making request to resource server...`);

    // First request - should get 402 Payment Required
    let response = await axios.post(
      `${RESOURCE_SERVER_URL}/protected-resource`,
      {},
      { validateStatus: () => true }
    );

    if (response.status === 402) {
      console.log(`\n💰 402 Payment Required`);
      console.log(`   Payment details:`, response.data.accepts[0]);

      // Create and attach payment header
      const paymentHeader = await createPermit2PaymentHeader();

      // Retry with payment
      console.log(`\n🔄 Retrying with payment...`);
      response = await axios.post(
        `${RESOURCE_SERVER_URL}/protected-resource`,
        {},
        {
          headers: {
            "X-PAYMENT": paymentHeader,
          },
        }
      );
    }

    if (response.status === 200) {
      console.log(`\n✅ Success!`);
      console.log(`   Response:`, response.data);
      console.log(`\n💡 Key Benefits of Permit2:`);
      console.log(`   - Works with ANY ERC20 token`);
      console.log(`   - Single transaction after initial approval`);
      console.log(`   - Built-in expiration for security`);
      console.log(`   - Can batch multiple tokens`);
    } else if (response.status === 402 && response.data?.details === "permit2_not_approved") {
      console.error(`\n❌ Payment verification failed: Permit2 not approved`);
      console.log(`\n⚠️  Permit2 is not approved for this token.`);
      console.log(`   Please approve Permit2 first:`);
      console.log(`   Token: ${TOKEN_ADDRESS}`);
      console.log(`   Spender: ${PERMIT2_ADDRESS}`);
      console.log(`   \n   You can approve using:`);
      console.log(`   cast send ${TOKEN_ADDRESS} "approve(address,uint256)" ${PERMIT2_ADDRESS} $(cast max-uint256) --private-key $PRIVATE_KEY --rpc-url $RPC_URL`);
    } else {
      console.error(`\n❌ Request failed with status ${response.status}`);
      console.error(`   Error:`, response.data);
    }
  } catch (error: any) {
    console.error(`\n❌ Error:`, error.message);
    if (error.response) {
      console.error(`   Status:`, error.response.status);
      console.error(`   Data:`, error.response.data);
    }
  }
}

// Run the example
console.log(`\n═══════════════════════════════════════════`);
console.log(`   Permit2 Universal Approvals x402 Example`);
console.log(`═══════════════════════════════════════════`);
console.log(`\n📝 About Permit2:`);
console.log(`   Permit2 is deployed at: ${PERMIT2_ADDRESS}`);
console.log(`   It provides universal token approvals for ANY ERC20 token`);
console.log(`   One-time approval per token, then sign permits off-chain`);
console.log(`\n✨ Features:`);
console.log(`   - Automatic approval if not already approved`);
console.log(`   - Seamless x402 payment integration`);
console.log(`   - Off-chain signature-based transfers\n`);

makePaymentRequest().catch(console.error);

