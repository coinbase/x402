import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { paymentMiddleware } from "x402/hono";
import { Hono } from "hono";
import { Address } from "viem";
import { Resource } from "x402/types";

export async function middleware(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/protected")) {
    console.log("Not a protected route, skipping middleware");
    return NextResponse.next();
  }

  const resourceWalletAddress = process.env.RESOURCE_WALLET_ADDRESS;
  const facilitatorUrl =
    process.env.NEXT_PUBLIC_FACILITATOR_URL || "https://x402.org/facilitator";

  if (!resourceWalletAddress) {
    console.error("Missing RESOURCE_WALLET_ADDRESS environment variable");
    return new NextResponse("Server configuration error", { status: 500 });
  }

  const app = new Hono();
  const resourceUrl =
    `${request.nextUrl.protocol}//${request.nextUrl.host}${request.nextUrl.pathname}` as Resource;

  app.use(
    "*",
    paymentMiddleware("$0.01", resourceWalletAddress as Address, {
      description: 'Stream "x402" by danXkim',
      testnet: true,
      facilitatorUrl,
      resource: resourceUrl,
    })
  );

  const honoReq = new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: request.body,
  });

  const res = await app.fetch(honoReq);

  if (res.status === 402) {
    return new NextResponse(await res.text(), {
      status: 402,
      headers: Object.fromEntries(res.headers.entries()),
    });
  }

  return NextResponse.next();
}
