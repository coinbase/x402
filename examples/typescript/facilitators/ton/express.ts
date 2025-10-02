import express from 'express';
import { createTonRpc } from '../../../packages/x402/src/ton/rpc';
import { verifyTONExact } from '../../../packages/x402/src/ton/verify';

const app = express();
app.use(express.json());

const rpc = createTonRpc({ endpoint: process.env.TON_RPC || 'https://your-ton-indexer.example' });

app.post('/x402/verify/ton/exact', async (req, res) => {
  const { txid, memo, to, asset, amountAtomic } = req.body;
  const out = await verifyTONExact({
    txid,
    memo,
    to,
    asset,
    amountAtomic: BigInt(amountAtomic),
    rpc,
  });
  if (!out.ok) return res.status(402).json(out);
  // optional: wait N blocks for finality
  return res.status(200).json(out);
});

app.listen(8787, () => console.log('TON facilitator on :8787'));
