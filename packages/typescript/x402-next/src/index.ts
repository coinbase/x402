import { NextRequest, NextResponse } from "next/server";

/* TODO */
export function paymentMiddleware(_: NextRequest): (request: NextRequest) => Promise<NextResponse> {
  return async (_: NextRequest) => {
    return NextResponse.next();
  };
}

/* TODO */
export function withPaymentMiddleware(
  middleware: (req: NextRequest) => Promise<NextResponse> | NextResponse,
): (request: NextRequest) => Promise<NextResponse> {
  return async (request: NextRequest) => {
    return middleware(request);
  };
}
