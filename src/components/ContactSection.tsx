"use client";

import type { ReactNode } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { getApartmentMapLocation } from '@/data/mapLocations';

interface ContactSectionProps {
  locale: string;
}

interface ContactItem {
  label: string;
  value: ReactNode;
  href: string;
  icon: ContactIconName;
}

type ContactIconName = 'map' | 'phone' | 'mail' | 'instagram';

function ContactIcon({ name }: { name: ContactIconName }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.9,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    focusable: false,
  };

  if (name === 'map') {
    return (
      <svg {...common} aria-hidden>
        <path d="M9 18l-6 3V6l6-3 6 3 6-3v15l-6 3-6-3z" />
        <path d="M9 3v15" />
        <path d="M15 6v15" />
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

  if (name === 'mail') {
    return (
      <svg {...common} aria-hidden>
        <rect x="3" y="5" width="18" height="14" rx="3" />
        <path d="M4 7l8 6 8-6" />
      </svg>
    );
  }

  return (
    <svg {...common} aria-hidden>
      <rect x="4" y="4" width="16" height="16" rx="5" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="M17.5 6.8h.01" />
    </svg>
  );
}

export default function ContactSection({ locale }: ContactSectionProps) {
  const { t } = useTranslation(locale);
  const isGreek = locale === 'el';
  const apartmentLocation = getApartmentMapLocation(locale === 'el' ? 'el' : 'en');

  const translations = {
    contactUs: t.contact?.title ?? 'Contact Us',
    followUs: t.contact?.followUs ?? 'Follow Us',
    address: t.contact?.address ?? (isGreek ? 'Διεύθυνση' : 'Address'),
    phone: t.contact?.phone ?? 'Phone',
    email: t.contact?.email ?? 'Email',
    connectWithUs: t.contact?.connectWithUs ?? 'Connect with us',
    description: t.contact?.description ?? '',
    streetCity: t.contact?.streetCity ?? 'Archimidous 21 Kalamata',
    countryPostal: t.contact?.countryPostal ?? 'Greece 24100',
  };
  const addressParts = (apartmentLocation.address ?? `${translations.streetCity}, ${translations.countryPostal}`)
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);

  const contactItems: ContactItem[] = [
    {
      label: translations.address,
      value: (
        <>
          {addressParts[0] ?? translations.streetCity}
          <br />
          {addressParts.slice(1).join(', ') || translations.countryPostal}
        </>
      ),
      href: apartmentLocation.directionsUrl || 'https://maps.app.goo.gl/wW1Lnh14k3psKGAm9',
      icon: 'map',
    },
    {
      label: translations.phone,
      value: apartmentLocation.phone || '+30 695 581 0051',
      href: `tel:${(apartmentLocation.phone || '+30 695 581 0051').replace(/[^+0-9]/g, '')}`,
      icon: 'phone',
    },
    {
      label: translations.email,
      value: 'dolcefarnienteapartments@gmail.com',
      href: 'mailto:dolcefarnienteapartments@gmail.com',
      icon: 'mail',
    },
  ];

  return (
    <section id="contact" className="contact-section" aria-labelledby="contact-section-title">
      <div className="contact-section-inner">
        <div className="contact-panel">
          <h2 id="contact-section-title" className="contact-panel-title">
            {translations.contactUs}
          </h2>
          <ul className="contact-list">
            {contactItems.map((item) => (
              <li key={item.href} className="contact-row">
                <span className="contact-row-icon" aria-hidden>
                  <ContactIcon name={item.icon} />
                </span>
                <div className="min-w-0">
                  <h3 className="contact-row-label">{item.label}</h3>
                  <a
                    href={item.href}
                    target={item.href.startsWith('http') ? '_blank' : undefined}
                    rel={item.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                    className="contact-link"
                  >
                    {item.value}
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="contact-panel">
          <h2 className="contact-panel-title">{translations.followUs}</h2>
          {translations.description && (
            <p className="contact-description">{translations.description}</p>
          )}
          <div className="contact-social">
            <h3 className="contact-row-label">{translations.connectWithUs}</h3>
            <a
              href="https://www.instagram.com/dolcefarniente_kalamata?igsh=MWlzNHlucjQ3NDBwMA=="
              target="_blank"
              rel="noopener noreferrer"
              className="contact-social-link"
            >
              <span aria-hidden className="contact-row-icon">
                <ContactIcon name="instagram" />
              </span>
              <span className="min-w-0">
                <span className="contact-social-name">Instagram</span>
                <span className="contact-social-handle">@dolcefarniente_kalamata</span>
              </span>
              <span aria-hidden className="contact-social-arrow">→</span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
