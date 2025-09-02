"use client";
import React from 'react';
import Image from 'next/image';
import type { PhotoWithAlt } from '@/app/[locale]/house/page';
import HouseGalleryLightbox from '@/components/HouseGalleryLightbox';
import ExpandableText from '@/components/ExpandableText';

interface HouseText {
  title?: string;
  location?: string;
  intro?: string;
  photoAlts?: Record<string,string>;
  [k: string]: unknown;
}
interface Props { locale: string; t: unknown; houseText: HouseText | undefined; photos: PhotoWithAlt[]; }

export default function HouseCinematic({ houseText, photos }: Props){
  const ht = houseText || {};
  // Detect Greek content by characters present in intro (locale prop passed separately if needed)
  const introStr = typeof ht?.intro === 'string' ? ht.intro : '';
  const isGreek = /[Α-Ωα-ω]/.test(introStr);
  return (
    <div className="relative" style={{'--ink':'#1c1c20','--muted':'#6e727a','--border':'#e6e8ee'} as React.CSSProperties}>
      {/* Hero */}
      <section className="relative h-[90svh] md:h-[100svh] overflow-hidden" aria-label="House hero">
        <Image src={photos[0].src} alt={ht?.title || 'Hero'} fill priority fetchPriority="high" decoding="async" sizes="100vw" className="object-cover hero-ken-burns" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/35 to-black/15" aria-hidden="true" />
        <div className="absolute inset-x-0 top-0 flex h-full flex-col justify-center px-6 md:px-14 text-white max-w-5xl">
          <h1 className="text-4xl md:text-6xl font-semibold drop-shadow">{ht?.title || 'Seaside Modern Villa'}</h1>
          <p className="mt-4 max-w-md text-lg opacity-90">{ht?.location || 'Aegean Bay, Greece'}</p>
          <p className="mt-6 max-w-lg text-base md:text-lg opacity-90">{ht?.intro || 'A cinematic coastal retreat with seamless indoor-outdoor living.'}</p>
          <div className="mt-10 flex items-center gap-5 text-xs tracking-wide uppercase opacity-80">
            <span className="animate-pulse">Scroll ↓</span>
            <button className="btn-outline btn-sm bg-white/10 hover:bg-white/20" onClick={()=>{
              const anchor=document.getElementById('house-content-start'); anchor?.scrollIntoView({behavior:'smooth'});
            }}>Skip intro</button>
          </div>
        </div>
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-b from-transparent to-white" aria-hidden="true" />
      </section>
      <div id="house-content-start" className="relative bg-white text-[color:var(--ink)]">
        <div className="h-[12svh] -mt-[12svh]" aria-hidden="true" />
        <div className="mx-auto max-w-6xl px-6 md:px-14 py-16 lg:py-24 grid lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] gap-12">
          <div className="space-y-14">
            {/* Narrative Sections */}
            {['Living Room','Kitchen','Bedroom','Deck'].map(key=>{
              const description = String(ht?.[`desc_${key.toLowerCase().replace(/\s+/g,'_')}`] || 'Well-proportioned space with daylight and material warmth emphasizing relaxation.');
              return (
                <article key={key} className="scroll-mt-24" aria-labelledby={`sec-${key.replace(/\s+/g,'-')}`}> 
                  <header>
                    <h2 id={`sec-${key.replace(/\s+/g,'-')}`} className="text-2xl font-semibold">{key}</h2>
                    <ExpandableText 
                      maxLines={4}
                      className="mt-3"
                      expandText={isGreek ? 'Περισσότερα' : 'Read more'}
                      collapseText={isGreek ? 'Λιγότερα' : 'Read less'}
                      disableClamp={isGreek} /* allow full Greek text to avoid mid-word clipping */
                    >
                      <p className="text-[15px] leading-relaxed text-[color:var(--muted)]">
                        {description}
                      </p>
                    </ExpandableText>
                  </header>
                </article>
              );
            })}
            {/* Specs & CTAs */}
            <section aria-label="Specifications and actions" className="space-y-6">
              <h2 className="text-2xl font-semibold">At a Glance</h2>
              <ul className="flex flex-wrap gap-2 text-sm">
                {['2 bedrooms','1 bathroom','2nd floor','75 m²','Mountain & sea views','Free parking'].map(spec => <li key={spec} className="px-3 py-1 rounded-full border border-[color:var(--border)] bg-white shadow-sm">{spec}</li>)}
              </ul>
              <div className="flex flex-wrap gap-4 pt-2">
                <button className="px-6 py-3 rounded-[20px] bg-black text-white text-sm font-medium shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-black/50">Book a Viewing</button>
                <button className="px-6 py-3 rounded-[20px] bg-white border border-[color:var(--border)] text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-black/30">Contact Agent</button>
              </div>
            </section>
            <footer className="pt-20 text-xs text-[color:var(--muted)]">© Kalamata Apartment — 2-bedroom rental in historic Kalamata.</footer>
          </div>
          {/* Right Rail */}
          <div className="relative space-y-12" role="region" aria-label="Photo gallery right rail">
            {photos.slice(0,4).map(p=> {
              const descMap: Record<string,string> = {
                living: 'Open living area bathed in daylight.',
                kitchen: 'Minimal stone kitchen for social cooking.',
                bedroom: 'Calm bedroom retreat with natural textures.',
                kitchen2: 'Chef grade layout.',
                deck: 'Timber deck facing the sea horizon.'
              };
              const description = descMap[p.altKey] || 'Interior detail';
              return (
                <figure key={p.src} role="region" aria-label={p.altKey+ ' photo'} className="right-rail-card group opacity-0 translate-x-[16vw] will-change-transform overflow-hidden rounded-[24px] border border-[color:var(--border)] bg-white shadow-sm" style={{contentVisibility:'auto',containIntrinsicSize:'360px 320px'}}>
                  <div className="aspect-[4/3] relative overflow-hidden">
                    <Image src={p.src} alt={p.altKey} fill sizes="(max-width:1024px) 100vw, 480px" loading="lazy" decoding="async" className="object-cover card-img" />
                    <figcaption className="card-caption pointer-events-none absolute inset-x-0 bottom-0 p-4 pt-10 text-white text-xs sm:text-sm font-medium opacity-0 translate-x-[20vw] translate-y-2">
                      <span className="relative z-10 block drop-shadow-sm">{description}</span>
                      <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/25 to-transparent" />
                    </figcaption>
                  </div>
                </figure>
              );
            })}
          </div>
        </div>
        <HouseGalleryLightbox
          photos={photos}
          alts={ht?.photoAlts ? {
            living: ht.photoAlts.living || 'living',
            bedroom: ht.photoAlts.bedroom || 'bedroom',
            kitchen: ht.photoAlts.kitchen || 'kitchen'
          }: undefined}
        />
      </div>
      <style jsx global>{`
        @supports (animation-timeline: scroll()) {
          .hero-ken-burns { animation: heroPan linear both; animation-timeline: scroll(root block); animation-range: 0 65%; }
        }
        @supports not (animation-timeline: scroll()) {
          .hero-ken-burns { animation: heroPan 2s ease-out forwards; }
        }
        @keyframes heroPan { from { transform: scale(1); } to { transform: scale(1.03); } }
        @supports (animation-timeline: view()) {
          .right-rail-card { animation: slideIn both; animation-timeline: view(); animation-range: entry 20% cover 40%; position:relative; }
          .right-rail-card .card-caption { animation: captionIn both; animation-timeline: view(); animation-range: entry 25% cover 45%; }
          @keyframes slideIn { from { opacity:0; transform: translateX(16vw); } to { opacity:1; transform: translateX(0); } }
          @keyframes captionIn { from { opacity:0; transform: translateX(22vw) translateY(6px); } to { opacity:1; transform: translateX(0) translateY(0); } }
        }
        @media (prefers-reduced-motion: reduce) {
          .hero-ken-burns { animation:none !important; transform:none !important; }
          .right-rail-card { animation:none !important; opacity:1 !important; transform:none !important; }
          .right-rail-card .card-caption { animation:none !important; opacity:1 !important; transform:none !important; }
        }
      `}</style>
      <script dangerouslySetInnerHTML={{__html:`(function(){
        if(!('IntersectionObserver' in window)) return; if(CSS && CSS.supports && CSS.supports('animation-timeline: view()')) return;
        var cards=[].slice.call(document.querySelectorAll('.right-rail-card'));
        var io=new IntersectionObserver(function(entries){ entries.forEach(function(e){ if(e.isIntersecting){ var el=e.target; el.classList.add('in'); el.style.transition='transform 260ms cubic-bezier(.16,.84,.44,1),opacity 260ms ease-out'; el.style.transform='translateX(0)'; el.style.opacity='1'; var cap=el.querySelector('.card-caption'); if(cap){ cap.style.transition='transform 300ms cubic-bezier(.16,.84,.44,1) 60ms,opacity 300ms ease-out 60ms'; cap.style.transform='translateX(0) translateY(0)'; cap.style.opacity='1'; } io.unobserve(el);} }); },{threshold:0.15});
        cards.forEach(function(c){ io.observe(c); });
      })();`}} />
    </div>
  );
}
