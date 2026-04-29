import { useEffect, useState } from "react";
import { getMobileDeviceType } from "@/lib/mobile-analytics";

export type StudioDeviceMode = "allowed" | "override" | "blocked";
export type StudioDeviceType = "desktop" | "mobile" | "tablet";

export interface StudioDeviceEligibility {
  mode: StudioDeviceMode;
  deviceType: StudioDeviceType;
  viewportWidth: number | null;
  hasFinePointer: boolean;
  hasHover: boolean;
  reason: string | null;
}

function evaluateStudioDeviceEligibility(): StudioDeviceEligibility {
  if (typeof window === "undefined") {
    return {
      mode: "allowed",
      deviceType: "desktop",
      viewportWidth: null,
      hasFinePointer: false,
      hasHover: false,
      reason: null,
    };
  }

  const viewportWidth = window.innerWidth;
  const hasFinePointer = window.matchMedia("(pointer: fine)").matches;
  const hasHover = window.matchMedia("(hover: hover)").matches;
  const mobileDeviceType = getMobileDeviceType();

  if (mobileDeviceType === "mobile") {
    return {
      mode: "blocked",
      deviceType: "mobile",
      viewportWidth,
      hasFinePointer,
      hasHover,
      reason: "VoxLibris Studio недоступна на телефонах. Для эфира используйте компьютер или крупный планшет с мышью, трекпадом или клавиатурой.",
    };
  }

  if (mobileDeviceType === "tablet") {
    if (viewportWidth >= 1024 && (hasFinePointer || hasHover)) {
      return {
        mode: "allowed",
        deviceType: "tablet",
        viewportWidth,
        hasFinePointer,
        hasHover,
        reason: null,
      };
    }

    return {
      mode: "override",
      deviceType: "tablet",
      viewportWidth,
      hasFinePointer,
      hasHover,
      reason: "На большинстве планшетов Studio работает нестабильно. Если у вас большой экран и подключена периферия, можно продолжить вручную.",
    };
  }

  return {
    mode: "allowed",
    deviceType: "desktop",
    viewportWidth,
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
