"use client";

import type { ReactNode } from 'react';
import { useTranslation } from '@/hooks/useTranslation';

interface ContactSectionProps {
  locale: string;
}

interface ContactItem {
  label: string;
  value: ReactNode;
  href: string;
  icon: string;
}

export default function ContactSection({ locale }: ContactSectionProps) {
  const { t } = useTranslation(locale);

  const translations = {
    contactUs: t.contact?.title ?? 'Contact Us',
    followUs: t.contact?.followUs ?? 'Follow Us',
    address: t.contact?.address ?? 'Address',
    phone: t.contact?.phone ?? 'Phone',
    email: t.contact?.email ?? 'Email',
    connectWithUs: t.contact?.connectWithUs ?? 'Connect with us',
    description: t.contact?.description ?? '',
    streetCity: t.contact?.streetCity ?? 'Archimidous 21 Kalamata',
    countryPostal: t.contact?.countryPostal ?? 'Greece 24100',
  };

  const contactItems: ContactItem[] = [
    {
      label: translations.address,
      value: (
        <>
          {translations.streetCity}
          <br />
          {translations.countryPostal}
        </>
      ),
      href: 'https://maps.app.goo.gl/9vqnjXJqQeakxdBx8',
      icon: 'MAP',
    },
    {
      label: translations.phone,
      value: '+30 695 581 0051',
      href: 'tel:+306955810051',
      icon: 'TEL',
    },
    {
      label: translations.email,
      value: 'dolcefarnienteapartments@gmail.com',
      href: 'mailto:dolcefarnienteapartments@gmail.com',
      icon: 'MAIL',
    },
  ];

  return (
    <section className="contact-section" aria-labelledby="contact-section-title">
      <div className="contact-section-inner">
        <div className="contact-panel">
          <h2 id="contact-section-title" className="contact-panel-title">
            {translations.contactUs}
          </h2>
          <ul className="contact-list">
            {contactItems.map((item) => (
              <li key={item.href} className="contact-row">
                <span className="contact-row-icon" aria-hidden>
                  {item.icon}
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
              <span aria-hidden className="contact-row-icon">IG</span>
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
