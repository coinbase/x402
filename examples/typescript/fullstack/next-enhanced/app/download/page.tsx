'use client';

import { useChainId, useX402Payment } from 'x402-react-client';
import { Download, ArrowLeft, Check, X, FileText } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { getTxScanUrl, truncateTxHash } from '@/utils';

export default function DownloadPage() {
	const chainId = useChainId();
	const { pay, isPending, receipt, error } = useX402Payment({
		responseType: 'blob',
		onSuccess: (blob, receipt) => {
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = 'x402-premium-content.txt';
			a.click();
			URL.revokeObjectURL(url);

			toast.success('Download complete!');
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
					<div className='w-16 h-16 bg-linear-to-br from-orange-500 to-red-500 rounded-xl flex items-center justify-center shrink-0'>
						<Download className='w-8 h-8 text-white' />
					</div>
					<div className='flex-1'>
						<h1 className='text-3xl font-bold text-white mb-2'>File Download</h1>
						<p className='text-gray-400'>
							Purchase and download premium content as a file (blob response type)
						</p>
						<div className='mt-4 inline-flex items-center space-x-2 text-sm'>
							<span className='text-gray-400'>Price:</span>
							<span className='font-semibold text-orange-400 bg-orange-500/20 px-3 py-1 rounded-full'>
								$0.25
							</span>
						</div>
					</div>
				</div>
			</div>

			<div className='bg-white/5 backdrop-blur-lg rounded-2xl p-8 border border-white/10 space-y-6'>
				<div className='bg-linear-to-br from-orange-500/20 to-red-500/20 rounded-xl p-6 border border-orange-500/30'>
					<div className='flex items-start space-x-4'>
						<FileText className='w-12 h-12 text-orange-400 shrink-0' />
						<div>
							<h3 className='text-white font-semibold text-lg mb-2'>
								Premium Content Package
							</h3>
							<p className='text-gray-300 text-sm mb-4'>
								This download includes exclusive content with transaction details and
								proof of purchase.
							</p>
							<ul className='space-y-2 text-sm text-gray-300'>
								<li className='flex items-center space-x-2'>
									<Check className='w-4 h-4 text-green-400' />
									<span>Instant download after payment</span>
								</li>
								<li className='flex items-center space-x-2'>
									<Check className='w-4 h-4 text-green-400' />
									<span>Blockchain-verified purchase</span>
								</li>
								<li className='flex items-center space-x-2'>
									<Check className='w-4 h-4 text-green-400' />
									<span>Permanent access to content</span>
								</li>
								<li className='flex items-center space-x-2'>
									<Check className='w-4 h-4 text-green-400' />
									<span>Transaction receipt included</span>
								</li>
							</ul>
						</div>
					</div>
				</div>

				<button
					onClick={() => pay('/api/download')}
					disabled={isPending}
					className='w-full bg-linear-to-r from-orange-500 to-red-500 text-white font-semibold py-4 px-6 rounded-xl hover:from-orange-600 hover:to-red-600 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2'
				>
					{isPending ? (
						<>
							<div className='w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin'></div>
							<span>Processing...</span>
						</>
					) : (
						<>
							<Download className='w-5 h-5' />
							<span>Purchase & Download</span>
						</>
					)}
				</button>

				{error && (
					<div className='bg-red-500/10 border border-red-500/20 rounded-lg p-4 flex items-start space-x-3'>
						<X className='w-5 h-5 text-red-400 shrink-0 mt-0.5' />
						<div>
							<p className='text-red-400 font-semibold'>Download Failed</p>
							<p className='text-red-300 text-sm mt-1'>{error.message}</p>
						</div>
					</div>
				)}
			</div>

			{receipt?.transaction && (
				<div className='bg-white/5 backdrop-blur-lg rounded-2xl p-8 border border-white/10 space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500'>
					<div className='flex items-center space-x-2 text-green-400'>
						<Check className='w-5 h-5' />
						<h2 className='text-xl font-semibold'>Download Complete!</h2>
					</div>

					<p className='text-gray-300'>
						Your file has been downloaded successfully. Check your downloads folder
						for
						<span className='text-white font-mono'> x402-premium-content.txt</span>
					</p>

					<div className='bg-purple-500/10 border border-purple-500/20 rounded-lg p-4'>
						<p className='text-purple-400 font-semibold mb-3'>Transaction Receipt</p>
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
									<span className='text-white'>{receipt.network}</span>
								</div>
							)}
							{receipt.payer && (
								<div className='flex justify-between items-start'>
									<span className='text-gray-400'>Payer:</span>
									<span className='text-white font-mono text-xs break-all text-right ml-4'>
										{receipt?.payer}
									</span>
								</div>
							)}
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
