const { ethers } = require('ethers');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env.local') });

const AMOY_RPC_URL = process.env.AMOY_RPC_URL;
const AMOY_USDC_ADDRESS = process.env.AMOY_USDC_ADDRESS;
const PAYER_PRIVATE_KEY = process.env.PRIVATE_KEY; // payer signs the authorization
const FACILITATOR_URL = process.env.FACILITATOR_URL || 'http://localhost:5401';

async function main() {
  if (!AMOY_RPC_URL || !AMOY_USDC_ADDRESS || !PAYER_PRIVATE_KEY) {
    console.error('Missing envs in demo/.env.local');
    process.exit(1);
  }

  const wallet = new ethers.Wallet(PAYER_PRIVATE_KEY);
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    from: wallet.address,
    to: process.env.FACILITATOR_ADDRESS || '0xYourPayToAddress',
    value: Number(process.env.PAYMENT_AMOUNT || '10000'),
    validAfter: now - 60,
    validBefore: now + 3600,
    nonce: ethers.hexlify(ethers.randomBytes(32)),
    verifyingContract: AMOY_USDC_ADDRESS,
    chainId: 80002
  };

  // EIP-712 domain/types/message for TransferWithAuthorization
  const domain = {
    name: 'USDC',
    version: '2',
    chainId: payload.chainId,
    verifyingContract: payload.verifyingContract
  };
  const types = {
    TransferWithAuthorization: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' }
    ]
  };

  // ethers v6: use wallet.signTypedData
  const signature = await wallet.signTypedData(domain, types, {
    from: payload.from,
    to: payload.to,
    value: payload.value,
    validAfter: payload.validAfter,
    validBefore: payload.validBefore,
    nonce: payload.nonce
  });

  payload.signature = signature;

  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64');

  console.log('Calling /verify');
  try {
    const v = await axios.post(`${FACILITATOR_URL}/verify`, { paymentPayloadBase64: b64 });
    console.log('/verify response', v.status, v.data);
  } catch (e) {
    console.error('/verify failed', e.response && e.response.data ? e.response.data : e.message);
    process.exit(2);
  }

  console.log('Calling /settle');
  try {
    const s = await axios.post(`${FACILITATOR_URL}/settle`, { paymentPayloadBase64: b64 });
    console.log('/settle response', s.status, s.data);
    console.log('X-PAYMENT-RESPONSE:', s.headers['x-payment-response']);
  } catch (e) {
    console.error('/settle failed', e.response && e.response.data ? e.response.data : e.message);
    process.exit(3);
  }
}

main();
