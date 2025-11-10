'use client';

import Link from 'next/link';
import { useX402Balance } from 'x402-react-client';
import { Sparkles, Quote, FileText, Download, Radio } from 'lucide-react';

const demos = [
	{
		href: '/random',
		title: 'Random Number',
		description: 'Generate a cryptographically secure random number',
		price: '$0.01',
		icon: Sparkles,
		color: 'from-blue-500 to-cyan-500',
	},
	{
		href: '/quote',
		title: 'Inspirational Quote',
		description: 'Get a motivational quote with author attribution',
		price: '$0.05',
		icon: Quote,
		color: 'from-purple-500 to-pink-500',
	},
	{
		href: '/generate',
		title: 'AI Content',
		description: 'Generate custom content with AI (POST request)',
		price: '$0.10',
		icon: FileText,
		color: 'from-green-500 to-emerald-500',
	},
	{
		href: '/download',
		title: 'File Download',
		description: 'Download premium content as a file (blob)',
		price: '$0.25',
		icon: Download,
		color: 'from-orange-500 to-red-500',
	},
	{
		href: '/stream',
		title: 'Live Stream',
		description: 'Real-time streaming data with ReadableStream',
		price: '$0.15',
		icon: Radio,
		color: 'from-yellow-500 to-orange-500',
	},
];

export default function HomePage() {
	const { formatted, isLoading, refresh } = useX402Balance();

	return (
		<div className='space-y-8'>
			<div className='text-center space-y-4'>
				<h1 className='text-5xl font-bold text-white'>x402 Payment Protocol</h1>
				<p className='text-xl text-gray-300 max-w-2xl mx-auto'>
					Test instant micropayments with zero gas fees. Each demo showcases a
					different response type.
				</p>

				<div className='inline-flex items-center space-x-4 bg-white/10 backdrop-blur-lg rounded-full px-6 py-3 border border-white/20'>
					<span className='text-gray-300'>Your Balance:</span>
					{isLoading ? (
						<div className='w-20 h-6 bg-white/20 animate-pulse rounded'></div>
					) : (
						<span className='text-2xl font-bold text-white'>{formatted}</span>
					)}
					<button
						onClick={refresh}
						className='text-purple-400 hover:text-purple-300 transition-colors text-sm'
					>
						Refresh
					</button>
				</div>
			</div>

			<div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-12'>
				{demos.map((demo) => {
					const Icon = demo.icon;
					return (
						<Link
							key={demo.href}
							href={demo.href}
							className='group relative bg-white/5 backdrop-blur-lg rounded-2xl p-6 border border-white/10 hover:border-white/20 transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-purple-500/20'
						>
							<div
								className={`absolute inset-0 bg-linear-to-br ${demo.color} opacity-0 group-hover:opacity-10 rounded-2xl transition-opacity duration-300`}
							></div>

							<div className='relative z-10 space-y-4'>
								<div
									className={`w-12 h-12 bg-linear-to-br ${demo.color} rounded-xl flex items-center justify-center`}
								>
									<Icon className='w-6 h-6 text-white' />
								</div>

								<div className='flex items-start justify-between'>
									<h3 className='text-xl font-bold text-white'>{demo.title}</h3>
									<span className='text-sm font-semibold text-purple-400 bg-purple-500/20 px-3 py-1 rounded-full'>
										{demo.price}
									</span>
								</div>

								<p className='text-gray-400 text-sm leading-relaxed'>
									{demo.description}
								</p>

								<div className='flex items-center text-purple-400 group-hover:text-purple-300 transition-colors'>
									<span className='text-sm font-medium'>Try it now</span>
									<svg
										className='w-4 h-4 ml-2 transform group-hover:translate-x-1 transition-transform'
										fill='none'
										viewBox='0 0 24 24'
										stroke='currentColor'
									>
										<path
											strokeLinecap='round'
											strokeLinejoin='round'
											strokeWidth={2}
											d='M9 5l7 7-7 7'
										/>
									</svg>
								</div>
							</div>
						</Link>
					);
				})}
			</div>

			<div className='mt-16 bg-white/5 backdrop-blur-lg rounded-2xl p-8 border border-white/10'>
				<h2 className='text-2xl font-bold text-white mb-4'>How It Works</h2>
				<div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
					<div className='space-y-2'>
						<div className='w-8 h-8 bg-purple-500/20 text-purple-400 rounded-lg flex items-center justify-center font-bold'>
							1
						</div>
						<h3 className='text-white font-semibold'>Connect Wallet</h3>
						<p className='text-gray-400 text-sm'>
							Connect your wallet using the button in the top right corner
						</p>
					</div>
					<div className='space-y-2'>
						<div className='w-8 h-8 bg-purple-500/20 text-purple-400 rounded-lg flex items-center justify-center font-bold'>
							2
						</div>
						<h3 className='text-white font-semibold'>Choose a Demo</h3>
						<p className='text-gray-400 text-sm'>
							Click on any card above to test different payment scenarios
						</p>
					</div>
					<div className='space-y-2'>
						<div className='w-8 h-8 bg-purple-500/20 text-purple-400 rounded-lg flex items-center justify-center font-bold'>
							3
						</div>
						<h3 className='text-white font-semibold'>Sign & Pay</h3>
						<p className='text-gray-400 text-sm'>
							Sign a message (no gas fees!) to complete instant payment
						</p>
					</div>
				</div>
			</div>
		</div>
	);
}
