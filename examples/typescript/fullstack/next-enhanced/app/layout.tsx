import { X402Provider, ConnectButton } from 'x402-react-client';
import { Toaster } from 'sonner';
import './globals.css';

export const metadata = {
	title: 'x402 Payment Demo',
	description: 'Test different x402 payment endpoints',
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html lang='en'>
			<body className='bg-linear-to-br from-slate-900 via-purple-900 to-slate-900 min-h-screen'>
				<X402Provider
					config={{
						appName: 'x402 Demo App',
						mode: 'rainbowkit',
						walletConnectProjectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID,
					}}
				>
					<div className='min-h-screen'>
						<nav className='border-b border-white/10 bg-black/20 backdrop-blur-lg sticky top-0 z-50'>
							<div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'>
								<div className='flex justify-between items-center h-16'>
									<div className='flex items-center space-x-3'>
										<div className='w-10 h-10 bg-linear-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center'>
											<span className='text-white font-bold text-xl'>x4</span>
										</div>
										<div className='md:block hidden'>
											<h1 className='text-xl font-bold text-white'>x402 Demo</h1>
											<p className='text-xs text-gray-400'>Micropayment Testing</p>
										</div>
									</div>
									<ConnectButton />
								</div>
							</div>
						</nav>

						<main className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8'>
							{children}
						</main>

						<footer className='border-t border-white/10 mt-16'>
							<div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6'>
								<p className='text-center text-sm text-gray-400'>
									Powered by x402 Protocol •{' '}
									<a
										target='_blank'
										className='underline text-blue-400'
										href='https://x.com/_Johnex'
									>
										Find out who carried out the experiment
									</a>
								</p>
							</div>
						</footer>
					</div>
				</X402Provider>
				<Toaster />
			</body>
		</html>
	);
}
