const axios = require('axios');
const { expect } = require('chai');

const BASE = process.env.FACILITATOR_URL || 'http://localhost:5401';

describe('Facilitator integration tests', function () {
  this.timeout(10000);

  it('responds to /healthz', async () => {
    const r = await axios.get(`${BASE}/healthz`);
    expect(r.status).to.equal(200);
    expect(r.data).to.have.property('ok', true);
  });

  it('responds to /supported', async () => {
    const r = await axios.get(`${BASE}/supported`);
    expect(r.status).to.equal(200);
    expect(r.data).to.have.property('networks');
    expect(r.data.networks).to.be.an('array');
  });

  it('rejects unsigned payload on /verify', async () => {
    const payload = { from: '0xCA3953e536bDA86D1F152eEfA8aC7b0C82b6eC00', to: '0xYourPayToAddress', value: 100, validAfter: 1, validBefore: 9999999999, nonce: '0xabc', chainId: 80002 };
    const b64 = Buffer.from(JSON.stringify(payload)).toString('base64');
    try {
      await axios.post(`${BASE}/verify`, { paymentPayloadBase64: b64 });
      throw new Error('expected /verify to fail for unsigned payload');
    } catch (e) {
      expect(e.response).to.exist;
      expect(e.response.status).to.equal(400);
      expect(e.response.data).to.have.property('success', false);
    }
  });

  it('accepts settle and returns simulated response', async () => {
    const payload = { from: '0xCA3953e536bDA86D1F152eEfA8aC7b0C82b6eC00', to: '0xYourPayToAddress', value: 100, validAfter: 1, validBefore: 9999999999, nonce: '0xdef', chainId: 80002 };
    const b64 = Buffer.from(JSON.stringify(payload)).toString('base64');
    const r = await axios.post(`${BASE}/settle`, { paymentPayloadBase64: b64 });
    expect(r.status).to.equal(200);
    expect(r.data).to.have.property('success', true);
  });
}); 