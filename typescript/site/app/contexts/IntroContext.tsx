"use client";

import React, { createContext, useContext, useState, useEffect, type ReactNode } from "react";

interface IntroContextValue {
  shouldShowIntro: boolean;
  markIntroComplete: () => void;
}

const IntroContext = createContext<IntroContextValue | undefined>(undefined);

const INTRO_STORAGE_KEY = "x402-intro-completed";

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

  const markIntroComplete = () => {
    sessionStorage.setItem(INTRO_STORAGE_KEY, "true");
    setShouldShowIntro(false);
  };

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
  if (context === undefined) {
    return {
      shouldShowIntro: false,
      markIntroComplete: () => {},
    };
  }
  return context;
}