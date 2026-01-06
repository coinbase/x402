"use client";

import { useState, useCallback } from "react";
import Lottie from "lottie-react";
import { useIntro } from "../contexts/IntroContext";
import { X402Logo } from "./Logo";
import animationData from "../data/lottie/CB_Dev_X402_02_v005.json";

interface AnimatedLogoProps {
  className?: string;
}

const ANIMATION_SIZE = 105;

export function AnimatedLogo({ className }: AnimatedLogoProps): React.ReactElement {
  const { shouldShowIntro, markIntroComplete } = useIntro();
  const [animationComplete, setAnimationComplete] = useState(false);

  const handleComplete = useCallback(() => {
    setAnimationComplete(true);
    markIntroComplete();
  }, [markIntroComplete]);

  if (!shouldShowIntro || animationComplete) {
    return <X402Logo className={className} />;
  }

  return (
    <div className={className} style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <X402Logo style={{ visibility: "hidden" }} />
      <Lottie
        animationData={animationData}
        loop={false}
        autoplay
        onComplete={handleComplete}
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: ANIMATION_SIZE,
          height: ANIMATION_SIZE,
        }}
        aria-label="x402 logo animation"
      />
    </div>
  );
}
