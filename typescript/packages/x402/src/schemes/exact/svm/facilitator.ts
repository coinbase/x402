import { VerifyResponse, SettleResponse } from "../../../types/verify";

// facilitator will:
// - propose a transaction to the client and send it in the 402 PAYMENT REQUIRED response
// - receive a partially signed transaction from the client
// - verify the partially signed transaction
// - sign the transaction
// - broadcast the transaction to the network
// - return success or failure info to the server which will then send it to the client

// TODO: implement
export async function verify(): Promise<VerifyResponse> {
  return {
    isValid: true,
    invalidReason: undefined,
    payer: "",
  };
}

// TODO: implement
export async function settle(): Promise<SettleResponse> {
  return {
    success: true,
    errorReason: undefined,
    payer: "",
    transaction: "",
    network: "solana-mainnet",
  };
}

// TODO: implement
export async function proposeTransaction(): Promise<string> {
  return "";
}