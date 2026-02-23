import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    network: process.env.EVM_NETWORK || "eip155:84532",
    payee: process.env.EVM_PAYEE_ADDRESS,
    observability: "enabled",
    testnet: true,
    timestamp: new Date().toISOString(),
  });
}
