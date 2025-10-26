"use client";

import { useState, useEffect } from 'react';

interface ContactSectionProps {
  locale: string;
}

export default function ContactSection({ locale }: ContactSectionProps) {
  const isGreek = locale === 'el';
  
  const translations = {
    contactUs: isGreek ? 'Επικοινωνήστε μαζί μας' : 'Contact Us',
    followUs: isGreek ? 'Ακολουθήστε μας' : 'Follow Us',
    address: isGreek ? 'Διεύθυνση' : 'Address',
    phone: isGreek ? 'Τηλέφωνο' : 'Phone',
    email: isGreek ? 'Email' : 'Email',
    connectWithUs: isGreek ? 'Συνδεθείτε μαζί μας' : 'Connect with us',
    description: isGreek 
      ? 'Μείνετε συνδεδεμένοι και ακολουθήστε το ταξίδι μας μέσα από την όμορφη Καλαμάτα. Ανακαλύψτε νέους τόπους και ζήστε εμπνευσμένες στιγμές σε ένα ευρύχωρο διαμέρισμα με μεγάλες ηλιόλουστες βεράντες και υπέροχη θέα, σε μια ήσυχη γειτονιά κοντά στο κέντρο της πόλης (13\' με τα πόδια, 4\' με αυτοκίνητο).'
      : 'Stay connected and follow our journey through the beautiful Kalamata. Discover new places and live inspirational moments on a spacious apartment with large sunny terraces and beautiful views, in a quiet neighborhood near the City Center (13 min by walk, 4 min by car).',
    streetCity: isGreek ? 'Αρχιμήδους 21 Καλαμάτα' : 'Archimidous 21 Kalamata',
    countryPostal: isGreek ? 'Ελλάδα 24100' : 'Greece 24100'
  };

  const socialLinks = [
    { name: 'Instagram', icon: '📷', url: 'https://www.instagram.com/dolcefarniente_kalamata?igsh=MWlzNHlucjQ3NDBwMA==', color: 'hover:text-pink-500' },
  ];

  // Reactive theme detection
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    // Initial theme check
    const checkTheme = () => {
      const darkMode = document.documentElement.getAttribute('data-theme') === 'dark' || 
                      window.matchMedia('(prefers-color-scheme: dark)').matches;
      setIsDarkMode(darkMode);
    };

    // Check theme on mount
    checkTheme();

    // Listen for theme changes
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'data-theme') {
          checkTheme();
        }
      });
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme']
    });

    // Also listen for system preference changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => checkTheme();
    mediaQuery.addEventListener('change', handleChange);

    return () => {
      observer.disconnect();
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  if (isDarkMode) {
    return (
      <section className="relative w-full px-4 py-6 overflow-hidden rounded-3xl transition-all duration-700 ease-in-out"
               style={{
                 background: 'linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 25%, #1f1f1f 50%, #252525 75%, #1e1e1e 100%)',
                 boxShadow: '0 20px 40px -12px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.05) inset, 0 0 80px rgba(59, 130, 246, 0.05) inset'
               }}>
        {/* Decorative wave pattern overlay */}
        <div className="absolute inset-0 opacity-3">
          <svg className="w-full h-full" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice">
            <defs>
              <pattern id="wavePattern" x="0" y="0" width="150" height="150" patternUnits="userSpaceOnUse">
                <path d="M0,75 Q37.5,37.5 75,75 T150,75 V150 H0 Z" fill="currentColor" opacity="0.2"/>
                <path d="M0,90 Q37.5,52.5 75,90 T150,90 V150 H0 Z" fill="currentColor" opacity="0.1"/>
                <circle cx="75" cy="75" r="2" fill="currentColor" opacity="0.15"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#wavePattern)"/>
          </svg>
        </div>

        {/* Floating geometric shapes */}
        <div className="absolute top-16 left-8 w-24 h-24 opacity-6 animate-pulse" style={{animationDuration: '4s'}}>
          <svg viewBox="0 0 100 100" className="w-full h-full text-gray-400">
            <polygon points="50,5 90,25 90,75 50,95 10,75 10,25" fill="currentColor"/>
          </svg>
        </div>
        <div className="absolute bottom-16 right-8 w-20 h-20 opacity-4 animate-pulse" style={{animationDuration: '6s'}}>
          <svg viewBox="0 0 100 100" className="w-full h-full text-gray-500">
            <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="2"/>
            <circle cx="50" cy="50" r="30" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.5"/>
          </svg>
        </div>

        {/* Olive branch decorative element */}
        <div className="absolute top-6 right-6 opacity-8 text-gray-600 animate-pulse" aria-hidden style={{animationDuration: '8s'}}>
          <svg width="100" height="70" viewBox="0 0 140 100" className="drop-shadow-lg">
            <path d="M20,80 Q35,55 50,70 Q65,50 80,65 Q95,40 110,55 Q125,30 140,45"
                  stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.4"/>
            <circle cx="30" cy="60" r="4" fill="currentColor" opacity="0.5"/>
            <circle cx="55" cy="45" r="3" fill="currentColor" opacity="0.4"/>
            <circle cx="80" cy="35" r="3" fill="currentColor" opacity="0.3"/>
            <circle cx="105" cy="25" r="2" fill="currentColor" opacity="0.2"/>
            <circle cx="125" cy="20" r="2" fill="currentColor" opacity="0.1"/>
          </svg>
        </div>

        <div className="relative z-10 py-6 md:py-8">
          {/* Headings Row - Only visible on medium screens and up */}
          <div className="hidden md:grid md:grid-cols-2 gap-8 mb-6">
            <div className="text-center group">
              <h2 className="text-3xl md:text-4xl font-serif italic font-bold text-white mb-4 tracking-wider group-hover:scale-105 transition-transform duration-500">
                {translations.contactUs}
              </h2>
              <div className="w-20 h-1 bg-gradient-to-r from-transparent via-gray-400 to-transparent mx-auto rounded-full"></div>
            </div>
            <div className="text-center group">
              <h2 className="text-3xl md:text-4xl font-serif italic font-bold text-white mb-4 tracking-wider group-hover:scale-105 transition-transform duration-500">
                {translations.followUs}
              </h2>
              <div className="w-20 h-1 bg-gradient-to-r from-transparent via-gray-400 to-transparent mx-auto rounded-full"></div>
            </div>
          </div>

          {/* Content Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Contact Us Content */}
          <div className="backdrop-blur-sm bg-white/5 rounded-2xl p-6 border border-white/10 shadow-2xl">
            <div className="text-center mb-6 block md:hidden">
              <h2 className="text-2xl md:text-3xl font-serif italic font-bold text-white mb-2 tracking-wider">
                {translations.contactUs}
              </h2>
              <div className="w-16 h-0.5 bg-gradient-to-r from-transparent via-gray-400 to-transparent mx-auto rounded-full"></div>
            </div>
            <div className="space-y-4 text-center">
              <div className="flex flex-col items-center space-y-3">
                <div className="group flex items-start space-x-4 w-full max-w-xs">
                  <div className="text-3xl group-hover:scale-110 transition-transform duration-200 flex-shrink-0">📍</div>
                  <div className="text-left flex-1">
                    <h3 className="font-serif italic font-medium text-white mb-1 text-base">
                      {translations.address}
                    </h3>
                    <a href="https://maps.app.goo.gl/9vqnjXJqQeakxdBx8" target="_blank" rel="noopener noreferrer" className="text-white/80 hover:text-white transition-colors text-xs block">
                      {translations.streetCity}<br/>
                      {translations.countryPostal}
                    </a>
                  </div>
                </div>

                <div className="group flex items-start space-x-4 w-full max-w-xs">
                  <div className="text-3xl group-hover:scale-110 transition-transform duration-200 flex-shrink-0">📞</div>
                  <div className="text-left flex-1">
                    <h3 className="font-serif italic font-medium text-white mb-1 text-base">
                      {translations.phone}
                    </h3>
                    <a href="tel:+306955810051" className="text-white/80 hover:text-white transition-colors text-xs">
                      +30 695 581 0051
                    </a>
                  </div>
                </div>

                <div className="group flex items-start space-x-4 w-full max-w-xs">
                  <div className="text-3xl group-hover:scale-110 transition-transform duration-200 flex-shrink-0">✉️</div>
                  <div className="text-left flex-1">
                    <h3 className="font-serif italic font-medium text-white mb-1 text-base">
                      {translations.email}
                    </h3>
                    <a href="mailto:dolcefarnienteapartments@gmail.com" className="text-white/80 hover:text-white transition-colors text-xs">
                      dolcefarnienteapartments@gmail.com
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>            {/* Follow Us Content */}
            <div className="backdrop-blur-sm bg-white/5 rounded-2xl p-6 border border-white/10 shadow-2xl">
              <div className="text-center mb-6 block md:hidden">
                <h2 className="text-2xl md:text-3xl font-serif italic font-bold text-white mb-2 tracking-wider">
                  {translations.followUs}
                </h2>
                <div className="w-16 h-0.5 bg-gradient-to-r from-transparent via-gray-400 to-transparent mx-auto rounded-full"></div>
              </div>
              <div className="space-y-4 text-center">
                <p className="text-white/90 leading-relaxed text-sm italic">
                  {translations.description}
                </p>

                {/* Social Media Links */}
                <div className="space-y-3">
                  <h3 className="text-xl font-serif italic font-medium text-white tracking-wide">{translations.connectWithUs}</h3>
                  <div className="flex flex-col items-center gap-2">
                    {socialLinks.map((social) => (
                      <a
                        key={social.name}
                        href={social.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex items-center justify-between w-full max-w-xs p-4 bg-gradient-to-r from-gray-800/50 to-gray-700/30 border border-gray-600/30 rounded-2xl hover:from-gray-700/60 hover:to-gray-600/40 transition-all duration-500 transform hover:scale-105 hover:shadow-2xl backdrop-blur-sm"
                      >
                        <div className="flex items-center space-x-3">
                          <div className="text-3xl group-hover:scale-125 transition-transform duration-300">
                            {social.icon}
                          </div>
                          <div className="text-left">
                            <div className="text-white font-semibold group-hover:text-white transition-colors text-base">
                              {social.name}
                            </div>
                            <div className="text-white/70 text-xs">
                              @{social.name.toLowerCase()}/dolcefar niente
                            </div>
                          </div>
                        </div>
                        <div className="text-gray-400 group-hover:text-gray-300 transition-all duration-300 group-hover:translate-x-1">
                          →
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  // Light mode version
  return (
    <section className="relative w-full px-4 py-6 overflow-hidden rounded-3xl transition-all duration-700 ease-in-out"
             style={{
               background: 'linear-gradient(135deg, #ffffff 0%, #faf8f5 25%, #f7f9f9 50%, #f0f4f4 75%, #e9f8f5 100%)',
               boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0, 0, 0, 0.05) inset, 0 0 100px rgba(54, 185, 171, 0.08) inset'
             }}>
      {/* Decorative wave pattern overlay */}
      <div className="absolute inset-0 opacity-3">
        <svg className="w-full h-full" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice">
          <defs>
            <pattern id="wavePatternLight" x="0" y="0" width="150" height="150" patternUnits="userSpaceOnUse">
              <path d="M0,75 Q37.5,37.5 75,75 T150,75 V150 H0 Z" fill="currentColor" opacity="0.2"/>
              <path d="M0,90 Q37.5,52.5 75,90 T150,90 V150 H0 Z" fill="currentColor" opacity="0.1"/>
              <circle cx="75" cy="75" r="2" fill="currentColor" opacity="0.15"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#wavePatternLight)"/>
        </svg>
      </div>

      {/* Floating geometric shapes */}
      <div className="absolute top-16 left-8 w-24 h-24 opacity-6 animate-pulse text-slate-400" style={{animationDuration: '4s'}}>
        <svg viewBox="0 0 100 100" className="w-full h-full">
          <polygon points="50,5 90,25 90,75 50,95 10,75 10,25" fill="currentColor"/>
        </svg>
      </div>
      <div className="absolute bottom-16 right-8 w-20 h-20 opacity-4 animate-pulse text-slate-400" style={{animationDuration: '6s'}}>
        <svg viewBox="0 0 100 100" className="w-full h-full">
          <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="2"/>
          <circle cx="50" cy="50" r="30" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.5"/>
        </svg>
      </div>

      {/* Olive branch decorative element */}
      <div className="absolute top-6 right-6 opacity-8 text-slate-500 animate-pulse" aria-hidden style={{animationDuration: '8s'}}>
        <svg width="100" height="70" viewBox="0 0 140 100" className="drop-shadow-lg">
          <path d="M20,80 Q35,55 50,70 Q65,50 80,65 Q95,40 110,55 Q125,30 140,45"
                stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.6"/>
          <circle cx="30" cy="60" r="4" fill="currentColor" opacity="0.7"/>
          <circle cx="55" cy="45" r="3" fill="currentColor" opacity="0.6"/>
          <circle cx="80" cy="35" r="3" fill="currentColor" opacity="0.5"/>
          <circle cx="105" cy="25" r="2" fill="currentColor" opacity="0.4"/>
          <circle cx="125" cy="20" r="2" fill="currentColor" opacity="0.3"/>
        </svg>
      </div>

      <div className="relative z-10 py-6 md:py-8">
        {/* Headings Row - Only visible on medium screens and up */}
        <div className="hidden md:grid md:grid-cols-2 gap-8 mb-6">
          <div className="text-center group">
            <h2 className="text-3xl md:text-4xl font-serif italic font-bold text-slate-800 mb-4 tracking-wider group-hover:scale-105 transition-transform duration-500">
              {translations.contactUs}
            </h2>
            <div className="w-20 h-1 bg-gradient-to-r from-transparent via-slate-400 to-transparent mx-auto rounded-full"></div>
          </div>
          <div className="text-center group">
            <h2 className="text-3xl md:text-4xl font-serif italic font-bold text-slate-800 mb-4 tracking-wider group-hover:scale-105 transition-transform duration-500">
              {translations.followUs}
            </h2>
            <div className="w-20 h-1 bg-gradient-to-r from-transparent via-slate-400 to-transparent mx-auto rounded-full"></div>
          </div>
        </div>

        {/* Content Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Contact Us Content */}
          <div className="backdrop-blur-sm bg-white/70 rounded-2xl p-6 border border-slate-200/50 shadow-xl">
            <div className="text-center mb-6 block md:hidden">
              <h2 className="text-2xl md:text-3xl font-serif italic font-bold text-slate-800 mb-2 tracking-wider">
                {translations.contactUs}
              </h2>
              <div className="w-16 h-0.5 bg-gradient-to-r from-transparent via-slate-400 to-transparent mx-auto rounded-full"></div>
            </div>
            <div className="space-y-4 text-center">
              <div className="flex flex-col items-center space-y-3">
                <div className="group flex items-start space-x-4 w-full max-w-xs">
                  <div className="text-3xl group-hover:scale-110 transition-transform duration-200 flex-shrink-0">📍</div>
                  <div className="text-left flex-1">
                    <h3 className="font-serif italic font-medium text-slate-700 mb-1 text-base">{translations.address}</h3>
                    <a href="https://maps.app.goo.gl/9vqnjXJqQeakxdBx8" target="_blank" rel="noopener noreferrer" className="text-slate-600 hover:text-slate-800 transition-colors text-xs block">
                      {translations.streetCity}<br/>
                      {translations.countryPostal}
                    </a>
                  </div>
                </div>

                <div className="group flex items-start space-x-4 w-full max-w-xs">
                  <div className="text-3xl group-hover:scale-110 transition-transform duration-200 flex-shrink-0">📞</div>
                  <div className="text-left flex-1">
                    <h3 className="font-serif italic font-medium text-slate-700 mb-1 text-base">{translations.phone}</h3>
                    <a href="tel:+306955810051" className="text-slate-600 hover:text-slate-800 transition-colors text-xs">
                      +30 695 581 0051
                    </a>
                  </div>
                </div>

                <div className="group flex items-start space-x-4 w-full max-w-xs">
                  <div className="text-3xl group-hover:scale-110 transition-transform duration-200 flex-shrink-0">✉️</div>
                  <div className="text-left flex-1">
                    <h3 className="font-serif italic font-medium text-slate-700 mb-1 text-base">{translations.email}</h3>
                    <a href="mailto:dolcefarnienteapartments@gmail.com" className="text-slate-600 hover:text-slate-800 transition-colors text-xs">
                      dolcefarnienteapartments@gmail.com
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Follow Us Content */}
          <div className="backdrop-blur-sm bg-white/70 rounded-2xl p-6 border border-slate-200/50 shadow-xl">
            <div className="text-center mb-6 block md:hidden">
              <h2 className="text-2xl md:text-3xl font-serif italic font-bold text-slate-800 mb-2 tracking-wider">
                {translations.followUs}
              </h2>
              <div className="w-16 h-0.5 bg-gradient-to-r from-transparent via-slate-400 to-transparent mx-auto rounded-full"></div>
            </div>
            <div className="space-y-4 text-center">
              <p className="text-slate-700 leading-relaxed text-sm italic">
                {translations.description}
              </p>

              {/* Social Media Links */}
              <div className="space-y-3">
                <h3 className="text-xl font-serif italic font-medium text-slate-800 tracking-wide">{translations.connectWithUs}</h3>
                <div className="flex flex-col items-center gap-2">
                  {socialLinks.map((social) => (
                    <a
                      key={social.name}
                      href={social.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-center justify-between w-full max-w-xs p-4 bg-gradient-to-r from-slate-50 to-white border border-slate-200/60 rounded-2xl hover:from-white hover:to-slate-50 transition-all duration-500 transform hover:scale-105 hover:shadow-xl backdrop-blur-sm"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="text-3xl group-hover:scale-125 transition-transform duration-300">
                          {social.icon}
                        </div>
                        <div className="text-left">
                          <div className="text-slate-700 font-semibold group-hover:text-slate-800 transition-colors text-base">
                            {social.name}
                          </div>
                          <div className="text-slate-500 text-xs">
                            @{social.name.toLowerCase()}/dolcefarniente_kalamata
                          </div>
                        </div>
                      </div>
                      <div className="text-slate-400 group-hover:text-slate-600 transition-all duration-300 group-hover:translate-x-1">
                        →
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}