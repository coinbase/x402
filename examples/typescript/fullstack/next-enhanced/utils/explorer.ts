import { toast } from 'sonner';

const BLOCK_EXPLORER_URLS: Record<string, string> = {
	'8453': 'https://basescan.org',
	'84532': 'https://sepolia.basescan.org',
	'137': 'https://polygonscan.com',
	'80002': 'https://amoy.polygonscan.com',
	'43114': 'https://snowtrace.io',
	'43113': 'https://testnet.snowtrace.io',
};

export function getTxScanUrl(chainId: string, txHash: string): string {
	const baseUrl = BLOCK_EXPLORER_URLS[chainId];
	if (!baseUrl) {
		toast.error(`Unknown chain ID: ${chainId}`);

		return '';
	}
	return `${baseUrl}/tx/${txHash}`;
}

export function truncateTxHash(txHash: string): string {
	if (txHash.length <= 10) return txHash;
	return `${txHash.slice(0, 6)}...${txHash.slice(-4)}`;
}

export function formatNetworkName(network: string): string {
	return network
		.split('-')
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
		.join(' ');
}
