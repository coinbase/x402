"use client";

import { motion } from "motion/react";
import { CodeSnippet } from "./CodeSnippet";
import { HeroIllustration } from "./HeroIllustration";
import { X402Logo } from "./Logo";
import { textStagger, fadeInUp, fadeInFromRight } from "@/lib/animations";

interface HeroSectionProps {
  codeSnippet: {
    code: string;
    title: string;
    description: string;
  };
}

export function HeroSection({ codeSnippet }: HeroSectionProps) {
  return (
    <section className="max-w-container mx-auto px-4 sm:px-6 md:px-10 pt-8 md:pt-10 pb-12 sm:pb-16 md:pb-20 overflow-x-clip">
      <div className="flex flex-col lg:flex-row gap-8 md:gap-12 lg:gap-8 items-start lg:items-center">
        {/* Animated left column */}
        <motion.div
          className="flex-1 flex flex-col gap-4"
          variants={textStagger}
          initial="initial"
          animate="animate"
        >
          <motion.div variants={fadeInUp} className="flex items-baseline gap-4">
            <X402Logo className="h-[49px] w-auto" />
            <span className="text-base font-medium">Payment Required</span>
          </motion.div>

          <motion.p
            variants={fadeInUp}
            className="text-base sm:text-lg font-medium leading-relaxed max-w-[600px]"
          >
            x402 is an open, neutral standard for internet-native payments. It absolves the
            Internet's original sin by natively making payments possible between clients and
            servers, creating win-win economies that empower agentic payments at scale. x402 exists
            to build a more free and fair internet.
          </motion.p>

          <motion.div variants={fadeInUp} className="w-full max-w-[1040px] mt-4">
            <CodeSnippet
              title={codeSnippet.title}
              code={codeSnippet.code}
              description={codeSnippet.description}
            />
          </motion.div>
        </motion.div>

        {/* Animated right column - only show at xl (1280px+) where there's room */}
        <motion.div
          className="relative hidden xl:block flex-shrink-0 xl:w-[720px]"
          variants={fadeInFromRight}
          initial="initial"
          animate="animate"
        >
          <HeroIllustration />
        </motion.div>
      </div>
    </section>
  );
}
