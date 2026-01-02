"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useIntro } from "../contexts/IntroContext";
import { useReducedMotion } from "../hooks/useReducedMotion";

const INTRO_TIMEOUT_MS = 10000; // 10s fallback timeout
const FADE_OUT_DURATION = 0.5; // 500ms fade out

export function IntroAnimation() {
  const { shouldShowIntro, markIntroComplete } = useIntro();
  const prefersReducedMotion = useReducedMotion();
  const videoRef = useRef<HTMLVideoElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isVisible, setIsVisible] = useState(true);

  // Skip intro if user prefers reduced motion
  useEffect(() => {
    if (prefersReducedMotion && shouldShowIntro) {
      markIntroComplete();
    }
  }, [prefersReducedMotion, shouldShowIntro, markIntroComplete]);

  // Set up fallback timeout
  useEffect(() => {
    if (shouldShowIntro && isVisible) {
      timeoutRef.current = setTimeout(() => {
        handleComplete();
      }, INTRO_TIMEOUT_MS);

      return () => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
      };
    }
  }, [shouldShowIntro, isVisible]);

  // Handle Escape key to skip
  useEffect(() => {
    if (!shouldShowIntro || !isVisible) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        handleSkip();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [shouldShowIntro, isVisible]);

  const handleComplete = () => {
    setIsVisible(false);
    // Wait for fade-out animation to complete before marking as complete
    setTimeout(() => {
      markIntroComplete();
    }, FADE_OUT_DURATION * 1000);
  };

  const handleVideoEnd = () => {
    handleComplete();
  };

  const handleVideoError = () => {
    console.error("Intro video failed to load");
    markIntroComplete();
  };

  const handleSkip = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    handleComplete();
  };

  if (!shouldShowIntro) {
    return null;
  }

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: FADE_OUT_DURATION, ease: "easeInOut" }}
          className="fixed inset-0 z-[9999] bg-white flex items-center justify-center"
        >
          {/* Video */}
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            onEnded={handleVideoEnd}
            onError={handleVideoError}
            className="w-full h-full object-contain"
          >
            <source src="/intro/x402-intro.mp4" type="video/mp4" />
          </video>

          {/* Skip button */}
          <button
            onClick={handleSkip}
            className="absolute bottom-8 right-8 px-6 py-3 bg-foreground text-background font-mono text-sm hover:bg-gray-70 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-accent-green focus:ring-offset-2"
            aria-label="Skip intro animation"
          >
            Skip
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}