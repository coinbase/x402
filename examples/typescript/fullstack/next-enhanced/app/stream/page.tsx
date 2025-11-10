'use client';

import { useState } from 'react';
import { useChainId, useX402Payment } from 'x402-react-client';
import { Radio, ArrowLeft, X } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { formatNetworkName, getTxScanUrl, truncateTxHash } from '@/utils';

export default function StreamPage() {
	const [streamContent, setStreamContent] = useState<string[]>([]);
	const [isStreaming, setIsStreaming] = useState(false);

	const chainId = useChainId();

	const { pay, isPending, receipt, error } = useX402Payment({
		responseType: 'stream',
		onSuccess: async (stream) => {
			setIsStreaming(true);
			setStreamContent([]);

			const reader = stream.getReader();
			const decoder = new TextDecoder();

			try {
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;

					const chunk = decoder.decode(value);
					setStreamContent((prev) => [...prev, chunk]);
				}
			} catch (err) {
				toast.error(`Stream error: ${(err as any)?.message}`);
			} finally {
				setIsStreaming(false);
			}

			toast.success('Stream complete!');
		},
	});

	const handleStartStream = async () => {
		setStreamContent([]);
		await pay('/api/stream');
	};

	return (
		<div className='max-w-4xl mx-auto space-y-8'>
			<Link
				href='/'
				className='inline-flex items-center text-gray-400 hover:text-white transition-colors'
			>
				<ArrowLeft className='w-4 h-4 mr-2' />
				Back to all demos
			</Link>

			<div className='bg-white/5 backdrop-blur-lg rounded-2xl p-8 border border-white/10'>
				<div className='flex items-start space-x-4'>
					<div className='w-16 h-16 bg-linear-to-br from-yellow-500 to-orange-500 rounded-xl flex items-center justify-center shrink-0'>
						<Radio className='w-8 h-8 text-white' />
					</div>
					<div className='flex-1'>
						<h1 className='text-3xl font-bold text-white mb-2'>Live Data Stream</h1>
						<p className='text-gray-400'>
							Real-time streaming data using ReadableStream (Server-Sent Events)
						</p>
						<div className='mt-4 inline-flex items-center space-x-2 text-sm'>
							<span className='text-gray-400'>Price:</span>
							<span className='font-semibold text-yellow-400 bg-yellow-500/20 px-3 py-1 rounded-full'>
								$0.15
							</span>
						</div>
					</div>
				</div>
			</div>

			<div className='bg-white/5 backdrop-blur-lg rounded-2xl p-8 border border-white/10 space-y-6'>
				<button
					onClick={handleStartStream}
					disabled={isPending || isStreaming}
					className='w-full bg-linear-to-r from-yellow-500 to-orange-500 text-white font-semibold py-4 px-6 rounded-xl hover:from-yellow-600 hover:to-orange-600 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2'
				>
					{isPending || isStreaming ? (
						<>
							<div className='w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin'></div>
							<span>{isPending ? 'Connecting...' : 'Streaming...'}</span>
						</>
					) : (
						<>
							<Radio className='w-5 h-5' />
							<span>Start Live Stream</span>
						</>
					)}
				</button>

				{error && (
					<div className='bg-red-500/10 border border-red-500/20 rounded-lg p-4 flex items-start space-x-3'>
						<X className='w-5 h-5 text-red-400 shrink-0 mt-0.5' />
						<div>
							<p className='text-red-400 font-semibold'>Stream Failed</p>
							<p className='text-red-300 text-sm mt-1'>{error.message}</p>
						</div>
					</div>
				)}
			</div>

			{streamContent.length > 0 && (
				<div className='bg-white/5 backdrop-blur-lg rounded-2xl p-8 border border-white/10 space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500'>
					<div className='flex items-center justify-between'>
						<h2 className='text-xl font-semibold text-white'>Live Stream Output</h2>
						{isStreaming && (
							<div className='flex items-center space-x-2'>
								<div className='w-2 h-2 bg-red-500 rounded-full animate-pulse'></div>
								<span className='text-red-400 text-sm'>LIVE</span>
							</div>
						)}
					</div>

					<div className='bg-black/40 rounded-xl p-6 border border-yellow-500/30 font-mono text-sm overflow-auto max-h-96'>
						<pre className='text-green-400 whitespace-pre-wrap'>
							{streamContent.join('')}
						</pre>
						{isStreaming && (
							<span className='inline-block w-2 h-4 bg-green-400 animate-pulse ml-1'></span>
						)}
					</div>

					{!isStreaming && streamContent.length > 0 && (
						<p className='text-gray-400 text-sm text-center'>
							Stream completed • {streamContent.length} chunks received
						</p>
					)}

					{receipt?.transaction && (
						<div className='bg-purple-500/10 border border-purple-500/20 rounded-lg p-4 mt-4'>
							<p className='text-purple-400 font-semibold mb-2'>Transaction Receipt</p>
							<div className='space-y-2 text-sm'>
								<div className='flex justify-between items-start'>
									<span className='text-gray-400'>TX Hash:</span>
									<a
										target='_blank'
										href={getTxScanUrl(chainId?.toString(), receipt?.transaction)}
										className='text-blue-500 underline font-mono text-xs break-all text-right ml-4'
									>
										{truncateTxHash(receipt.transaction)}
									</a>
								</div>
								{receipt.network && (
									<div className='flex justify-between'>
										<span className='text-gray-400'>Network:</span>
										<span className='text-white'>
											{formatNetworkName(receipt.network)}
										</span>
									</div>
								)}
							</div>
						</div>
					)}
				</div>
			)}

			<div className='bg-linear-to-br from-yellow-500/10 to-orange-500/10 rounded-xl p-6 border border-yellow-500/20'>
				<h3 className='text-white font-semibold mb-3'>About Streaming</h3>
				<p className='text-gray-300 text-sm leading-relaxed'>
					This demo showcases real-time data streaming using the ReadableStream API.
					The server sends data chunks progressively, which are displayed as they
					arrive. There are no live stream data here, this is just random
					experiments, moreso, a better x402 can be used later on, x402 growing fast!
				</p>
			</div>
		</div>
	);
}
