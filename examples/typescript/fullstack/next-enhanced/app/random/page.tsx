'use client';

import { useX402Payment, useChainId } from 'x402-react-client';
import { Sparkles, ArrowLeft, Check, X } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { formatNetworkName, getTxScanUrl, truncateTxHash } from '@/utils';

export default function RandomNumberPage() {
	const chainId = useChainId();

	const { pay, isPending, data, receipt, error } = useX402Payment({
		onSuccess: (data: any) => {
			toast.success(`Random number received: ${data?.data?.number}`);
		},
		onError: (error) => {
			toast.error(`An error occured, message: ${error?.message}`);
		},
	});

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
					<div className='w-16 h-16 bg-linear-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center shrink-0'>
						<Sparkles className='w-8 h-8 text-white' />
					</div>
					<div className='flex-1'>
						<h1 className='text-3xl font-bold text-white mb-2'>
							Random Number Generator
						</h1>
						<p className='text-gray-400'>
							Generate a cryptographically secure random number with instant
							micropayment
						</p>
						<div className='mt-4 inline-flex items-center space-x-2 text-sm'>
							<span className='text-gray-400'>Price:</span>
							<span className='font-semibold text-blue-400 bg-blue-500/20 px-3 py-1 rounded-full'>
								$0.01
							</span>
						</div>
					</div>
				</div>
			</div>

			<div className='bg-white/5 backdrop-blur-lg rounded-2xl p-8 border border-white/10'>
				<button
					onClick={() => pay('/api/random')}
					disabled={isPending}
					className='w-full bg-linear-to-r from-blue-500 to-cyan-500 text-white font-semibold py-4 px-6 rounded-xl hover:from-blue-600 hover:to-cyan-600 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2'
				>
					{isPending ? (
						<>
							<div className='w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin'></div>
							<span>Processing Payment...</span>
						</>
					) : (
						<>
							<Sparkles className='w-5 h-5' />
							<span>Generate Random Number</span>
						</>
					)}
				</button>

				{error && (
					<div className='mt-4 bg-red-500/10 border border-red-500/20 rounded-lg p-4 flex items-start space-x-3'>
						<X className='w-5 h-5 text-red-400 shrink-0 mt-0.5' />
						<div>
							<p className='text-red-400 font-semibold'>Payment Failed</p>
							<p className='text-red-300 text-sm mt-1'>{error.message}</p>
						</div>
					</div>
				)}
			</div>

			{data && (
				<div className='bg-white/5 backdrop-blur-lg rounded-2xl p-8 border border-white/10 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500'>
					<div className='flex items-center space-x-2 text-green-400'>
						<Check className='w-5 h-5' />
						<h2 className='text-xl font-semibold'>Success!</h2>
					</div>

					<div className='bg-linear-to-br from-blue-500/20 to-cyan-500/20 rounded-xl p-8 text-center border border-blue-500/30'>
						<p className='text-gray-400 text-sm mb-2'>Your Random Number</p>
						<p className='text-6xl font-bold text-white tracking-wider'>
							{data?.data?.number}
						</p>
						<p className='text-gray-400 text-sm mt-2'>Range: {data?.data?.range}</p>
					</div>

					<div className='grid grid-cols-2 gap-4'>
						<div className='bg-white/5 rounded-lg p-4'>
							<p className='text-gray-400 text-sm mb-1'>Method</p>
							<p className='text-white font-mono text-sm'>{data?.data?.method}</p>
						</div>
						<div className='bg-white/5 rounded-lg p-4'>
							<p className='text-gray-400 text-sm mb-1'>Timestamp</p>
							<p className='text-white font-mono text-sm'>
								{new Date(data?.data?.timestamp).toLocaleTimeString()}
							</p>
						</div>
					</div>

					{receipt?.transaction && (
						<div className='bg-purple-500/10 border border-purple-500/20 rounded-lg p-4'>
							<p className='text-purple-400 font-semibold mb-2'>Transaction Receipt</p>
							<div className='space-y-2 text-sm'>
								<div className='flex justify-between'>
									<span className='text-gray-400'>TX Hash:</span>
									<a
										target='_blank'
										href={getTxScanUrl(chainId?.toString(), receipt?.transaction)}
										className='text-blue-500 underline font-mono text-xs'
									>
										{truncateTxHash(receipt.transaction)}
									</a>
								</div>
								{receipt?.network && (
									<div className='flex justify-between'>
										<span className='text-gray-400'>Network:</span>
										<span className='text-white'>
											{formatNetworkName(receipt?.network)}
										</span>
									</div>
								)}
							</div>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
