"use client";

import { motion } from "motion/react";
import { textStagger, fadeInUp } from "@/lib/animations";

interface AnimatedSectionHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  align?: "left" | "center";
  className?: string;
  maxDescriptionWidth?: string;
  viewportOnce?: boolean;
}

export function AnimatedSectionHeader({
  title,
  description,
  align = "center",
  className,
  maxDescriptionWidth,
  viewportOnce = true,
}: AnimatedSectionHeaderProps) {
  const alignment = align === "center" ? "items-center text-center" : "items-start text-left";

  return (
    <motion.div
      className={`flex flex-col gap-2 ${alignment} ${className ?? ""}`}
      variants={textStagger}
      initial="initial"
      whileInView="animate"
      viewport={{ once: viewportOnce, margin: "-80px" }}
    >
      <motion.h2 variants={fadeInUp} className="text-5xl font-display tracking-tighter">
        {title}
      </motion.h2>
      {description ? (
        <motion.p
          variants={fadeInUp}
          className="text-base font-medium text-gray-70"
          style={maxDescriptionWidth ? { maxWidth: maxDescriptionWidth } : undefined}
        >
          {description}
        </motion.p>
      ) : null}
    </motion.div>
  );
}