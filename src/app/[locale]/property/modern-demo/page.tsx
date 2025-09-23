"use client";
import Image from 'next/image';
// (Optional) dictionary import deferred until needed to avoid extra JS here.
// import { getDictionary } from '@/i18n/dictionaries';
import React from 'react';

// Remove force-static as this is a client component

// Design tokens (could move to CSS vars / tailwind config extension)
const TOKENS = {
  colors: { bg: '#ffffff', ink: '#1c1c20', muted: '#6e727a', border: '#e6e8ee' },
  radii: { card: '24px', button: '20px' },
  spacing: { outerDesktop: '56px', outerMobile: '24px' }
} as const;

// Right rail section data
const SECTIONS: { key: string; title: string; body: string; img: string; alt: string; }[] = [
  {
    key: 'living',
    title: 'Living Room',
    body: 'A sun‑filled open living space framed by full‑height glazing and soft neutral textures, designed for slow mornings and relaxed evenings.',
    img: '/house/att.FcEjVIjFuWRZjLgXbVE8uocMCMkIQ23IOfjVpyylEGM.jpeg',
    alt: 'Living room with large window and neutral sofas'
  },
  {
    key: 'kitchen',
    title: 'Kitchen',
    body: 'Minimal cabinetry, matte stone surfaces and concealed lighting create a calm culinary workspace that still feels social.',
    img: '/house/att.cHicxncSMUEm4RWJX_TOPezn7NPvxWRt7Z0xKZ8nylE.jpeg',
    alt: 'Sleek modern kitchen with stone island'
  },
  {
    key: 'bedroom',
    title: 'Bedroom',
    body: 'A quiet retreat layered with natural materials and cross‑breeze ventilation for restful nights after seaside days.',
    img: '/house/att.JGRBgs9ovAV-CEXk7VOv6224jjA1IwYvXPv0eNz-WHk.jpeg',
    alt: 'Minimal bedroom with wooden accents'
  },
  {
    key: 'deck',
    title: 'Deck',
    body: 'Expansive timber decking merging indoor and outdoor living; perfect for sunset dining over the Aegean horizon.',
    img: '/house/att.pq0r63Hqen-MwVttIXHwKIoyGEcBXZDt2H5zqp_R8dY.jpeg',
    alt: 'Outdoor deck with sea view at golden hour'
  }
];

export default function PropertyPage() {
  // i18n dictionary intentionally not loaded on this demo page to reduce bundle; add back if dynamic copy required.

  return (
    <div className="relative" style={{ '--ink': TOKENS.colors.ink, '--muted': TOKENS.colors.muted, '--border': TOKENS.colors.border } as React.CSSProperties}>
      {/* Hero */}
      <section className="relative h-[100svh] w-full overflow-hidden group" aria-label="Intro hero">
        <Image
          src="/house/att.fYppcKEpB0t2ddiZJ0vvc8QJi9WsxArQdE3c-PwRV4E.jpeg"
          alt="Seaside Modern Villa exterior"
          fill
          priority
          fetchPriority="high"
          sizes="100vw"
          className="object-cover will-change-transform hero-ken-burns"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/25 to-black/10 pointer-events-none" aria-hidden="true" />
        <div className="absolute inset-x-0 top-0 flex h-full flex-col justify-center px-6 md:px-[56px] text-white">
          <h1 className="text-4xl md:text-6xl font-semibold drop-shadow">Seaside Modern Villa</h1>
          <p className="mt-4 max-w-md text-lg opacity-90">Aegean Bay, Greece</p>
          <p className="mt-6 max-w-lg text-base md:text-lg opacity-90">A cinematic coastal retreat. Thoughtful spatial flow, restrained material palette, and seamless indoor‑outdoor living crafted for slow Mediterranean days.</p>
          <div className="mt-10 flex items-center gap-4 text-xs tracking-wide uppercase opacity-80">
            <span className="animate-pulse">Scroll ↓</span>
            <button className="btn-outline btn-sm bg-white/10 hover:bg-white/20 focus:outline-none" onClick={()=>{
              const main=document.getElementById('story-start'); if(main) main.scrollIntoView({behavior:'smooth'});
            }}>Skip intro</button>
          </div>
        </div>
        {/* White surface handoff gradient */}
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-b from-transparent to-white" aria-hidden="true" />
      </section>

      {/* Content Surface */}
      <div id="story-start" className="relative bg-white text-[color:var(--ink)]">
        {/* Spacer overlapping hero to create handoff (hero stops scaling past this) */}
        <div className="h-[12svh] -mt-[12svh]" aria-hidden="true" />
        <div className="mx-auto max-w-6xl px-6 md:px-[56px] py-16 lg:py-24 grid lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] gap-12">
          <div className="space-y-14">
            {SECTIONS.map((s)=>(
              <article key={s.key} className="scroll-mt-24 article-chunk" aria-labelledby={`sec-${s.key}`}> 
                <header>
                  <h2 id={`sec-${s.key}`} className="text-2xl font-semibold">{s.title}</h2>
                  <p className="mt-3 text-[15px] leading-relaxed text-[color:var(--muted)]">{s.body}</p>
                </header>
              </article>
            ))}
            {/* Specs & CTAs */}
            <section aria-label="Specifications and actions" className="space-y-6">
              <h2 className="text-2xl font-semibold">At a Glance</h2>
              <ul className="flex flex-wrap gap-2 text-sm">
                {['4 beds','3 baths','245 m²'].map(spec => <li key={spec} className="px-3 py-1 rounded-full border border-[color:var(--border)] bg-white shadow-sm">{spec}</li>)}
              </ul>
              <div className="flex flex-wrap gap-4 pt-2">
                <button className="px-6 py-3 rounded-[20px] bg-black text-white text-sm font-medium shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-black/50">Book a Viewing</button>
                <button className="px-6 py-3 rounded-[20px] bg-white border border-[color:var(--border)] text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-black/30">Contact Agent</button>
              </div>
            </section>
            <footer className="pt-20 text-xs text-[color:var(--muted)]">© Villa Demo — imagery for prototype only.</footer>
          </div>

          {/* Right Rail Cards */}
          <div className="relative space-y-12" role="region" aria-label="Property photo gallery right rail">
            {SECTIONS.map((s)=>(
              <div
                key={s.key}
                role="region"
                aria-label={`${s.title} photo`}
                className="right-rail-card opacity-0 translate-x-[15vw] will-change-transform overflow-hidden rounded-[24px] border border-[color:var(--border)] bg-white shadow-sm"
                style={{ contentVisibility:'auto', containIntrinsicSize:'360px 320px' }}
              >
                <div className="aspect-[4/3] relative">
                  <Image src={s.img} alt={s.alt} fill sizes="(max-width:1024px) 100vw, 480px" loading="lazy" className="object-cover" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style jsx global>{`
        /* Hero Ken Burns (gentle) – scroll driven when supported */
        @supports (animation-timeline: scroll()) {
          .hero-ken-burns { animation: heroPan linear both; animation-timeline: scroll(root block); animation-range: 0 65%; }
        }
        /* Fallback: time-based 2s ease-out once */
        @supports not (animation-timeline: scroll()) {
          .hero-ken-burns { animation: heroPan 2s ease-out forwards; }
        }
        @keyframes heroPan { from { transform: scale(1) translateZ(0); } to { transform: scale(1.03) translateZ(0); } }
        @media (prefers-reduced-motion: reduce) {
          .hero-ken-burns { animation: none !important; transform: scale(1) !important; }
        }
        /* Right rail scroll-driven animations */
        @supports (animation-timeline: scroll()) {
          .right-rail-card { animation: slideInX both; animation-timeline: view(); animation-range: entry 25% cover 40%; }
          @keyframes slideInX { from { opacity:0; transform: translateX(15vw); } to { opacity:1; transform: translateX(0); } }
        }
        @media (prefers-reduced-motion: reduce) {
          .right-rail-card { opacity:1 !important; transform:none !important; animation:none !important; }
        }
        /* Progressive rendering & containment */
        .article-chunk { content-visibility:auto; contain-intrinsic-size: 600px 800px; }
        @media (max-width: 768px){ .article-chunk { contain-intrinsic-size: 520px 640px; } }
        /* After slide-in finishes, drop expensive will-change */
        .right-rail-card.is-active { will-change: auto; }
      `}</style>
      <ScriptSetups />
      {/* Idle enhancements: demote will-change & decode images early once network idle */}
      <script dangerouslySetInnerHTML={{__html:`(function(){
        if('requestIdleCallback' in window){
          requestIdleCallback(function(){
            document.querySelectorAll('.right-rail-card').forEach(function(c){
              if(c.classList.contains('opacity-0')) return; // not shown yet
              c.classList.add('is-active');
            });
            // Hint decode for remaining lazy images (if any already in DOM)
            document.querySelectorAll('.right-rail-card img[loading="lazy"]').forEach(function(img){ if(img.decode) img.decode().catch(function(){}); });
          });
        }
      })();`}} />
    </div>
  );
}

// Separate component to attach IntersectionObserver fallback after hydration
function ScriptSetups(){
  return <>
    <script dangerouslySetInnerHTML={{__html:`(function(){
      if(!('IntersectionObserver' in window)) return; 
      if(CSS && CSS.supports && CSS.supports('animation-timeline: scroll()')) return; // native scroll timeline supported
      var cards=[].slice.call(document.querySelectorAll('.right-rail-card'));
      var io=new IntersectionObserver(function(entries){
        entries.forEach(function(e){
          if(e.isIntersecting){
            e.target.style.transition='transform 260ms cubic-bezier(.16,.84,.44,1),opacity 260ms ease-out';
            e.target.style.transform='translateX(0)';
            e.target.style.opacity='1';
            io.unobserve(e.target);
          }
        });
      },{ threshold:0.15 });
      cards.forEach(function(c){ io.observe(c); });
    })();`}} />
  </>;
}
