import type { Metadata, Viewport } from "next";
import { Inter, DM_Mono, Inconsolata, Instrument_Serif } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

const dmMono = DM_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono",
});

const inconsolata = Inconsolata({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-code-ui",
});

const instrumentSerif = Instrument_Serif({
  weight: ["400"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "x402 - Payment Required | Internet-Native Payments Standard",
  description:
    "x402 is the internet's payment standard. An open standard for internet-native payments that empowers agentic payments at scale. Build a more free and fair internet.",
  openGraph: {
    title: "x402 - Payment Required",
    description: "x402 is the internet's payment standard for agentic payments at scale.",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${dmMono.variable} ${instrumentSerif.variable} ${inconsolata.variable}`}
    >
      <head>
        <link rel="icon" type="image/svg+xml" href="/images/icons/x_group8.svg" />
        <link rel="apple-touch-icon" href="/images/icons/x_group8.png" />
        <meta name="apple-mobile-web-app-title" content="x402" />
        <link rel="manifest" href="/site.webmanifest" />
      </head>
      <body className="antialiased bg-background text-foreground font-sans">
        <a href="#main-content" className="skip-to-content">
          Skip to main content
        </a>
        <main id="main-content">{children}</main>
      </body>
    </html>
  );
}
