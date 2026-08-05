import { useEffect, useRef, useCallback } from 'react';

/* ================================================================
   WATER RIPPLE BACKGROUND
   Canvas 2D ripple effect that responds to mouse movement.
   When mouse moves over non-content areas, it creates expanding
   circular ripples like a finger touching water surface.
   ================================================================ */

export default function WaterRippleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ripplesRef = useRef<Array<{
    x: number;
    y: number;
    radius: number;
    maxRadius: number;
    opacity: number;
    speed: number;
    lineWidth: number;
  }>>([]);
  const mouseRef = useRef({ x: -1, y: -1, lastX: -1, lastY: -1 });
  const rafRef = useRef<number>(0);

  const createRipple = useCallback((x: number, y: number) => {
    ripplesRef.current.push({
      x,
      y,
      radius: 2,
      maxRadius: 60 + Math.random() * 80,
      opacity: 0.4 + Math.random() * 0.3,
      speed: 1.5 + Math.random() * 1.5,
      lineWidth: 1 + Math.random() * 1.5,
    });
    // Limit ripple count
    if (ripplesRef.current.length > 40) {
      ripplesRef.current = ripplesRef.current.slice(-40);
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      mouseRef.current.lastX = mouseRef.current.x;
      mouseRef.current.lastY = mouseRef.current.y;
      mouseRef.current.x = x;
      mouseRef.current.y = y;

      // Only create ripples when mouse is over non-content areas
      // Check if hovering over interactive elements
      const target = e.target as HTMLElement;
      const isOverContent = target.closest('a, button, input, textarea, video, canvas, [role="dialog"]');

      if (!isOverContent) {
        const dist = Math.hypot(
          x - (mouseRef.current.lastX ?? x),
          y - (mouseRef.current.lastY ?? y)
        );
        // Create ripple every ~15px of movement
        if (dist > 15 || mouseRef.current.lastX === -1) {
          createRipple(x, y);
        }
      }
    };

    const handleClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      // Create a stronger ripple on click
      for (let i = 0; i < 3; i++) {
        setTimeout(() => createRipple(x + (Math.random() - 0.5) * 10, y + (Math.random() - 0.5) * 10), i * 80);
      }
    };

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('click', handleClick);

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const ripples = ripplesRef.current;
      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i];
        r.radius += r.speed;
        r.opacity -= 0.004;

        if (r.opacity <= 0 || r.radius > r.maxRadius) {
          ripples.splice(i, 1);
          continue;
        }

        // Draw ripple ring
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(100, 149, 237, ${r.opacity})`;
        ctx.lineWidth = r.lineWidth * (1 - r.radius / r.maxRadius);
        ctx.stroke();

        // Secondary inner ring
        if (r.radius > 10) {
          ctx.beginPath();
          ctx.arc(r.x, r.y, r.radius * 0.7, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(138, 180, 248, ${r.opacity * 0.4})`;
          ctx.lineWidth = r.lineWidth * 0.5 * (1 - r.radius / r.maxRadius);
          ctx.stroke();
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('click', handleClick);
    };
  }, [createRipple]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-auto z-0"
      style={{ touchAction: 'none' }}
    />
  );
}
