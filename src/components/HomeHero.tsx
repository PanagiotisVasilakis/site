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
          src="/house/balcony/balcony_1_hero.webp"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
          draggable={false}
        />
      </div>

      {/* Light overlay for sunny effect - adjusted for both themes */}
      <div className="absolute inset-0 z-[1] bg-gradient-to-b from-black/10 via-transparent to-black/15 dark:bg-black/20 dark:from-black/60 dark:via-transparent dark:to-black/60" />

      <div className="relative z-10 flex items-center justify-center min-h-svh bg-transparent px-6 sm:px-10 py-12">
        <div className="relative text-center max-w-4xl mx-auto">
          <h1 className="display-serif italian-title title-gradient title-ornament leading-tight tracking-tight whitespace-nowrap px-4 pb-3 mb-6" style={{ fontSize: 'clamp(3rem, 8vw, 6rem)' }}>
            <span className="inline-block drop-shadow-2xl">{title}</span>
          </h1>
          <p className="mt-4 text-lg sm:text-xl text-black leading-relaxed max-w-2xl mx-auto px-4 font-medium home-subtitle drop-shadow-md">
            {subtitle}
          </p>
        </div>
      </div>
    </div>
  );
}
