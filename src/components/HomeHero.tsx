"use client";

interface HomeHeroProps {
  title: string;
  subtitle: string;
}

export default function HomeHero({ title, subtitle }: HomeHeroProps) {
  return (
    <div className="relative overflow-hidden min-h-screen">
      {/* Background Image - Full width, edge to edge */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat hero-background-image"
      />

      {/* Light overlay for sunny effect - adjusted for both themes */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/15 via-transparent to-black/25" />

      {/* Floating particles effect - visible in both themes */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
        <div className="absolute w-2 h-2 bg-gradient-to-br from-yellow-300/60 to-orange-200/40 rounded-full blur-sm animate-float shadow-lg shadow-yellow-300/30" style={{top: '15%', left: '10%', animationDelay: '0s', animationDuration: '8s'}} />
        <div className="absolute w-1 h-1 bg-gradient-to-br from-orange-200/70 to-yellow-400/50 rounded-full blur-sm animate-float shadow-md shadow-orange-200/25" style={{top: '60%', left: '85%', animationDelay: '2s', animationDuration: '10s'}} />
        <div className="absolute w-1.5 h-1.5 bg-gradient-to-br from-yellow-400/55 to-orange-300/45 rounded-full blur-sm animate-float shadow-lg shadow-yellow-400/30" style={{top: '80%', left: '20%', animationDelay: '4s', animationDuration: '12s'}} />
        <div className="absolute w-1 h-1 bg-gradient-to-br from-orange-300/65 to-yellow-200/45 rounded-full blur-sm animate-float shadow-md shadow-orange-300/28" style={{top: '25%', right: '15%', animationDelay: '1s', animationDuration: '9s'}} />
        <div className="absolute w-0.5 h-0.5 bg-yellow-300/80 rounded-full blur-[1px] animate-float" style={{top: '45%', left: '70%', animationDelay: '3s', animationDuration: '11s'}} />
        <div className="absolute w-1.5 h-1.5 bg-gradient-to-br from-orange-200/50 to-yellow-400/40 rounded-full blur-sm animate-float shadow-sm shadow-orange-200/20" style={{top: '35%', left: '5%', animationDelay: '5s', animationDuration: '13s'}} />
      </div>

      <div className="relative z-10 flex items-center justify-center min-h-screen px-6 sm:px-10 py-12">
        <div className="text-center max-w-4xl mx-auto">
          <h1 className="display-serif italian-title title-gradient title-ornament leading-tight tracking-tight whitespace-nowrap px-4 pb-3 mb-6" style={{ fontSize: 'clamp(2.5rem, 6vw, 5rem)' }}>
            <span className="inline-block drop-shadow-2xl">{title}</span>
          </h1>
          <p className="mt-4 text-base sm:text-lg text-white leading-relaxed drop-shadow-lg max-w-2xl mx-auto px-4" style={{textShadow: '0 2px 4px rgba(0,0,0,0.5)'}}>
            {subtitle}
          </p>
        </div>
      </div>
    </div>
  );
}
