"use client";

import { useEffect } from "react";
import { useReducedMotion } from "../hooks/useReducedMotion";

interface NetworkInformation {
  saveData?: boolean;
  effectiveType?: "slow-2g" | "2g" | "3g" | "4g";
}

declare global {
  interface Navigator {
    connection?: NetworkInformation;
  }
}

interface VideoPreloaderProps {
  /** Video source URL - must exactly match the URL used in the video element */
  src: string;
  /** MIME type of the video */
  type?: string;
}

/**
 * Client-side video preloader that warms the media pipeline.
 * Supplements the <link rel="preload"> in <head> for browsers that benefit from
 * an actual video element load() call.
 *
 * Skips preloading when:
 * - User prefers reduced motion
 * - User has save-data enabled
 * - Connection is slow (2g or slow-2g)
 */
export function VideoPreloader({ src, type = "video/mp4" }: VideoPreloaderProps): null {
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    // Skip if user prefers reduced motion
    if (prefersReducedMotion) {
      return;
    }

    // Check network conditions
    const connection = navigator.connection;
    if (connection) {
      // Skip if save-data is enabled
      if (connection.saveData) {
        return;
      }
      // Skip on slow connections
      if (connection.effectiveType === "slow-2g" || connection.effectiveType === "2g") {
        return;
      }
    }

    // Create an off-DOM video element to warm the media pipeline
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;

    // Create and append source element
    const source = document.createElement("source");
    source.src = src;
    source.type = type;
    video.appendChild(source);

    // Trigger load to start buffering
    video.load();

    // Cleanup: remove references to allow garbage collection
    return () => {
      video.src = "";
      video.load();
    };
  }, [src, type, prefersReducedMotion]);

  return null;
}
