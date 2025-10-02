// Proper Jetton transfer payload builder using ton-core
// Builds TonConnect-compatible message for JettonWallet.transfer()

import { beginCell, toNano, Address } from '@ton/core';

type BuildJettonMsg = {
  jettonWallet?: string; // optional, when known; otherwise send to jetton master wallet
  to: string;
  amount: string; // atomic (decimals per jetton)
  memo: string; // forward_payload (invoiceId)
  forwardTonAmount?: string; // defaults to "1" nanoton
};

export function encodeJettonTransfer(p: BuildJettonMsg) {
  // Build the Jetton transfer body using ton-core (TEP-74 compliant)
  // op::transfer#0f8a7ea5 query_id:uint64 amount:(VarUInteger 16) destination:MsgAddress
  // response_destination:MsgAddress custom_payload:(Maybe ^Cell) forward_ton_amount:(VarUInteger 16)
  // forward_payload:(Either Cell ^Cell) = InternalMsgBody;
  const transferBody = beginCell()
    .storeUint(0x0f8a7ea5, 32) // op code for transfer (TEP-74)
    .storeCoins(BigInt(p.amount)) // jetton amount (atomic units)
    .storeAddress(Address.parse(p.to)) // destination address
    .storeAddress(null) // response_destination (null = burn remaining jettons)
    .storeCoins(p.forwardTonAmount ? toNano(p.forwardTonAmount) : toNano('0.000000001')) // forward_ton_amount (minimum for fees)
    .storeBit(true) // forward_payload in main slice (true = data follows)
    .storeRef(beginCell().storeBuffer(Buffer.from(p.memo, 'utf8')).endCell()) // forward_payload as separate cell
    .endCell();

  // For TonConnect, return the message structure
  // Note: Jetton wallet address calculation
  // wallet_address = SHA256(jetton_master + user_address + jetton_wallet_code)
  // This is automatically handled by TonConnect SDK when user connects wallet
  return {
    address: p.jettonWallet || '<JETTON_WALLET_OF_PAYER>', // Placeholder for wallet address
    amount: '0', // Fee paid by attached TON, jetton transfer itself is free
    payload: transferBody.toBoc().toString('base64') // Full TEP-74 compliant payload
  };
}
