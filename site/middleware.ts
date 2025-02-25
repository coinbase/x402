import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { hono } from 'x402/server';
import { Hono } from 'hono';
import { Address } from 'viem';
import { Resource } from 'x402/types';

export async function middleware(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith('/protected')) {
    console.log('Not a protected route, skipping middleware');
    return NextResponse.next();
  }

  const facilitatorAddress = process.env.FACILITATOR_WALLET_ADDRESS;
  const facilitatorUrl =
    process.env.NEXT_PUBLIC_FACILITATOR_URL || 'http://localhost:4020';

  console.log('Environment variables:', {
    facilitatorAddress,
    facilitatorUrl,
  });

  if (!facilitatorAddress) {
    console.error('Missing FACILITATOR_WALLET_ADDRESS environment variable');
    return new NextResponse('Server configuration error', { status: 500 });
  }

  const app = new Hono();
  const resourceUrl =
    `${request.nextUrl.protocol}//${request.nextUrl.host}${request.nextUrl.pathname}` as Resource;

  app.use(
    '*',
    hono.paymentMiddleware('$0.01', facilitatorAddress as Address, {
      description: 'Access to protected content',
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
