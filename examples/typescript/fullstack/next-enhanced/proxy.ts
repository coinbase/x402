import { payai } from 'facilitators'; // can change this if you want, coinbase, etc...
import { NextRequest } from 'next/server';
import { paymentMiddleware, RoutesConfig } from 'x402-next';

const paymentConfig: RoutesConfig = {
	'GET /api/random': {
		price: '$0.01',
		network: 'base-sepolia',
		config: {
			description: 'Generate a random number',
			discoverable: true,
		},
	},
	'GET /api/quote': {
		price: '$0.05',
		network: 'base-sepolia',
		config: {
			description: 'Get an inspirational quote',
			discoverable: true,
		},
	},
	'POST /api/generate': {
		price: '$0.10',
		network: 'base-sepolia',
		config: {
			description: 'Generate AI content',
			discoverable: true,
		},
	},
	'GET /api/download': {
		price: '$0.25',
		network: 'base-sepolia',
		config: {
			description: 'Download premium content',
			discoverable: true,
		},
	},
	'GET /api/stream': {
		price: '$0.15',
		network: 'base-sepolia',
		config: {
			description: 'Stream real-time data',
			discoverable: true,
		},
	},
};

const x402Handler = paymentMiddleware(
	process.env.X402_WALLET_ADDRESS as `0x${string}`,
	paymentConfig,
	payai
);

export async function proxy(req: NextRequest) {
	return x402Handler(req);
}

export const config = {
	matcher: [
		'/api/random',
		'/api/quote',
		'/api/generate',
		'/api/download',
		'/api/stream',
	],
};

// And yeah, we don't use middleware in nextjs anymore, it's now proxy (fancy)
