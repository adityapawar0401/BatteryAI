import { useEffect } from "react";

/** Shared mobile-overlay behavior: Escape closes it and the page behind it stops scrolling. */
export function useOverlayDismiss(open: boolean, close: () => void): void {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    document.addEventListener("keydown", onKeyDown);
    document.body.classList.add("scroll-locked");
    return () => { document.removeEventListener("keydown", onKeyDown); document.body.classList.remove("scroll-locked"); };
  }, [close, open]);
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function hasFinePointer(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(pointer: fine)").matches;
}
