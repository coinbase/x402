"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useIntro } from "../contexts/IntroContext";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { INTRO_VIDEO } from "../lib/introMedia";

const INTRO_TIMEOUT_MS = 10000; // 10s fallback timeout
const FADE_OUT_DURATION = 0.5; // 500ms fade out

export function IntroAnimation(): React.ReactElement | null {
  const { shouldShowIntro, markIntroComplete } = useIntro();
  const prefersReducedMotion = useReducedMotion();
  const videoRef = useRef<HTMLVideoElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isVisible, setIsVisible] = useState<boolean>(true);

  // Define callbacks before useEffects that depend on them
  const handleComplete = useCallback((): void => {
    setIsVisible(false);
    // Wait for fade-out animation to complete before marking as complete
    setTimeout(() => {
      markIntroComplete();
    }, FADE_OUT_DURATION * 1000);
  }, [markIntroComplete]);

  const handleSkip = useCallback((): void => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    handleComplete();
  }, [handleComplete]);

  const handleVideoEnd = useCallback((): void => {
    handleComplete();
  }, [handleComplete]);

  const handleVideoError = useCallback((): void => {
    console.error("Intro video failed to load");
    markIntroComplete();
  }, [markIntroComplete]);

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
  }, [shouldShowIntro, isVisible, handleComplete]);

  // Handle Escape key to skip
  useEffect(() => {
    if (!shouldShowIntro || !isVisible) return;

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        handleSkip();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [shouldShowIntro, isVisible, handleSkip]);

  if (!shouldShowIntro) {
    return null;
  }

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          key="intro-overlay"
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
            preload="auto"
            onEnded={handleVideoEnd}
            onError={handleVideoError}
            className="w-full h-full object-contain"
          >
            <source src={INTRO_VIDEO.src} type={INTRO_VIDEO.type} />
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
