'use client';

import { useState } from 'react';
import { useChainId, useX402Payment } from 'x402-react-client';
import { FileText, ArrowLeft, Check, X } from 'lucide-react';
import Link from 'next/link';
import { getTxScanUrl, truncateTxHash } from '@/utils';

export default function GeneratePage() {
	const [prompt, setPrompt] = useState('');
	const [style, setStyle] = useState('default');

	const { pay, isPending, data, receipt, error } = useX402Payment();
	const chainId = useChainId();

	const handleGenerate = async () => {
		if (!prompt.trim()) return;

		await pay('/api/generate', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ prompt, style }),
		});
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
					<div className='w-16 h-16 bg-linear-to-br from-green-500 to-emerald-500 rounded-xl flex items-center justify-center shrink-0'>
						<FileText className='w-8 h-8 text-white' />
					</div>
					<div className='flex-1'>
						<h1 className='text-3xl font-bold text-white mb-2'>
							AI Content Generator
						</h1>
						<p className='text-gray-400'>
							Generate custom content using AI with POST request and JSON body
						</p>
						<div className='mt-4 inline-flex items-center space-x-2 text-sm'>
							<span className='text-gray-400'>Price:</span>
							<span className='font-semibold text-green-400 bg-green-500/20 px-3 py-1 rounded-full'>
								$0.10
							</span>
						</div>
					</div>
				</div>
			</div>

			<div className='bg-white/5 backdrop-blur-lg rounded-2xl p-8 border border-white/10 space-y-6'>
				<div className='space-y-4'>
					<div>
						<label className='block text-gray-300 font-medium mb-2'>
							Your Prompt
						</label>
						<textarea
							value={prompt}
							onChange={(e) => setPrompt(e.target.value)}
							placeholder='e.g., Write a short story about a robot learning to paint...'
							className='w-full bg-white/5 border border-white/10 rounded-lg p-4 text-white placeholder-gray-500 focus:border-green-500/50 focus:outline-none focus:ring-2 focus:ring-green-500/20 min-h-[120px] resize-none'
						/>
					</div>

					<div>
						<label className='block text-gray-300 font-medium mb-2'>Style</label>
						<select
							value={style}
							onChange={(e) => setStyle(e.target.value)}
							className='w-full bg-white/5 border border-white/10 rounded-lg p-4 text-white focus:border-green-500/50 focus:outline-none focus:ring-2 focus:ring-green-500/20'
						>
							<option value='default'>Default</option>
							<option value='creative'>Creative</option>
							<option value='professional'>Professional</option>
							<option value='casual'>Casual</option>
							<option value='technical'>Technical</option>
						</select>
					</div>
				</div>

				<button
					onClick={handleGenerate}
					disabled={isPending || !prompt.trim()}
					className='w-full bg-linear-to-r from-green-500 to-emerald-500 text-white font-semibold py-4 px-6 rounded-xl hover:from-green-600 hover:to-emerald-600 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2'
				>
					{isPending ? (
						<>
							<div className='w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin'></div>
							<span>Generating...</span>
						</>
					) : (
						<>
							<FileText className='w-5 h-5' />
							<span>Generate Content</span>
						</>
					)}
				</button>

				{error && (
					<div className='bg-red-500/10 border border-red-500/20 rounded-lg p-4 flex items-start space-x-3'>
						<X className='w-5 h-5 text-red-400 shrink-0 mt-0.5' />
						<div>
							<p className='text-red-400 font-semibold'>Generation Failed</p>
							<p className='text-red-300 text-sm mt-1'>{error?.message}</p>
						</div>
					</div>
				)}
			</div>

			{data && (
				<div className='bg-white/5 backdrop-blur-lg rounded-2xl p-8 border border-white/10 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500'>
					<div className='flex items-center space-x-2 text-green-400'>
						<Check className='w-5 h-5' />
						<h2 className='text-xl font-semibold'>Generated Content</h2>
					</div>

					<div className='bg-linear-to-br from-green-500/20 to-emerald-500/20 rounded-xl p-6 border border-green-500/30'>
						<div className='mb-4 pb-4 border-b border-white/10'>
							<p className='text-gray-400 text-sm mb-1'>Prompt:</p>
							<p className='text-white italic'>"{data?.data?.prompt}"</p>
						</div>
						<p className='text-white whitespace-pre-wrap leading-relaxed'>
							{data.data.result}
						</p>
					</div>

					<div className='grid grid-cols-3 gap-4'>
						<div className='bg-white/5 rounded-lg p-4'>
							<p className='text-gray-400 text-sm mb-1'>Model</p>
							<p className='text-white font-mono text-sm'>
								{data?.data?.metadata?.model}
							</p>
						</div>
						<div className='bg-white/5 rounded-lg p-4'>
							<p className='text-gray-400 text-sm mb-1'>Tokens</p>
							<p className='text-white font-mono text-sm'>
								{data?.data?.metadata?.tokens}
							</p>
						</div>
						<div className='bg-white/5 rounded-lg p-4'>
							<p className='text-gray-400 text-sm mb-1'>Time</p>
							<p className='text-white font-mono text-sm'>
								{data?.data?.metadata?.processingTime}
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
										{truncateTxHash(receipt?.transaction)}
									</a>
								</div>
							</div>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
