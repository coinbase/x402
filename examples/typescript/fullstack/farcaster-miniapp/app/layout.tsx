import '@coinbase/onchainkit/styles.css';
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { Toaster } from 'react-hot-toast';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Example Mini App',
  description: 'A generic mini app example for demonstration purposes.',
  keywords: ['mini app', 'example', 'demonstration', 'web3'],
  authors: [{ name: 'Example Team' }],
  
  // Open Graph metadata for social sharing and embeds
  openGraph: {
    title: 'Example Mini App',
    description: 'A generic mini app example for demonstration purposes.',
    type: 'website',
    url: 'https://example.com/',
    siteName: 'Example App',
    images: [
      {
        url: '/app-logo.png',
        width: 1200,
        height: 630,
        alt: 'Example Mini App',
      },
    ],
  },
  
  // Twitter Card metadata
  twitter: {
    card: 'summary_large_image',
    title: 'Example Mini App',
    description: 'A generic mini app example for demonstration purposes.',
    images: ['/app-logo.png'],
  },
  
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Example App',
  },
  formatDetection: {
    telephone: false,
  },
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0f172a' },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="h-full">
      <head>
        {/* Additional meta tags for mini app embedding */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Example App" />
        
        {/* Prevent zooming and ensure proper scaling in mini apps */}
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
        
        {/* Farcaster Mini App Embed - Required for Mini App discovery */}
        <meta name="fc:frame" content='{"version":"next","imageUrl":"https://example.com/app-logo.png","button":{"title":"🚀 Example App","action":{"type":"launch_frame","name":"Example Mini App","url":"https://example.com/","splashImageUrl":"https://example.com/app-logo-200x200.png","splashBackgroundColor":"#3b82f6"}}}' />
        
        {/* Favicon and app icons */}
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />
        <link rel="icon" type="image/png" sizes="512x512" href="/icon-512.png" />
        <link rel="manifest" href="/manifest.json" />
        
        {/* Preconnect to external domains for better performance */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://auth.farcaster.xyz" />
      </head>
      <body className={`${inter.className} h-full antialiased`}>
        <Providers>
          {children}
          <Toaster 
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: '#363636',
                color: '#fff',
              },
              success: {
                duration: 5000,
                iconTheme: {
                  primary: '#10b981',
                  secondary: '#fff',
                },
              },
            }}
          />
        </Providers>
      </body>
    </html>
  );
}
