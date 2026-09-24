import Link from "next/link";

export interface HomeFeature {
  href: string;
  label: string;
}

interface HomeFeatureGridProps {
  features: HomeFeature[];
  label: string;
}

type FeatureIconName = 'home' | 'check' | 'phone' | 'moments';

function getFeatureIconName(feature: HomeFeature): FeatureIconName {
  if (feature.href.includes('/check-in')) return 'check';
  if (feature.href.includes('phones')) return 'phone';
  if (feature.href.includes('moments')) return 'moments';
  return 'home';
}

function FeatureIcon({ name }: { name: FeatureIconName }) {
  const common = {
    width: 24,
    height: 24,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.9,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    focusable: false,
  };

  if (name === 'check') {
    return (
      <svg {...common} aria-hidden>
        <rect x="4" y="4" width="16" height="16" rx="4" />
        <path d="M8.2 12.2l2.6 2.6 5-5.6" />
      </svg>
    );
  }

  if (name === 'phone') {
    return (
      <svg {...common} aria-hidden>
        <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />
      </svg>
    );
  }

  if (name === 'moments') {
    return (
      <svg {...common} aria-hidden>
        <path d="M12 21s7-4.7 7-11a7 7 0 0 0-14 0c0 6.3 7 11 7 11z" />
        <circle cx="12" cy="10" r="2.5" />
      </svg>
    );
  }

  return (
    <svg {...common} aria-hidden>
      <path d="M3 11.5L12 4l9 7.5" />
      <path d="M5.5 10.5V20h13v-9.5" />
      <path d="M9.5 20v-5h5v5" />
    </svg>
  );
}

export default function HomeFeatureGrid({ features, label }: HomeFeatureGridProps) {
  return (
    <section className="home-feature-grid" aria-label={label}>
      {features.map((feature) => (
        <Link key={feature.href} href={feature.href} className="home-feature-card group">
          <span className="home-feature-icon" aria-hidden>
            <FeatureIcon name={getFeatureIconName(feature)} />
          </span>
          <span className="home-feature-label">{feature.label}</span>
        </Link>
      ))}
    </section>
  );
}
