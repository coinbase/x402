"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { INTRO_STORAGE_KEY } from "../lib/introMedia";

interface IntroContextValue {
  shouldShowIntro: boolean;
  markIntroComplete: () => void;
}

const IntroContext = createContext<IntroContextValue | undefined>(undefined);

/** Stable fallback for when useIntro is called outside IntroProvider */
const FALLBACK_INTRO_CONTEXT: IntroContextValue = {
  shouldShowIntro: false,
  markIntroComplete: (): void => {},
};

interface IntroProviderProps {
  children: ReactNode;
}

export function IntroProvider({ children }: IntroProviderProps) {
  const [shouldShowIntro, setShouldShowIntro] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Check if intro has been shown before
    const hasSeenIntro = sessionStorage.getItem(INTRO_STORAGE_KEY);
    setShouldShowIntro(!hasSeenIntro);
  }, []);

  const markIntroComplete = useCallback((): void => {
    sessionStorage.setItem(INTRO_STORAGE_KEY, "true");
    setShouldShowIntro(false);
  }, []);

  // Don't render intro during SSR
  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <IntroContext.Provider value={{ shouldShowIntro, markIntroComplete }}>
      {children}
    </IntroContext.Provider>
  );
}

export function useIntro(): IntroContextValue {
  const context = useContext(IntroContext);
  return context ?? FALLBACK_INTRO_CONTEXT;
}
