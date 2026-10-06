import type { Metadata, Viewport } from "next";
import "./globals.css";
import { headers } from 'next/headers';
import { normalizeLocale } from '@/i18n/config';
import { BRAND_NAME } from '@/data/brand';
import { displayGreek, displayLatin, textGreek, textLatin } from './fonts/fonts';

const fontVariables = [textLatin, textGreek, displayLatin, displayGreek].map((font) => font.variable).join(' ');

export const metadata: Metadata = {
  // Pages set only their own title; the template appends the brand. A segment that sets a plain
  // string title clears the template for its children, so layouts below set no title.
  title: { default: BRAND_NAME, template: `%s | ${BRAND_NAME}` },
  manifest: "/app.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
  },
  appleWebApp: {
    capable: true,
    title: BRAND_NAME,
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  // identity §3.2: the bg token of each theme.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F6F0E6' },
    { media: '(prefers-color-scheme: dark)', color: '#0A1A21' },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const requestHeaders = await headers();
  const locale = normalizeLocale(requestHeaders.get('x-locale'));
  const nonce = requestHeaders.get('x-nonce') ?? undefined;
  return (
    <html lang={locale} className={fontVariables} suppressHydrationWarning>
      <head>
        <script
          nonce={nonce}
          // Browsers intentionally hide a nonce value from DOM attribute reads.
          // React would otherwise compare the server nonce with an empty client
          // attribute and report a false hydration mismatch in development.
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            // Boot script, docs/design/identity.md §5.2: data-theme only for a stored choice (otherwise the CSS
            // media query follows the OS); data-motion="full" is the only flag that arms motion. data-intro marks the
            // first full-motion load of the browser session, for the brand mark intro (R3-V14, §5.5 M26).
            __html: `(function(){var d=document.documentElement,r=null;
try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark')d.setAttribute('data-theme',t)}catch(e){}
try{r=localStorage.getItem('motion')}catch(e){}
if(r==='reduce')d.setAttribute('data-motion','reduce');
else if(window.matchMedia&&matchMedia('(prefers-reduced-motion: no-preference)').matches){d.setAttribute('data-motion','full');
try{if(!sessionStorage.getItem('brand-intro')){sessionStorage.setItem('brand-intro','1');d.setAttribute('data-intro','')}}catch(e){}}})()`,
          }}
        />
      </head>
      <body className="site-body antialiased">
        <div className="min-h-svh">{children}</div>
      </body>
    </html>
  );
}
