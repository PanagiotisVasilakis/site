"use client";
import { useEffect, useRef, useState } from 'react';

interface HomeHeroProps {
  title: string;
  subtitle: string;
  locale: string;
}

// Lightweight particle orbit + gradient spotlight effect
export default function HomeHero({ title, subtitle }: HomeHeroProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf: number;
    let running = true;
    const prefersReduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const DPR = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const particles = Array.from({ length: 36 }, (_, i) => ({ angle: (i/36) * Math.PI * 2, radius: 30 + (i % 12) * 4, speed: 0.003 + (i%5)*0.0006 }));
    function resize() {
      if (!canvas || !ctx) return;
      canvas.width = canvas.clientWidth * DPR;
      canvas.height = canvas.clientHeight * DPR;
      ctx.setTransform(1,0,0,1,0,0);
      ctx.scale(DPR, DPR);
    }
    resize();
    const onResize = () => { ctx.setTransform(1,0,0,1,0,0); resize(); };
    window.addEventListener('resize', onResize);
    function frame() {
  if (prefersReduce || !running) return; // stop animating
  if (!canvas || !ctx) return;
  ctx.clearRect(0,0,canvas.width, canvas.height);
  const w = canvas.clientWidth; const h = canvas.clientHeight;
      const cx = w/2; const cy = h/2;
      // Draw soft radial gradient backdrop
  const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, Math.max(w,h)*0.7);
      g.addColorStop(0, 'rgba(46,196,182,0.25)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0,0,w,h);
      particles.forEach(p => {
        p.angle += p.speed;
        const x = cx + Math.cos(p.angle) * p.radius;
        const y = cy + Math.sin(p.angle) * p.radius * 0.6;
        const size = 4 + ((Math.sin(p.angle*2)+1)/2)*3;
        ctx.beginPath();
        ctx.fillStyle = 'rgba(255,138,91,' + (0.35 + 0.65*((Math.cos(p.angle*3)+1)/2)) + ')';
        ctx.arc(x, y, size, 0, Math.PI*2);
        ctx.fill();
      });
      raf = requestAnimationFrame(frame);
    }
  const visHandler = () => { running = document.visibilityState === 'visible'; if (running && !prefersReduce) { raf = requestAnimationFrame(frame); } };
  document.addEventListener('visibilitychange', visHandler);
  if (!prefersReduce) raf = requestAnimationFrame(frame);
  return () => { running = false; cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); document.removeEventListener('visibilitychange', visHandler); };
  }, []);
  return (
  <div className="relative mb-10 overflow-hidden rounded-2xl panel hero-card backdrop-blur px-6 sm:px-10 pt-12 pb-14 bg-panel-soft">
      <div className="relative z-10 max-w-2xl mx-auto text-center">
  <h1 className="display-serif italian-title title-gradient title-ornament text-4xl sm:text-5xl md:text-6xl leading-tight tracking-tight">
          {title}
        </h1>
  <p className="mt-4 text-base sm:text-lg text-muted leading-relaxed">
          {subtitle}
        </p>
  {/* Removed live/update indicators per user request */}
      </div>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden />
      {mounted && (
  <div className="pointer-events-none absolute -top-32 -right-32 w-96 h-96 blur-3xl" style={{background:'radial-gradient(circle at 30% 30%, rgba(54,185,171,0.28), rgba(54,185,171,0) 70%)'}} aria-hidden></div>
      )}
    </div>
  );
}
