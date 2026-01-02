/**
 * Centralized intro media constants.
 * IMPORTANT: The preload href must exactly match the video src for browser cache reuse.
 */
export const INTRO_VIDEO = {
  src: "/intro/x402-intro.mp4",
  type: "video/mp4",
} as const;

/** Session storage key for tracking intro completion */
export const INTRO_STORAGE_KEY = "x402-intro-completed";
