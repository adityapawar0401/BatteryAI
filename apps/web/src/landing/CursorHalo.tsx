import { useEffect, useState } from "react";
import { hasFinePointer, prefersReducedMotion } from "../ui/useOverlayDismiss";

/**
 * Decorative pointer halo for fine-pointer desktops only. It overlays the native
 * cursor rather than replacing it, and never mounts on touch or coarse pointers.
 */
export function CursorHalo() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => { setEnabled(hasFinePointer() && !prefersReducedMotion()); }, []);
  useEffect(() => {
    if (!enabled) return;
    const dot = document.querySelector<HTMLElement>(".cursor-halo__dot");
    const ring = document.querySelector<HTMLElement>(".cursor-halo__ring");
    if (!dot || !ring) return;
    const move = (event: PointerEvent): void => {
      const position = `translate(${event.clientX}px, ${event.clientY}px)`;
      dot.style.transform = position;
      ring.style.transform = position;
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => window.removeEventListener("pointermove", move);
  }, [enabled]);

  if (!enabled) return null;
  return <div className="cursor-halo" aria-hidden="true"><span className="cursor-halo__dot" /><span className="cursor-halo__ring" /></div>;
}
