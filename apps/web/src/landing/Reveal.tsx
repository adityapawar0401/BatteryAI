import { useEffect, useRef, useState, type ReactNode } from "react";
import { prefersReducedMotion } from "../ui/useOverlayDismiss";

interface RevealProps { children: ReactNode; className?: string; as?: "div" | "section" | "article" | "li" }

/** Fades content in on first scroll into view. Content is always in the DOM, so it stays readable without IntersectionObserver or motion. */
export function Reveal({ children, className = "", as: Tag = "div" }: RevealProps) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(() => prefersReducedMotion() || typeof IntersectionObserver === "undefined");

  useEffect(() => {
    if (visible) return;
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { threshold: 0.1 });
    observer.observe(element);
    return () => observer.disconnect();
  }, [visible]);

  return <Tag ref={ref as never} className={`reveal${visible ? " reveal--visible" : ""}${className ? ` ${className}` : ""}`}>{children}</Tag>;
}
