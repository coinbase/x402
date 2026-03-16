import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "x402-observed Next.js Example",
  description: "Example Next.js app with x402-observed payment observability",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  );
}
