import { NextResponse } from "next/server";
import { NextRequest } from "next/server";

// export const middleware = paymentMiddleware(
//   payTo,
//   {
//     "/protected": {
//       price: "$0.01",
//       network,
//       config: {
//         description: "Access to protected content",
//       },
//     },
//   },
//   {
//     url: facilitatorUrl,
//   },
// );

export const middleware = async (request: NextRequest) => {
  const paymentHeader = request.cookies.get("payment-session");
  if (!paymentHeader) {
    return NextResponse.rewrite(new URL("/paywall", request.url));
  }

  return NextResponse.next();
};

// Configure which paths the middleware should run on
export const config = {
  matcher: ["/protected/:path*"],
};
