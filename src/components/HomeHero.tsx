import Image from 'next/image';

interface HomeHeroProps {
  title: string;
  subtitle: string;
}

export default function HomeHero({ title, subtitle }: HomeHeroProps) {
  return (
    <section
      className="relative isolate overflow-hidden bg-black"
      aria-label={title}
      style={{ minHeight: 'min(760px, 88svh)' }}
    >
      <picture className="absolute inset-0 z-0 block" aria-hidden>
        <source media="(max-width: 767px)" srcSet="/house/balcony/balcony_1_hero_720.webp" />
        <source media="(max-width: 1599px)" srcSet="/house/balcony/balcony_1_hero_1440.webp" />
        <Image
          src="/house/balcony/balcony_1_hero.webp"
          alt=""
          fill
          loading="eager"
          fetchPriority="high"
          unoptimized
          sizes="100vw"
          className="object-cover object-center"
          draggable={false}
        />
      </picture>

      <div className="absolute inset-0 z-[1] bg-[linear-gradient(180deg,rgba(0,0,0,0.48)_0%,rgba(0,0,0,0.24)_48%,rgba(0,0,0,0.46)_100%)]" />

      <div
        className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-center px-5 py-24 text-center sm:px-8 lg:px-10"
        style={{ minHeight: 'min(760px, 88svh)' }}
      >
        <div className="max-w-4xl">
          <h1 className="font-serif text-4xl font-semibold italic leading-tight text-white drop-shadow-2xl sm:text-5xl md:text-6xl lg:text-7xl">
            {title}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-white/90 drop-shadow sm:text-lg md:text-xl">
            {subtitle}
          </p>
        </div>
      </div>
    </section>
  );
}
