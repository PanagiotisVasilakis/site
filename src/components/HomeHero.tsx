"use client";

import Image from 'next/image';

interface HomeHeroProps {
  title: string;
  subtitle: string;
}

export default function HomeHero({ title, subtitle }: HomeHeroProps) {
  return (
    <div className="relative overflow-hidden min-h-svh bg-transparent">
      {/* Background Image - Full width, edge to edge */}
      <div className="absolute inset-0 z-0" aria-hidden>
        <Image
          src="/house/balcony/balcony_1.jpeg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
          draggable={false}
        />
      </div>

      {/* Light overlay for sunny effect - adjusted for both themes */}
      <div className="absolute inset-0 z-[1] bg-gradient-to-b from-black/10 via-transparent to-black/15 dark:from-black/20 dark:via-transparent dark:to-black/30" />

      {/* Floating particles effect - visible in both themes */}
      <div className="absolute inset-0 z-[2] pointer-events-none overflow-hidden" aria-hidden>
        <div className="absolute w-2 h-2 bg-gradient-to-br from-yellow-300/60 to-orange-200/40 rounded-full blur-sm animate-float shadow-lg shadow-yellow-300/30" style={{top: '15%', left: '10%', animationDelay: '0s', animationDuration: '8s'}} />
        <div className="absolute w-1 h-1 bg-gradient-to-br from-orange-200/70 to-yellow-400/50 rounded-full blur-sm animate-float shadow-md shadow-orange-200/25" style={{top: '60%', left: '85%', animationDelay: '2s', animationDuration: '10s'}} />
        <div className="absolute w-1.5 h-1.5 bg-gradient-to-br from-yellow-400/55 to-orange-300/45 rounded-full blur-sm animate-float shadow-lg shadow-yellow-400/30" style={{top: '80%', left: '20%', animationDelay: '4s', animationDuration: '12s'}} />
        <div className="absolute w-1 h-1 bg-gradient-to-br from-orange-300/65 to-yellow-200/45 rounded-full blur-sm animate-float shadow-md shadow-orange-300/28" style={{top: '25%', right: '15%', animationDelay: '1s', animationDuration: '9s'}} />
        <div className="absolute w-0.5 h-0.5 bg-yellow-300/80 rounded-full blur-[1px] animate-float" style={{top: '45%', left: '70%', animationDelay: '3s', animationDuration: '11s'}} />
        <div className="absolute w-1.5 h-1.5 bg-gradient-to-br from-orange-200/50 to-yellow-400/40 rounded-full blur-sm animate-float shadow-sm shadow-orange-200/20" style={{top: '35%', left: '5%', animationDelay: '5s', animationDuration: '13s'}} />
      </div>

      <div className="relative z-10 flex items-center justify-center min-h-svh bg-transparent px-6 sm:px-10 py-12">
        <div className="text-center max-w-4xl mx-auto">
          <h1 className="display-serif italian-title title-gradient title-ornament leading-tight tracking-tight whitespace-nowrap px-4 pb-3 mb-6" style={{ fontSize: 'clamp(3rem, 8vw, 6rem)' }}>
            <span className="inline-block drop-shadow-2xl">{title}</span>
          </h1>
          <p className="mt-4 text-lg sm:text-xl text-black leading-relaxed max-w-2xl mx-auto px-4 font-medium home-subtitle" style={{textShadow: '0 2px 4px rgba(0,0,0,0.3), 0 4px 8px rgba(0,0,0,0.2), 0 8px 16px rgba(0,0,0,0.1), 0 16px 32px rgba(0,0,0,0.05)'}}>
            {subtitle}
          </p>
        </div>
      </div>
    </div>
  );
}
