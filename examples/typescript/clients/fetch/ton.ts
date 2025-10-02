import { TonConnectUI } from '@tonconnect/ui';
import { buildTonPaymentHeader, selectTonExactPayment } from '../../../packages/x402/src/ton/client';

// Assume you fetched PaymentKindsResponse that includes TON/exact options
export async function payWithTonExample(paymentOptions: any) {
  const tc = new TonConnectUI();
  await tc.connectWallet();

  const tonOptions = (paymentOptions?.exact || []).filter((o: any) => o.network?.startsWith('ton:'));
  const pay = selectTonExactPayment(tonOptions);

  // Build TonConnect request (simplified):
  const tx = pay.asset.kind === 'native'
    ? {
        validUntil: pay.validUntil,
        messages: [{
          address: pay.to,
          amount: pay.amountAtomic,
          payload: { type: 'text', text: pay.memo },
        }],
      }
    : {
        validUntil: pay.validUntil,
        messages: [{
          // See jettonPayload.ts for fully encoded transfer
          address: '<JETTON_WALLET_OF_PAYER>',
          amount: '0',
          payload: {
            type: 'jetton-transfer',
            to: pay.to,
            amount: pay.amountAtomic,
            forward_ton_amount: '1',
            forward_payload: `x402:${pay.memo}` ,
          },
        }],
      };

  const result = await tc.sendTransaction(tx);
  const header = buildTonPaymentHeader({ scheme: 'exact', network: 'TON', txid: (result as any)?.bocHash });
  return { header, result };
}
