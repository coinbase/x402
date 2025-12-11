"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "motion/react";
import { CodeSnippet } from "./CodeSnippet";
import { HeroIllustration } from "./HeroIllustration";
import { X402Logo } from "./Logo";
import { textStagger, fadeInUp, fadeInFromRight } from "@/lib/animations";

function ArrowIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M10.1773 14.2771L14.027 10.4274L14.027 9.57256L10.1773 5.72284L11.1852 4.71494L15.4524 8.98216L15.4524 11.0178L11.1852 15.285L10.1773 14.2771Z"
        fill="currentColor"
      />
      <path
        d="M4.54758 9.45634C4.54758 9.36899 4.64792 9.29819 4.77171 9.29819H14.0703C14.1941 9.29819 14.2945 9.36899 14.2945 9.45633V10.5633C14.2945 10.6507 14.1941 10.7215 14.0703 10.7215H4.77171C4.64792 10.7215 4.54758 10.6507 4.54758 10.5633V9.45634Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function HeroSection() {
  const codeSnippet = `const fetchWithPayment = wrapFetchWithPayment(fetch, registerExactEvmScheme(new x402Client(), { signer: evmAccount }));
const response = fetchWithPayment(url)`

  return (
    <section className="max-w-container mx-auto px-4 sm:px-6 md:px-10 pt-4 md:pt-6 pb-12 sm:pb-16 md:pb-20">
      <div className="flex flex-col lg:flex-row gap-8 md:gap-12 lg:gap-16 items-start lg:items-center">
        {/* Animated left column */}
        <motion.div
          className="flex-1 flex flex-col gap-6"
          variants={textStagger}
          initial="initial"
          animate="animate"
        >
          <motion.div variants={fadeInUp} className="flex items-baseline gap-4">
            <X402Logo className="h-[49px] w-auto" />
            <span className="text-base font-medium">Payment Required</span>
          </motion.div>

          <motion.p variants={fadeInUp} className="text-base sm:text-lg font-medium leading-relaxed">
            x402 is the internet&apos;s payment standard. It absolves the{" "}
              original sin of the internet
            —ads—creating win-win economies that empower agentic payments at scale. The x402 Foundation exists to build a more free and fair internet.
          </motion.p>

          <motion.div variants={fadeInUp} className="max-w-[663px]">
            <CodeSnippet
              title="Accept payments with a single line of code"
              code={codeSnippet}
              description="That's it. Add one line of code to require payment for each incoming request. If a request arrives without payment, the server responds with HTTP 402, prompting the client to pay and retry."
            />
          </motion.div>
        </motion.div>

        {/* Animated right column */}
        <motion.div
          className="relative hidden lg:block flex-shrink-0"
          variants={fadeInFromRight}
          initial="initial"
          animate="animate"
        >
          <HeroIllustration />
          <Image
            src="/images/hero_code_to_phone.svg"
            alt=""
            width={380}
            height={79}
            priority
            aria-hidden="true"
            className="absolute -left-[64px] top-[60%] -translate-y-1/2 pointer-events-none select-none"
          />
        </motion.div>
      </div>
    </section>
  );
}
