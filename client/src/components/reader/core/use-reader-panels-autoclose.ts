import { useCallback, useEffect, useRef, type RefObject } from "react";

interface UseReaderPanelsAutocloseOptions {
  isOpen: boolean;
  onClose: () => void;
  contentRef: RefObject<HTMLElement | null>;
  inactivityMs?: number;
}

export function useReaderPanelsAutoclose({
  isOpen,
  onClose,
  contentRef,
  inactivityMs = 3000,
}: UseReaderPanelsAutocloseOptions): void {
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
  }, []);

  const resetInactivityTimer = useCallback(() => {
    clearInactivityTimer();

    if (!isOpen) {
      return;
    }

    inactivityTimerRef.current = setTimeout(() => {
      onClose();
    }, inactivityMs);
  }, [clearInactivityTimer, inactivityMs, isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) {
      clearInactivityTimer();
      return;
    }

    const contentElement = contentRef.current;

    const handleReaderActivity = () => {
      resetInactivityTimer();
    };

    const handleTextInteraction = () => {
      onClose();
    };

    resetInactivityTimer();

    document.addEventListener("pointerdown", handleReaderActivity, true);
    document.addEventListener("pointermove", handleReaderActivity, true);
    document.addEventListener("touchstart", handleReaderActivity, true);
    document.addEventListener("input", handleReaderActivity, true);
    document.addEventListener("keydown", handleReaderActivity, true);

    contentElement?.addEventListener("pointerdown", handleTextInteraction, true);
    contentElement?.addEventListener("touchstart", handleTextInteraction, true);
    contentElement?.addEventListener("wheel", handleTextInteraction, true);
    contentElement?.addEventListener("focusin", handleTextInteraction, true);

    return () => {
      clearInactivityTimer();
      document.removeEventListener("pointerdown", handleReaderActivity, true);
      document.removeEventListener("pointermove", handleReaderActivity, true);
      document.removeEventListener("touchstart", handleReaderActivity, true);
      document.removeEventListener("input", handleReaderActivity, true);
      document.removeEventListener("keydown", handleReaderActivity, true);
      contentElement?.removeEventListener("pointerdown", handleTextInteraction, true);
      contentElement?.removeEventListener("touchstart", handleTextInteraction, true);
      contentElement?.removeEventListener("wheel", handleTextInteraction, true);
      contentElement?.removeEventListener("focusin", handleTextInteraction, true);
    };
  }, [clearInactivityTimer, contentRef, isOpen, onClose, resetInactivityTimer]);
}
