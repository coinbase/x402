import "./theme.css";
import "@coinbase/onchainkit/styles.css";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "x402 Mini App Template",
  description:
    "A clean template with x402, OnchainKit, and Farcaster as a mini app.",
  keywords: ["mini app", "x402", "onchainkit", "farcaster", "web3"],
  authors: [{ name: "Example Team" }],

  // Open Graph metadata for social sharing and embeds
  openGraph: {
    title: "x402 Mini App Template",
    description:
      "A clean template with x402, OnchainKit, and Farcaster as a mini app.",
    type: "website",
    url: process.env.NEXT_PUBLIC_URL || "https://example.com/",
    siteName: "x402 Mini App",
    images: [
      {
        url: process.env.NEXT_PUBLIC_APP_HERO_IMAGE || "/app-logo.png",
        width: 1200,
        height: 630,
        alt: "x402 Mini App Template",
      },
    ],
  },

  // Twitter Card metadata
  twitter: {
    card: "summary_large_image",
    title: "x402 Mini App Template",
    description:
      "A clean template with x402, OnchainKit, and Farcaster as a mini app.",
    images: [process.env.NEXT_PUBLIC_APP_HERO_IMAGE || "/app-logo.png"],
  },

  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: process.env.NEXT_PUBLIC_ONCHAINKIT_PROJECT_NAME || "x402 Mini App",
  },
  formatDetection: {
    telephone: false,
  },
  robots: {
    index: false,
    follow: false,
  },

  // Farcaster Frame metadata
  other: {
    "fc:frame": JSON.stringify({
      version: "next",
      imageUrl: process.env.NEXT_PUBLIC_APP_HERO_IMAGE,
      button: {
        title: `Launch ${process.env.NEXT_PUBLIC_ONCHAINKIT_PROJECT_NAME || "x402 Mini App"}`,
        action: {
          type: "launch_frame",
          name:
            process.env.NEXT_PUBLIC_ONCHAINKIT_PROJECT_NAME || "x402 Mini App",
          url: process.env.NEXT_PUBLIC_URL,
          splashImageUrl: process.env.NEXT_PUBLIC_SPLASH_IMAGE,
          splashBackgroundColor:
            process.env.NEXT_PUBLIC_SPLASH_BACKGROUND_COLOR,
        },
      },
    }),
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <head>
        {/* Additional meta tags for mini app embedding */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta
          name="apple-mobile-web-app-title"
          content={
            process.env.NEXT_PUBLIC_ONCHAINKIT_PROJECT_NAME || "x402 Mini App"
          }
        />

        {/* Prevent zooming and ensure proper scaling in mini apps */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover"
        />

        {/* Favicon and app icons */}
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link
          rel="icon"
          type="image/png"
          sizes="192x192"
          href="/icon-192.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="512x512"
          href="/icon-512.png"
        />
        <link rel="manifest" href="/manifest.json" />

        {/* Preconnect to external domains for better performance */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link rel="preconnect" href="https://auth.farcaster.xyz" />
      </head>
      <body className={`${inter.className} h-full antialiased bg-background`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
