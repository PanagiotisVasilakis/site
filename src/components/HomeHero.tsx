"use client";

interface HomeHeroProps {
  title: string;
  subtitle: string;
}

export default function HomeHero({ title, subtitle }: HomeHeroProps) {
  return (
    <div className="relative mb-10 overflow-hidden rounded-2xl panel hero-card backdrop-blur px-6 sm:px-10 pt-12 pb-14 bg-panel-soft">
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        <div className="absolute -top-32 -right-32 w-96 h-96 blur-3xl opacity-70" style={{ background: 'radial-gradient(circle at 30% 30%, rgba(54,185,171,0.28), rgba(54,185,171,0) 70%)' }} />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(46,196,182,0.18),rgba(255,255,255,0))]" />
      </div>
      <div className="relative z-10 max-w-2xl mx-auto text-center">
        <h1 className="display-serif italian-title title-gradient title-ornament text-[clamp(2.5rem,7vw,5rem)] leading-tight tracking-tight whitespace-nowrap px-4 pb-3">
          <span className="inline-block max-w-full overflow-hidden text-ellipsis">{title}</span>
        </h1>
        <p className="mt-4 text-base sm:text-lg text-muted leading-relaxed">
          {subtitle}
        </p>
      </div>
    </div>
  );
}
