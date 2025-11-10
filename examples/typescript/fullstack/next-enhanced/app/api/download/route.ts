import { NextResponse } from 'next/server';

export async function GET() {
	try {
		const content = `
 ====================================================================
  ||                    PREMIUM CONTENT                           ||
  ||                      ...Demo ...                             ||
 ====================================================================
  
  Thank you for your purchase! 🎉
  
  This is a demo of wachu think this is?.
  
  Transaction Details:
  - Timestamp: ${new Date().toISOString()}
  - Content Type: Premium Something, Anything
  - Access Level: Trust me bro
  
  ====================================================================
  
  INCLUDED FEATURES (in my react client package):
  
  - Instant payment verification
  - Zero gas fees (message signing only)
  - Transaction receipt with proof of payment
  - Cross-chain support (Base, Polygon, Avalanche and their testnets...)
  
  ====================================================================
  
  This content was purchased using the x402 payment protocol with the react-client package.
  Visit https://x402.com to learn more.
  
  `;

		const blob = new Blob([content], { type: 'text/plain' });

		return new NextResponse(blob, {
			headers: {
				'Content-Type': 'text/plain',
				'Content-Disposition': 'attachment; filename="x402-premium-content.txt"',
			},
		});
	} catch (error) {
		return NextResponse.json(
			{ success: false, error: 'Failed to generate PDF blob!' },
			{ status: 500 }
		);
	}
}
