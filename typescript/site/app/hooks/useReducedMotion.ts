import { useState, useEffect } from "react";

/**
 * A custom hook that detects if the user has enabled reduced motion preferences.
 * This hook handles both client-side and server-side rendering scenarios.
 *
 * @returns {boolean} Returns true if user prefers reduced motion, false otherwise
 */
export function useReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mediaQuery.matches);

    const listener = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener("change", listener);

    return () => mediaQuery.removeEventListener("change", listener);
  }, []);

  // Return false during SSR, actual value after mount
  if (!mounted) return false;

  return prefersReducedMotion;
}
