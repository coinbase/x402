const axios = require('axios');

const BASE = process.env.FACILITATOR_URL || 'http://localhost:5401';

async function assertEquals(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    console.error('ASSERT FAIL:', msg, 'expected', b, 'got', a);
    process.exitCode = 2;
  }
}

async function testHealthz() {
  const r = await axios.get(`${BASE}/healthz`);
  console.log('/healthz', r.status, r.data);
  await assertEquals(r.status, 200, '/healthz status');
  await assertEquals(r.data.ok, true, '/healthz body');
}

async function testSupported() {
  const r = await axios.get(`${BASE}/supported`);
  console.log('/supported', r.status, r.data);
  await assertEquals(r.status, 200, '/supported status');
  if (!r.data.networks || !Array.isArray(r.data.networks)) {
    console.error('/supported invalid body');
    process.exitCode = 2;
  }
}

async function testVerifyNegative() {
  // missing signature should fail
  const payload = { from: '0xCA3953e536bDA86D1F152eEfA8aC7b0C82b6eC00', to: '0xYourPayToAddress', value: 100, validAfter: 1, validBefore: 9999999999, nonce: '0xabc', chainId: 80002 };
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64');
  try {
    const r = await axios.post(`${BASE}/verify`, { paymentPayloadBase64: b64 });
    console.error('/verify expected failure but got', r.status, r.data);
    process.exitCode = 2;
  } catch (e) {
    const r = e.response;
    console.log('/verify negative', r.status, r.data);
    if (r.status !== 400) process.exitCode = 2;
  }
}

async function testSettleSimulated() {
  const payload = { from: '0xCA3953e536bDA86D1F152eEfA8aC7b0C82b6eC00', to: '0xYourPayToAddress', value: 100, validAfter: 1, validBefore: 9999999999, nonce: '0xdef', chainId: 80002 };
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64');
  const r = await axios.post(`${BASE}/settle`, { paymentPayloadBase64: b64 });
  console.log('/settle', r.status, r.data, 'X-PAYMENT-RESPONSE:', r.headers['x-payment-response']);
  if (r.status !== 200) process.exitCode = 2;
}

async function run() {
  console.log('Running facilitator tests against', BASE);
  await testHealthz();
  await testSupported();
  await testVerifyNegative();
  await testSettleSimulated();
  if (process.exitCode === 0 || process.exitCode === undefined) console.log('All tests completed (some assertions may be warnings).');
}

run().catch(e => { console.error(e); process.exit(2); }); 