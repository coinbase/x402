"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { X402Logo } from "./Logo";

function CloseIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M6 6L18 18M6 18L18 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function NavBar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <nav className="w-full bg-white" role="navigation" aria-label="Main navigation">
      <div className="max-w-container mx-auto px-4 sm:px-6 py-3">
        <div className="flex items-center justify-between gap-4 sm:gap-8">
          {/* Mobile: Hamburger button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-1 -ml-1 text-black hover:bg-gray-10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
            aria-expanded={mobileMenuOpen}
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          >
            {mobileMenuOpen ? (
              <CloseIcon />
            ) : (
              <Image
                src="/images/hamburger.svg"
                alt=""
                width={24}
                height={24}
                aria-hidden="true"
              />
            )}
          </button>

          {/* Desktop: Left side navigation - flattened */}
          <div className="hidden lg:flex flex-1 items-center gap-6 justify-start">
            <Link
              href="/ecosystem"
              className="text-sm font-medium text-black hover:text-gray-600 transition-colors"
            >
              Ecosystem
            </Link>
            <Link
              href="/writing/x402-v2-launch"
              className="text-sm font-medium text-black hover:text-gray-600 transition-colors"
            >
              Writing
            </Link>
            <Link
              href="https://www.x402.org/x402-whitepaper.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-black hover:text-gray-600 transition-colors"
            >
              Whitepaper
            </Link>
          </div>

          {/* Center logo (home link) */}
          <div className="flex flex-1 lg:flex-none justify-center">
            <Link href="/" aria-label="x402 home" className="inline-flex items-center">
              <X402Logo className="h-7 w-auto" />
            </Link>
          </div>

          {/* Desktop: Right side actions */}
          <div className="hidden lg:flex flex-1 items-center gap-6 justify-end">
            {/* Docs button */}
            <Link
              href="https://x402.gitbook.io/x402"
              className="flex items-center gap-1 px-4 py-2 border border-black text-black font-medium text-sm hover:bg-gray-10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
              target="_blank"
              rel="noopener noreferrer"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path
                  d="M4.76172 3.1001L15.2207 3.10107L16.915 4.79639L16.916 16.9019H15.2383L15.2373 16.8999H4.7793L3.08398 15.2056V3.09814H4.7627L4.76172 3.1001ZM4.7627 14.5093L5.47461 15.2212H15.2373L15.2383 5.4917L14.5254 4.77881H4.76172L4.7627 14.5093Z"
                  fill="currentColor"
                />
                <path
                  d="M13.8297 6.55029C13.9402 6.55029 14.0297 6.63984 14.0297 6.75029V7.73018C14.0297 7.84063 13.9402 7.93018 13.8297 7.93018H6.17021C6.05976 7.93018 5.97021 7.84063 5.97021 7.73018V6.75029C5.97021 6.63984 6.05976 6.55029 6.17021 6.55029H13.8297Z"
                  fill="currentColor"
                />
                <path
                  d="M13.8297 9.31006C13.9402 9.31006 14.0297 9.3996 14.0297 9.51006V10.4899C14.0297 10.6004 13.9402 10.6899 13.8297 10.6899H6.17021C6.05976 10.6899 5.97021 10.6004 5.97021 10.4899V9.51006C5.97021 9.3996 6.05976 9.31006 6.17021 9.31006H13.8297Z"
                  fill="currentColor"
                />
                <path
                  d="M13.8297 12.0698C13.9402 12.0698 14.0297 12.1594 14.0297 12.2698V13.2497C14.0297 13.3602 13.9402 13.4497 13.8297 13.4497H6.17021C6.05976 13.4497 5.97021 13.3602 5.97021 13.2497V12.2698C5.97021 12.1594 6.05976 12.0698 6.17021 12.0698H13.8297Z"
                  fill="currentColor"
                />
              </svg>
              <span>Docs</span>
            </Link>

            {/* Build with us button */}
            <Link
              href="https://docs.google.com/forms/d/e/1FAIpQLSc2rlaeH31rZpJ_RFNL7egxi9fYTEUjW9r2kwkhd2pMae2dog/viewform"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-4 py-2 bg-black text-white font-medium text-sm hover:bg-gray-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path
                  d="M10.1772 14.2772L14.027 10.4274L14.027 9.57257L10.1772 5.72285L11.1851 4.71495L15.4524 8.98217L15.4524 11.0178L11.1851 15.285L10.1772 14.2772Z"
                  fill="currentColor"
                />
                <path
                  d="M4.54761 9.45635C4.54761 9.369 4.64796 9.2982 4.77174 9.2982H14.0704C14.1941 9.2982 14.2945 9.369 14.2945 9.45635V10.5633C14.2945 10.6507 14.1941 10.7215 14.0704 10.7215H4.77174C4.64796 10.7215 4.54761 10.6507 4.54761 10.5633V9.45635Z"
                  fill="currentColor"
                />
              </svg>
              <span>Contact</span>
            </Link>
          </div>

          {/* Mobile: Spacer to balance hamburger */}
          <div className="lg:hidden w-6" aria-hidden="true" />
        </div>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-gray-10 bg-white">
          <div className="px-4 py-4 space-y-4">
            {/* Navigation links */}
            <div className="space-y-1">
              <Link
                href="/ecosystem"
                className="block py-2 text-black font-medium text-sm hover:text-gray-60 transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                Ecosystem
              </Link>
              <Link
                href="/writing/x402-v2-launch"
                className="block py-2 text-black font-medium text-sm hover:text-gray-60 transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                Writing
              </Link>
              <Link
                href="https://www.x402.org/x402-whitepaper.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="block py-2 text-black font-medium text-sm hover:text-gray-60 transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                Whitepaper
              </Link>
            </div>

            {/* Divider */}
            <div className="border-t border-gray-10" />

            {/* CTA buttons */}
            <div className="space-y-3 pt-2">
              <Link
                href="https://x402.gitbook.io/x402"
                className="flex items-center justify-center gap-2 w-full px-4 py-3 border border-black text-black font-medium text-sm hover:bg-gray-10 transition-colors"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMobileMenuOpen(false)}
              >
                Docs
              </Link>
              <Link
                href="https://docs.google.com/forms/d/e/1FAIpQLSc2rlaeH31rZpJ_RFNL7egxi9fYTEUjW9r2kwkhd2pMae2dog/viewform"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-black text-white font-medium text-sm hover:bg-gray-800 transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                Contact
              </Link>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
