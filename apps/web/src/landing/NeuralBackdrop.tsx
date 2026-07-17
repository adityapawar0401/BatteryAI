import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "../ui/useOverlayDismiss";

interface Node { x: number; y: number; vx: number; vy: number }

/**
 * Decorative particle field behind the hero. Reduced-motion users get a single
 * static frame instead of an animation loop.
 */
export function NeuralBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const still = prefersReducedMotion();
    let width = 0;
    let height = 0;
    let nodes: Node[] = [];
    let frame = 0;

    const seed = (index: number, salt: number): number => {
      const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
      return value - Math.floor(value);
    };
    const build = (): void => {
      const count = Math.min(70, Math.max(18, Math.floor(width / 22)));
      nodes = Array.from({ length: count }, (_, index) => ({
        x: seed(index, 1) * width,
        y: seed(index, 2) * height,
        vx: (seed(index, 3) - 0.5) * 0.35,
        vy: (seed(index, 4) - 0.5) * 0.35,
      }));
    };
    const resize = (): void => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.max(1, Math.floor(width * ratio));
      canvas.height = Math.max(1, Math.floor(height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      build();
      if (still) draw();
    };
    const draw = (): void => {
      context.clearRect(0, 0, width, height);
      for (let i = 0; i < nodes.length; i += 1) {
        for (let j = i + 1; j < nodes.length; j += 1) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const distance = Math.hypot(dx, dy);
          if (distance >= 130) continue;
          context.strokeStyle = `rgba(255, 255, 255, ${(1 - distance / 130) * 0.16})`;
          context.lineWidth = 0.5;
          context.beginPath();
          context.moveTo(nodes[i].x, nodes[i].y);
          context.lineTo(nodes[j].x, nodes[j].y);
          context.stroke();
        }
      }
      context.fillStyle = "rgba(204, 255, 0, 0.75)";
      for (const node of nodes) {
        context.beginPath();
        context.arc(node.x, node.y, 1.4, 0, Math.PI * 2);
        context.fill();
      }
    };
    const step = (): void => {
      for (const node of nodes) {
        node.x += node.vx;
        node.y += node.vy;
        if (node.x < 0 || node.x > width) node.vx *= -1;
        if (node.y < 0 || node.y > height) node.vy *= -1;
      }
      draw();
      frame = window.requestAnimationFrame(step);
    };

    resize();
    window.addEventListener("resize", resize);
    if (!still) frame = window.requestAnimationFrame(step);
    return () => { window.removeEventListener("resize", resize); if (frame) window.cancelAnimationFrame(frame); };
  }, []);

  return <canvas ref={canvasRef} className="landing__backdrop" aria-hidden="true" />;
}
