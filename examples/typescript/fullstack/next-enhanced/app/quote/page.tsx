'use client';

import { useChainId, useX402Payment } from 'x402-react-client';
import { Quote, ArrowLeft, Check, X } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { formatNetworkName, getTxScanUrl, truncateTxHash } from '@/utils';

export default function QuotePage() {
	const chainId = useChainId();

	const { pay, isPending, data, receipt, error } = useX402Payment({
		onSuccess: (data: any) => {
			toast.success(`Random Quote recieved!`);
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
					<div className='w-16 h-16 bg-linear-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center shrink-0'>
						<Quote className='w-8 h-8 text-white' />
					</div>
					<div className='flex-1'>
						<h1 className='text-3xl font-bold text-white mb-2'>
							Inspirational Quote
						</h1>
						<p className='text-gray-400'>
							Get a random motivational quote with author attribution
						</p>
						<div className='mt-4 inline-flex items-center space-x-2 text-sm'>
							<span className='text-gray-400'>Price:</span>
							<span className='font-semibold text-purple-400 bg-purple-500/20 px-3 py-1 rounded-full'>
								$0.05
							</span>
						</div>
					</div>
				</div>
			</div>

			<div className='bg-white/5 backdrop-blur-lg rounded-2xl p-8 border border-white/10'>
				<button
					onClick={() => pay('/api/quote')}
					disabled={isPending}
					className='w-full bg-linear-to-r from-purple-500 to-pink-500 text-white font-semibold py-4 px-6 rounded-xl hover:from-purple-600 hover:to-pink-600 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2'
				>
					{isPending ? (
						<>
							<div className='w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin'></div>
							<span>Processing Payment...</span>
						</>
					) : (
						<>
							<Quote className='w-5 h-5' />
							<span>Get Inspirational Quote</span>
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
						<h2 className='text-xl font-semibold'>Your Quote</h2>
					</div>

					<div className='bg-linear-to-br from-purple-500/20 to-pink-500/20 rounded-xl p-8 border border-purple-500/30'>
						<Quote className='w-12 h-12 text-purple-400 mb-4 opacity-50' />
						<p className='text-2xl text-white leading-relaxed mb-6 italic'>
							"{data.data.text}"
						</p>
						<p className='text-purple-300 font-semibold text-right'>
							— {data?.data?.author}
						</p>
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
