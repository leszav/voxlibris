import { useEffect, useState } from "react";
import { getMobileDeviceType } from "@/lib/mobile-analytics";

export type StudioDeviceMode = "allowed" | "override" | "blocked";
export type StudioDeviceType = "desktop" | "mobile" | "tablet";

export interface StudioDeviceEligibility {
  mode: StudioDeviceMode;
  deviceType: StudioDeviceType;
  viewportWidth: number | null;
  viewportHeight: number | null;
  hasFinePointer: boolean;
  hasHover: boolean;
  reason: string | null;
}

const STUDIO_MIN_VIEWPORT_WIDTH = 1024;
const STUDIO_MIN_VIEWPORT_HEIGHT = 768;
const STUDIO_VIEWPORT_BLOCK_REASON = "Для нормальной работы в Voxlibris Studio необходимо разрешение экрана 1024 × 768. Пожалуйста, подключите соответствующий монитор";

function evaluateStudioDeviceEligibility(): StudioDeviceEligibility {
  if (typeof window === "undefined") {
    return {
      mode: "allowed",
      deviceType: "desktop",
      viewportWidth: null,
      viewportHeight: null,
      hasFinePointer: false,
      hasHover: false,
      reason: null,
    };
  }

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const hasFinePointer = window.matchMedia("(pointer: fine)").matches;
  const hasHover = window.matchMedia("(hover: hover)").matches;
  const mobileDeviceType = getMobileDeviceType();

  if (mobileDeviceType === "mobile") {
    return {
      mode: "blocked",
      deviceType: "mobile",
      viewportWidth,
      viewportHeight,
      hasFinePointer,
      hasHover,
      reason: STUDIO_VIEWPORT_BLOCK_REASON,
    };
  }

  if (mobileDeviceType === "tablet") {
    return {
      mode: "blocked",
      deviceType: "tablet",
      viewportWidth,
      viewportHeight,
      hasFinePointer,
      hasHover,
      reason: STUDIO_VIEWPORT_BLOCK_REASON,
    };
  }

  if (viewportWidth < STUDIO_MIN_VIEWPORT_WIDTH || viewportHeight < STUDIO_MIN_VIEWPORT_HEIGHT) {
    return {
      mode: "blocked",
      deviceType: "desktop",
      viewportWidth,
      viewportHeight,
      hasFinePointer,
      hasHover,
      reason: STUDIO_VIEWPORT_BLOCK_REASON,
    };
  }

  return {
    mode: "allowed",
    deviceType: "desktop",
    viewportWidth,
    viewportHeight,
    hasFinePointer,
    hasHover,
    reason: null,
  };
}

export function useStudioDeviceEligibility(): StudioDeviceEligibility {
  const [eligibility, setEligibility] = useState<StudioDeviceEligibility>(() =>
    evaluateStudioDeviceEligibility(),
  );

  useEffect(() => {
    const updateEligibility = () => {
      setEligibility(evaluateStudioDeviceEligibility());
    };

    const pointerMedia = window.matchMedia("(pointer: fine)");
    const hoverMedia = window.matchMedia("(hover: hover)");

    window.addEventListener("resize", updateEligibility);
    pointerMedia.addEventListener("change", updateEligibility);
    hoverMedia.addEventListener("change", updateEligibility);

    updateEligibility();

    return () => {
      window.removeEventListener("resize", updateEligibility);
      pointerMedia.removeEventListener("change", updateEligibility);
      hoverMedia.removeEventListener("change", updateEligibility);
    };
  }, []);

  return eligibility;
}
