import Link from "next/link";

export interface HomeFeature {
  href: string;
  label: string;
  icon: string;
}

interface HomeFeatureGridProps {
  features: HomeFeature[];
  label: string;
}

export default function HomeFeatureGrid({ features, label }: HomeFeatureGridProps) {
  return (
    <section className="home-feature-grid" aria-label={label}>
      {features.map((feature) => (
        <Link key={feature.href} href={feature.href} className="home-feature-card group">
          <span className="home-feature-icon" aria-hidden>
            {feature.icon}
          </span>
          <span className="home-feature-label">{feature.label}</span>
        </Link>
      ))}
    </section>
  );
}
