import { useEffect, useRef, useState, type RefObject } from "react";

interface ReaderSelectionBookmarkState {
  text: string;
  top: number;
  left: number;
}

interface UseReaderSelectionBookmarkOptions {
  containerRef: RefObject<HTMLElement | null>;
  enabled?: boolean;
}

const PROMPT_SELECTOR = "[data-reader-selection-prompt='true']";

function isSelectionInsideContainer(selection: Selection, container: HTMLElement): boolean {
  if (selection.rangeCount === 0) {
    return false;
  }

  const range = selection.getRangeAt(0);
  const commonAncestor = range.commonAncestorContainer;
  const ancestorElement = commonAncestor.nodeType === Node.ELEMENT_NODE
    ? commonAncestor
    : commonAncestor.parentElement;

  return ancestorElement instanceof Node && container.contains(ancestorElement);
}

function readSelectionState(container: HTMLElement | null): ReaderSelectionBookmarkState | null {
  const selection = globalThis.getSelection();
  if (!container || !selection || selection.isCollapsed || selection.rangeCount === 0) {
    return null;
  }

  if (!isSelectionInsideContainer(selection, container)) {
    return null;
  }

  const text = selection.toString().trim().replace(/\s+/g, " ");
  if (text.length < 2) {
    return null;
  }

  const rect = selection.getRangeAt(0).getBoundingClientRect();
  if (!rect.width && !rect.height) {
    return null;
  }

  return {
    text,
    top: Math.max(12, rect.top - 56),
    left: rect.left + rect.width / 2,
  };
}

export function useReaderSelectionBookmark({
  containerRef,
  enabled = true,
}: UseReaderSelectionBookmarkOptions) {
  const [selectionState, setSelectionState] = useState<ReaderSelectionBookmarkState | null>(null);
  const isPointerSelectingRef = useRef(false);
  const finalizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectionStateRef = useRef<ReaderSelectionBookmarkState | null>(null);

  useEffect(() => {
    selectionStateRef.current = selectionState;
  }, [selectionState]);

  useEffect(() => {
    if (!enabled) {
      setSelectionState(null);
      return;
    }

    const clearFinalizeTimeout = () => {
      if (finalizeTimeoutRef.current) {
        clearTimeout(finalizeTimeoutRef.current);
        finalizeTimeoutRef.current = null;
      }
    };

    const finalizeSelection = () => {
      clearFinalizeTimeout();
      finalizeTimeoutRef.current = setTimeout(() => {
        setSelectionState(readSelectionState(containerRef.current));
        finalizeTimeoutRef.current = null;
      }, 24);
    };

    const handlePointerStart = (event: MouseEvent | TouchEvent) => {
      const container = containerRef.current;
      const target = event.target instanceof HTMLElement ? event.target : null;

      if (target?.closest(PROMPT_SELECTOR)) {
        return;
      }

      clearFinalizeTimeout();

      if (!container || !target || !container.contains(target)) {
        isPointerSelectingRef.current = false;
        if (selectionStateRef.current) {
          setSelectionState(null);
        }
        return;
      }

      isPointerSelectingRef.current = true;
      setSelectionState(null);
    };

    const handlePointerEnd = () => {
      if (!isPointerSelectingRef.current) {
        return;
      }

      isPointerSelectingRef.current = false;
      finalizeSelection();
    };

    const handleSelectionChange = () => {
      if (isPointerSelectingRef.current) {
        return;
      }

      const nextSelection = readSelectionState(containerRef.current);
      if (nextSelection) {
        setSelectionState(nextSelection);
      }
    };

    const clearSelectionState = () => {
      clearFinalizeTimeout();
      setSelectionState(null);
    };

    document.addEventListener("mousedown", handlePointerStart);
    document.addEventListener("touchstart", handlePointerStart, { passive: true });
    document.addEventListener("mouseup", handlePointerEnd);
    document.addEventListener("touchend", handlePointerEnd);
    document.addEventListener("selectionchange", handleSelectionChange);
    document.addEventListener("scroll", clearSelectionState, true);
    globalThis.addEventListener("resize", clearSelectionState);

    return () => {
      clearFinalizeTimeout();
      document.removeEventListener("mousedown", handlePointerStart);
      document.removeEventListener("touchstart", handlePointerStart);
      document.removeEventListener("mouseup", handlePointerEnd);
      document.removeEventListener("touchend", handlePointerEnd);
      document.removeEventListener("selectionchange", handleSelectionChange);
      document.removeEventListener("scroll", clearSelectionState, true);
      globalThis.removeEventListener("resize", clearSelectionState);
    };
  }, [containerRef, enabled]);

  const clearSelection = () => {
    const selection = globalThis.getSelection();
    selection?.removeAllRanges();
    setSelectionState(null);
  };

  return {
    selectionState,
    clearSelection,
  };
}
